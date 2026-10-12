/**
 * Единый владелец Web Audio графа.
 *
 * Раньше к одному и тому же <audio> подключались три независимых потребителя:
 *   1. use-audio-context      → createMediaElementSource (свой AudioContext)
 *   2. fullscreen/visualizer  → document.querySelector('audio') → свой AudioContext
 *   3. web-audio-provider     → GainNode в никуда (мёртвый код)
 *
 * Браузер разрешает ОДИН MediaElementSource на элемент. Второй вызов бросает
 * InvalidStateError, а resetRefs() нуллил ref'ы, не разрывая ассоциацию
 * element<->source в браузере — то есть ломала звук до конца сессии.
 *
 * Здесь ровно один источник на элемент (WeakMap), создание идемпотентно,
 * любая ошибка деградирует в element.volume вместо исключения.
 */

import { logger } from '@/utils/logger'

export type AudioGraph = {
  element: HTMLAudioElement
  context: AudioContext
  source: MediaElementAudioSourceNode
  gain: GainNode
  analyser: AnalyserNode
  /** Последняя запрошенная громкость. Нужна fadeIn, чтобы знать цель. */
  baseGain: number
}

const graphs = new WeakMap<HTMLAudioElement, AudioGraph>()

/** Элементы, на которых createMediaElementSource упал. Больше не пробуем. */
const unusable = new WeakSet<HTMLAudioElement>()

/** Реестр для подчистки контекстов отмонтированных элементов. */
const registry = new Set<AudioGraph>()
const warned = new WeakSet<HTMLAudioElement>()

/** Закрывает контексты элементов, которых больше нет в DOM. */
function sweep() {
  for (const graph of registry) {
    if (graph.element.isConnected) continue
    try {
      graph.gain.disconnect()
      graph.analyser.disconnect()
      graph.source.disconnect()
    } catch {
      /* уже отсоединено */
    }
    void graph.context.close().catch(() => undefined)
    registry.delete(graph)
  }
}

/**
 * Возвращает граф для элемента, создавая его при первом обращении.
 * null — если Web Audio недоступен или элемент уже занят другим контекстом.
 */
export function getAudioGraph(
  element?: HTMLAudioElement | null,
): AudioGraph | null {
  if (!element) return null

  const cached = graphs.get(element)
  if (cached) return cached
  if (unusable.has(element)) return null
  if (typeof window === 'undefined' || !('AudioContext' in window)) {
    unusable.add(element)
    return null
  }

  sweep()

  try {
    const context = new AudioContext({ latencyHint: 'playback' })
    const source = context.createMediaElementSource(element)
    const gain = context.createGain()
    const analyser = context.createAnalyser()

    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8

    // Стартуем с текущей громкостью элемента, иначе первое применение даёт
    // скачок. Ниже элемент принудительно уходит в 1.
    gain.gain.value = element.volume

    source.connect(gain)
    gain.connect(analyser)
    analyser.connect(context.destination)

    const graph: AudioGraph = {
      element,
      context,
      source,
      gain,
      analyser,
      baseGain: gain.gain.value,
    }
    graphs.set(element, graph)
    registry.add(graph)

    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined)
    }

    return graph
  } catch (err) {
    // Элемент уже связан с другим MediaElementSource — не трогаем звук,
    // просто живём без ReplayGain и без визуализатора.
    unusable.add(element)
    if (!warned.has(element)) {
      warned.add(element)
      logger.warn(
        'Audio graph unavailable for element, falling back to element volume',
        err,
      )
    }
    return null
  }
}

/**
 * Единственное место в приложении, которое задаёт громкость.
 *
 * Громкость применяется и на элементе, и на gain-узле, то есть итог — v².
 * Здесь это разведено: при живом графе элемент всегда 1 и вся громкость в
 * gain, без графа — напрямую в элемент.
 *
 * setTargetAtTime вместо setValueAtTime — плавная подстройка без щелчка.
 */
export function applyGain(
  element: HTMLAudioElement | null | undefined,
  value: number,
  ramp = 0.02,
): void {
  if (!element) return

  const target = Math.max(0, Math.min(1, value))
  const graph = getAudioGraph(element)

  if (!graph) {
    element.volume = target
    return
  }

  // Иначе громкость умножается дважды.
  element.volume = 1

  graph.baseGain = target

  const gainParam = graph.gain.gain
  const now = graph.context.currentTime
  gainParam.cancelScheduledValues(now)
  gainParam.setTargetAtTime(target, now, ramp)
}

/**
 * Плавный вход громкости на треке.
 *
 * Заменяет прежний кроссфейд на втором элементе `new Audio()`: тот брал
 * nextVolume = 0 (элемент заранее заглушали), из-за чего следующий трек
 * навсегда оставался беззвучным, а сам сервис подменял currentAudio на
 * чужой элемент и рассинхронизировался с плеером.
 *
 * Работает на единственном элементе плеера через общий граф.
 */
export function fadeIn(
  element: HTMLAudioElement | null | undefined,
  fromRatio = 0.3,
  durationMs = 1400,
): void {
  const graph = getAudioGraph(element)
  if (!graph) return

  const target = graph.baseGain
  if (target <= 0) return

  const gainParam = graph.gain.gain
  const now = graph.context.currentTime
  const seconds = Math.max(0.05, durationMs / 1000)

  gainParam.cancelScheduledValues(now)
  gainParam.setValueAtTime(target * fromRatio, now)
  gainParam.linearRampToValueAtTime(target, now + seconds)
}

/** Возобновляет контекст после autoplay-блокировки. */
export async function resumeAudioGraph(
  element?: HTMLAudioElement | null,
): Promise<void> {
  const graph = getAudioGraph(element)
  if (!graph) return
  if (graph.context.state === 'suspended') {
    await graph.context.resume().catch(() => undefined)
  }
  if (graph.context.state === 'closed') {
    unusable.add(element as HTMLAudioElement)
  }
}

/**
 * Линейные рампы громкости на двух элементах одновременно.
 *
 * applyGain использует setTargetAtTime — он асимптотический, значение
 * никогда не достигает цели точно. Для кроссфейда это неприемлемо: на
 * пересечении кривых громкость проваливается и слышен щелчок. Здесь
 * linearRampToValueAtTime от now до now + seconds.
 *
 * Возвращает время окончания рампы в секундах AudioContext.
 */
export function crossfadeGains(
  from: HTMLAudioElement | null | undefined,
  to: HTMLAudioElement | null | undefined,
  fromTarget: number,
  toTarget: number,
  seconds: number,
): number {
  const a = getAudioGraph(from)
  const b = getAudioGraph(to)
  const dur = Math.max(0.01, seconds)
  const start = Math.max(a?.context.currentTime ?? 0, b?.context.currentTime ?? 0)

  for (const [graph, target] of [
    [a, fromTarget],
    [b, toTarget],
  ] as const) {
    if (!graph) continue
    const param = graph.gain.gain
    param.cancelScheduledValues(start)
    param.setValueAtTime(param.value, start)
    param.linearRampToValueAtTime(
      Math.max(0, Math.min(1, target)),
      start + dur,
    )
    if (graph === a) graph.baseGain = fromTarget
    if (graph === b) graph.baseGain = toTarget
  }

  return start + dur
}

/** Мгновенно ставит громкость элемента без рампы (смена роли при передаче). */
export function setGainNow(
  element: HTMLAudioElement | null | undefined,
  value: number,
): void {
  const graph = getAudioGraph(element)
  if (!graph) {
    if (element) element.volume = Math.max(0, Math.min(1, value))
    return
  }
  const now = graph.context.currentTime
  graph.gain.gain.cancelScheduledValues(now)
  graph.gain.gain.setValueAtTime(Math.max(0, Math.min(1, value)), now)
  graph.baseGain = value
}

/** Узел для визуализатора. Создаёт граф, если его ещё нет. */
export function getAnalyserNode(
  element?: HTMLAudioElement | null,
): AnalyserNode | null {
  return getAudioGraph(element)?.analyser ?? null
}

/** Есть ли рабочий граф. Для UI: показывать ли визуализатор. */
export function hasAudioGraph(element?: HTMLAudioElement | null): boolean {
  return getAudioGraph(element) !== null
}