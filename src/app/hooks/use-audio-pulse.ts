/**
 * Пульс интерфейса под музыку.
 *
 * Единственный потребитель анализатора для «вау»-эффектов. Значения пишутся
 * в CSS-переменные на элемент-эффект, а НЕ в состояние React: 60 обновлений
 * состояния в секунду перерисовывали бы весь плеер-бар. CSS-переменные меняют
 * только те свойства, которые их читают (ореол полосы, transform обложки,
 * brightness кнопки) — то есть работает compositor, а не layout.
 *
 * Раскладка по полосам (fftSize 2048 → 1024 бина, ~86.7 Гц на бин):
 *   bass   ~20–170 Гц   → бины 0–2    (кик, бас-гитара)
 *   mid    ~170–2000 Гц → бины 2–23   (вокал, основной тон)
 *   treble выше 2 кГц не читается: и ореол полосы, и блик на кнопке гораздо
 *   лучше реагируют на низ, чем на тарелки.
 *
 * Всё переиспользует общий граф из features/player/audio-graph. Свой
 * AudioContext и createMediaElementSource здесь не создаются намеренно:
 * второй источник на тот же <audio> бросает InvalidStateError и ломает
 * ReplayGain до конца сессии.
 */

import { useEffect } from 'react'
import type { RefObject } from 'react'
import { getAnalyserNode } from '@/features/player/audio-graph'
import { useDopamineSettings } from '@/store/dopamine.store'
import { usePlayerIsPlaying, usePlayerRef } from '@/store/player.store'

/** Границы полос по бинам FFT. */
const BASS_END = 2
const MID_END = 23

/** Усреднение по диапазону бинов: сумма / (count * 255). */
function bandAverage(data: Uint8Array, from: number, to: number): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += data[i]
  return sum / ((to - from) * 255)
}

/**
 * Подписка элемента на значения пульса.
 *
 * @param target элемент, на который пишется --pulse. Эффект наследует
 *   переменную вниз по дереву, поэтому подписаться нужно на родителе
 *   (например, на обёртке полосы прогресса), а не на самом <audio>.
 * @param wantPulse тумблер этого конкретного эффекта. Выключенный эффект
 *   не подписывается вообще — иначе анализатор крутился бы вхолостую
 *   на страницах, где пульс никто не читает.
 */
export function useAudioPulseOn(
  target: RefObject<HTMLElement>,
  wantPulse: boolean,
) {
  const audioRef = usePlayerRef()
  const isPlaying = usePlayerIsPlaying()
  const { enabled, pulseIntensity } = useDopamineSettings()

  // target.current здесь НЕ проверяется намеренно: ref не вызывает
  // ререндер, поэтому проверка в рендере дала бы active=false навсегда
  // и эффект бы ни разу не стартовал. Внутри эффекта ref уже заполнен.
  const active = enabled && wantPulse && !!audioRef

  useEffect(() => {
    if (!active) return

    const host = target.current
    const element = audioRef as HTMLAudioElement | null
    if (!host || !element) return

    const analyser = getAnalyserNode(element)
    if (!analyser) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    let frame: number | null = null

    const write = (value: number, bass: number, mid: number) => {
      const k = pulseIntensity
      host.style.setProperty('--pulse', String(value * k))
      host.style.setProperty('--pulse-bass', String(bass * k))
      host.style.setProperty('--pulse-mid', String(mid * k))
    }

    const tick = () => {
      if (element.paused) {
        write(0, 0, 0)
        frame = null
        return
      }

      analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>)

      const bass = bandAverage(data, 0, BASS_END)
      const mid = bandAverage(data, BASS_END, MID_END)
      // Общий уровень для блика: середина весов, чтобы тихие треки не гасли.
      const level = bass * 0.55 + mid * 0.45

      write(level, bass, mid)
      frame = requestAnimationFrame(tick)
    }

    if (isPlaying) {
      frame = requestAnimationFrame(tick)
    } else {
      // Подписка остаётся живой: переменные обнулены, но как только
      // play нажмут, пульс оживёт без перемонтирования хука.
      write(0, 0, 0)
    }

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      host.style.removeProperty('--pulse')
      host.style.removeProperty('--pulse-bass')
      host.style.removeProperty('--pulse-mid')
    }
  }, [active, target, audioRef, isPlaying, pulseIntensity])
}
