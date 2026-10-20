/**
 * vibe.ts — контроллер фоновой анимации.
 *
 * Порт новое/vibe-animation/src/vibe.js на TypeScript. Логика, дефолты,
 * авто-подстройка качества и CSS-фолбэк перенесены как есть — шейдер и
 * разметка берутся из оригинала без правок.
 *
 * Отличия от оригинала, ровно четыре:
 *   1) типы вместо JS — проект собирается под strict;
 *   2) workerUrl с bust-параметром в dev: скрипт воркера кэшируется отдельно
 *      от обычных модулей, HMR его не инвалидирует, и правки шейдера не
 *      доезжают до экрана;
 *   3) feedAudio()/pulseReaction() — реакция на музыку и на лайк/дизлайк
 *      через тот же set(), что и слайдеры демо. Ничего нового для шейдера
 *      не добавляется, меняются только уже существующие параметры;
 *   4) getAnalyserNode() вместо document.querySelector('audio').
 *
 * Про Web Audio. Свой AudioContext и createMediaElementSource здесь не
 * создаются намеренно: второй источник на тот же <audio> бросает
 * InvalidStateError и ломает ReplayGain до конца сессии
 * (см. features/player/audio-graph.ts).
 */

export type VibeEngine = 'webgl' | 'css'

export interface VibeSettings {
  hueOffset: number
  speed: number
  scale: number
  intensity: number
  softness: number
  rays: number
  neon: number
  bend: number
  backgroundColor: string
  /** 0..1 средний уровень трека — гонит лучи (длина/яркость shafts). */
  energy: number
  /** 0..1 бас быстрой огибающей — удар: вытягивает и выпрямляет лучи. */
  beat: number
  /** 0..1 слой огня для жёстких жанров (языки пламени + угли). */
  fxFire: number
  /** 0..1 верхняя середина (скрим/громкий припев) — быстрая огибающая. */
  scream: number
}

export interface VibeOptions {
  engine?: 'auto' | 'webgl' | 'css'
  workerUrl?: string
  defaults?: Partial<VibeSettings>
  onLog?: (message: string, ...rest: unknown[]) => void
  onEngine?: (engine: VibeEngine) => void
  onFps?: (fps: number) => void
}

const DEFAULT_SETTINGS: VibeSettings = {
  hueOffset: 0,
  speed: 1,
  scale: 1,
  intensity: 1,
  softness: 0.45,
  rays: 0.3,
  neon: 0.85,
  bend: 1,
  backgroundColor: '#ffffff',
  energy: 0,
  beat: 0,
  fxFire: 0,
  scream: 0,
}

const NUMERIC_KEYS = [
  'hueOffset',
  'speed',
  'scale',
  'intensity',
  'softness',
  'rays',
  'neon',
  'bend',
  'energy',
  'beat',
  'fxFire',
  'scream',
] as const

/**
 * Бюджет пикселей и поведение на слабых машинах — из оригинала без
 * изменений: шейдер дорогой, и рендерить его вчетверо меньше пикселя
 * дешевле, чем получить мыло на слабой машине.
 */
const MAX_PIXELS = 250_000
const MIN_SCALE = 0.2
const MAX_SCALE = 1
const DPR_CAP = 1.5

/* ------------------------------------------------- движение под музыку */

/**
 * Реакция на музыку сделана только через те параметры, что уже есть в
 * шейдере (speed, intensity, neon, scale) — ни одной правки в воркере.
 *
 * Приём: доля секунды между опросами анализатора.
 * Замедление на паузе: доля секунды, за которую цель достигается.
 */
const SAMPLE_MS = 40
const PAUSE_LAG = 2.2
const PLAY_LAG = 6

/** Множители на паузе: движение вязнет и картинка притихает.
 *  v3: FADE 0.88 вместо 0.82 — на паузе волна дышит, а не гаснет. */
const PAUSE_SPEED = 0.4
const PAUSE_FADE = 0.88

/**
 * Динамика читается в децибелах, а не байтах.
 *
 * getByteFrequencyData переводит minDecibels..maxDecibels в 0..255, и на
 * громком треке всё упирается в 255. Тогда bass, mid и level приходят как
 * 0.83/0.86/0.84 одновременно — то есть «постоянно орёт», никакой реакции на
 * музыку. Своё окно -75..-25 дБ возвращает настоящий размах.
 */
const FLOOR_DB = -75
const CEIL_DB = -25

/** Границы полос по бинам FFT (2048, бин ~23 Гц на 48 кГц):
 *  бас — кик/низ (~0-70 Гц), середина — тело гитар и голоса,
 *  скрим — верхняя середина (~0.9-5 кГц): скрим, тарелки, грязь припева. */
const BASS_END = 2
const MID_END = 23
const SCREAM_FROM = 40
const SCREAM_TO = 220

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function createVibe(container: HTMLElement, options: VibeOptions = {}) {
  const onLog = options.onLog ?? (() => {})
  const onEngine = options.onEngine ?? (() => {})
  const onFps = options.onFps ?? (() => {})

  const mode = options.engine ?? 'auto'
  const reduced = prefersReducedMotion()

  let engine: VibeEngine =
    mode === 'css'
      ? 'css'
      : mode === 'webgl'
        ? 'webgl'
        : detectWebGL()
          ? 'webgl'
          : 'css'

  const settings: VibeSettings = {
    ...DEFAULT_SETTINGS,
    ...(options.defaults ?? {}),
  }

  let enabled = !reduced
  let host: HTMLElement | null = null
  let worker: Worker | null = null
  let renderScale = 1
  let visible = true
  let onScreen = true

  let analyser: AnalyserNode | null = null
  let bins: Float32Array | null = null
  let audioRaf = 0
  let lastSample = 0
  let lastSampleAt = 0
  const bands = { bass: 0, mid: 0, level: 0, scream: 0 }

  const ro =
    'ResizeObserver' in window ? new ResizeObserver(() => resize()) : null
  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          ([entry]) => {
            onScreen = entry.isIntersecting
            syncVisibility()
          },
          { threshold: 0 },
        )
      : null

  const onVisibilityChange = () => {
    visible = !document.hidden
    syncVisibility()
  }

  /* --------------------------------------------------- фон / видимость */

  function syncVisibility() {
    const shouldRun = enabled && visible && onScreen

    if (engine === 'webgl') {
      worker?.postMessage({ type: shouldRun ? 'enable' : 'disable' })
      if (shouldRun) ensureAudioLoop()
      else stopAudioLoop()
    } else if (host) {
      host.classList.toggle('vibe--disabled', !shouldRun)
    }
  }

  /* ------------------------------------------------------------------ CSS */

  const BLOB_COUNT = 6

  function buildCss() {
    const el = document.createElement('div')
    el.className = 'vibe-css'
    el.setAttribute('aria-hidden', 'true')

    for (let i = 0; i < BLOB_COUNT; i++) {
      const b = document.createElement('span')
      b.className = `vibe-css__blob vibe-css__blob--${i + 1}`
      el.appendChild(b)
    }

    container.prepend(el)
    host = el
    applyCssSettings()
  }

  function applyCssSettings() {
    if (!host) return
    // без единиц: складывается с углом в calc(322deg + var(--vibe-hue))
    host.style.setProperty('--vibe-hue', String(Math.round(settings.hueOffset * 360)))
    host.style.setProperty('--vibe-speed', String(Math.max(0.0001, settings.speed)))
    host.style.setProperty(
      '--vibe-opacity',
      String(Math.max(0, Math.min(1.6, settings.intensity))),
    )
    host.style.setProperty('--vibe-blur', `${Math.round(40 + settings.softness * 60)}px`)
    host.style.setProperty('--vibe-scale', String(settings.scale))
    host.style.setProperty('--vibe-bg', settings.backgroundColor)
    // Музыка в CSS-фолбэке: неон и уровень читаются из CSS (saturate/
    // brightness/opacity), бит и скрим — из --vibe-beat/--vibe-scream
    // (пульс контейнера берёт максимум из них).
    // Без них WebGL реагирует на анализатор, а CSS стоит как вкопанный.
    host.style.setProperty('--vibe-neon', String(settings.neon))
    host.style.setProperty('--vibe-beat', String(bands.bass))
    host.style.setProperty('--vibe-scream', String(bands.scream))
    host.style.setProperty('--vibe-level', String(bands.level))
  }

  /* ---------------------------------------------------------------- WebGL */

  function bufferSize(rect: DOMRect) {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
    const area = Math.max(1, rect.width * rect.height)

    const budget = Math.sqrt(MAX_PIXELS / area)
    const effective = Math.min(dpr * renderScale, budget)

    return {
      width: Math.max(1, Math.round(rect.width * effective)),
      height: Math.max(1, Math.round(rect.height * effective)),
    }
  }

  function pushResize() {
    if (engine !== 'webgl' || !worker) return

    const rect = container.getBoundingClientRect()
    const { width, height } = bufferSize(rect)

    worker.postMessage({ type: 'resize', width, height, dpr: 1 })
  }

  /**
   * Адрес воркера. В dev обязателен мусорный query: скрипт воркера браузер
   * кэширует отдельно от обычных модулей и HMR его не инвалидирует, так
   * что без параметра правки шейдера не доезжают до экрана.
   */
  function workerUrl(): string {
    if (options.workerUrl) return options.workerUrl
    const url = new URL('./vibe-worker.js', import.meta.url)
    if (import.meta.env.DEV) url.searchParams.set('t', String(Date.now()))
    return url.href
  }

  function buildWebGL(): boolean {
    const canvas = document.createElement('canvas')
    canvas.className = 'vibe'
    canvas.setAttribute('aria-hidden', 'true')
    container.prepend(canvas)

    const rect = container.getBoundingClientRect()
    const { width, height } = bufferSize(rect)

    let offscreen: OffscreenCanvas
    try {
      offscreen = canvas.transferControlToOffscreen()
    } catch (err) {
      onLog('transferControlToOffscreen недоступен:', String(err))
      canvas.remove()
      return false
    }

    worker = new Worker(workerUrl())

    worker.onmessage = (ev: MessageEvent) => {
      const m = (ev.data ?? {}) as {
        type?: string
        error?: string
        fps?: number
        rev?: number
      }
      if (m.type === 'error') {
        onLog('worker error:', m.error)
        engine = 'css'
        onEngine(engine)
        worker?.terminate()
        worker = null
        canvas.remove()
        buildCss()
      } else if (m.type === 'rev' && typeof m.rev === 'number') {
        // Ревизия шейдера в консоли: видно, какая версия реально крутится,
        // а не закэшированная сборка.
        onLog(`vibe worker rev ${m.rev}`)
      } else if (m.type === 'fps' && typeof m.fps === 'number') {
        onFps(m.fps)
        autoTune(m.fps)
      }
    }

    worker.onerror = (e) => {
      onLog('worker onerror:', e.message || String(e))
    }

    worker.postMessage(
      {
        type: 'init',
        canvas: offscreen,
        width,
        height,
        dpr: 1,
        backgroundColor: settings.backgroundColor,
      },
      [offscreen],
    )

    host = canvas
    applySettings()
    if (!enabled) worker.postMessage({ type: 'disable' })
    return true
  }

  /**
   * Если кадры не успевают — уменьшаем разрешение, если есть запас —
   * возвращаем обратно. Из оригинала без изменений.
   */
  let lastTune = 0
  let autoTuneOn = true
  let pendingCheck: { from: number; fpsBefore: number } | null = null

  function autoTune(fps: number) {
    if (!autoTuneOn) return

    const now = performance.now()
    if (now - lastTune < 1500) return

    if (pendingCheck) {
      const helped = fps > pendingCheck.fpsBefore * 1.15
      lastTune = now

      if (!helped) {
        renderScale = pendingCheck.from
        autoTuneOn = false
        onLog('разрешение не влияет на fps — авто-подстройка выключена')
        pushResize()
      }

      pendingCheck = null
      return
    }

    lastTune = now

    let next = renderScale
    if (fps < 22) next = Math.max(MIN_SCALE, renderScale - 0.15)
    else if (fps > 48) next = Math.min(MAX_SCALE, renderScale + 0.1)

    if (Math.abs(next - renderScale) > 0.01) {
      pendingCheck = { from: renderScale, fpsBefore: fps }
      renderScale = next
      onLog(`авто-качество: буфер ${(renderScale * 100).toFixed(0)}% (${fps} fps)`)
      pushResize()
    }
  }

  function applySettings() {
    if (engine === 'webgl') {
      if (worker) worker.postMessage({ type: 'settings', payload: settings })
    } else {
      applyCssSettings()
    }
  }

  /* ------------------------------------------------- движение под музыку */

  /**
   * База без музыкальной добавки. Всё, что видит глаз, считается от неё,
   * поэтому перенос трека и снятие лайка не накапливают ошибку.
   */
  const base: VibeSettings = { ...settings }
  let paused = false
  let impulse = 0
  /**
   * Сглаженная база неона: смена жанра/лайка меняет base.neon скачком,
   * а settings.neon пересчитывается каждый тик от базы — без этого
   * неон прыгал бы за один кадр. Тянем к цели тем же ease, что и hue.
   */
  let smoothNeonBase = base.neon
  /** Сглаженная база лучей: genre-пресет меняет base.rays скачком,
      а settings.rays каждый тик считается от базы — напрямую тянуть
      settings.rays бесполезно (перезапишется), тянем базу. */
  let smoothRaysBase = base.rays
  /**
   * Быстрая огибающая баса для удара: атака резкая (кик пинает лучи
   * и фазу полос), спад плавный. Медленная bands.bass для этого
   * слишком ватная — бит опаздывал бы на полсекунды.
   */
  let beatFast = 0
  /**
   * Замедление и притихание — не переключатели, а числа, которые едут к
   * цели. Иначе на паузе множитель скачет с 1 на 0.4 одним кадром, и это
   * тот самый резкий переход от яркого к тусклому.
   */
  let slow = 1
  let fade = 1
  /** Быстрая огибающая скрима: атака резкая, спад плавный — как у бита. */
  let screamFast = 0

  /** Энергия полосы в дБ, переведённая в 0..1 по своему окну.
   *  peak=true — берём максимум бина, а не среднее: скрим узкополосный
   *  (форманты + гармоники дисторшна), среднее по 180 бинам его топит. */
  function bandDb(from: number, to: number, peak = false): number {
    if (!bins) return 0
    let sum = 0
    let n = 0
    let max = -Infinity
    for (let i = from; i < to; i++) {
      // Тихие бины отдают -Infinity — их в сумму пускать нельзя.
      if (Number.isFinite(bins[i])) {
        sum += bins[i]
        n++
        if (bins[i] > max) max = bins[i]
      }
    }
    if (n === 0) return 0
    const v = peak ? max : sum / n
    return clamp01((v - FLOOR_DB) / (CEIL_DB - FLOOR_DB))
  }

  function setQuiet(patch: Partial<VibeSettings>) {
    for (const k of NUMERIC_KEYS) {
      const v = patch[k]
      if (v !== undefined && !Number.isNaN(Number(v))) settings[k] = Number(v)
    }
  }

  /**
   * Единственный кадр реакции на музыку.
   *
   * Всё идёт через те параметры, что уже есть в шейдере: speed, intensity,
   * neon, scale. Ни одной правки в воркере.
   *
   * Форму пятна не трогаем намеренно: если удар входит в границу, каждый
   * кик дёргает силуэт, и ровная картинка читается как заикание. Движение
   * даёт скорость течения (speed) — она меняется плавно и глазом читается
   * как «живёт», а не как «дёргается».
   *
   * На паузе цель — нули: музыка спадает, течение замедляется и картинка
   * гаснет. Отдельного кода для этого не нужно, всё то же самое.
   */
  function tick() {
    audioRaf = requestAnimationFrame(tick)

    const now = performance.now()
    const dt = Math.min(0.2, (now - lastSample) / 1000)
    if (dt <= 0) {
      lastSample = now
      return
    }
    lastSample = now
    if (now - lastSampleAt < SAMPLE_MS) return

    const target = { bass: 0, mid: 0, level: 0, scream: 0 }
    if (analyser && bins && !paused) {
      analyser.getFloatFrequencyData(bins as Float32Array<ArrayBuffer>)
      target.bass = bandDb(0, BASS_END)
      target.mid = bandDb(BASS_END, MID_END)
      target.scream = bandDb(SCREAM_FROM, SCREAM_TO, true)
      target.level = target.bass * 0.55 + target.mid * 0.45
    }

    // Подъём быстрее спада: на паузе полосы уходят вниз медленно, и это
    // как раз то плавное угасание, которое нужно.
    const lag = Math.min(1, dt * (paused ? PAUSE_LAG : PLAY_LAG))
    bands.bass += (target.bass - bands.bass) * lag
    bands.mid += (target.mid - bands.mid) * lag
    bands.level += (target.level - bands.level) * lag
    bands.scream += (target.scream - bands.scream) * lag

    impulse *= Math.exp(-dt * 2.2)

    // Замедление и притихание едут к своей цели тем же способом.
    const ease = Math.min(1, dt * 1.4)
    slow += ((paused ? PAUSE_SPEED : 1) - slow) * ease
    fade += ((paused ? PAUSE_FADE : 1) - fade) * ease

    // Оттенок едет к цели, а не прыгает. Смена трека меняет палитру сразу,
    // и без этого картинка перекрашивается за один кадр.
    const hueDiff = base.hueOffset - settings.hueOffset
    if (Math.abs(hueDiff) > 0.0005) {
      settings.hueOffset += hueDiff * Math.min(1, dt * 1.6)
    }

    // Форма пятна (bend/softness) едет к цели: пресеты настроения
    // по жанру меняют базу скачком, резкий переход читался бы как подмена.
    // rays/neon идут через сглаженные базы ниже — их settings каждый тик
    // пересчитывается от базы с музыкальной добавкой.
    const shapeEase = Math.min(1, dt * 2.2)
    for (const k of ['bend', 'softness', 'fxFire'] as const) {
      const d = base[k] - settings[k]
      if (Math.abs(d) > 0.0005) settings[k] += d * shapeEase
    }
    // Неон и лучи сглаживаем через базы: settings каждый тик считается
    // от базы с музыкальной добавкой, напрямую его тянуть бесполезно.
    smoothNeonBase += (base.neon - smoothNeonBase) * Math.min(1, dt * 2.2)
    smoothRaysBase += (base.rays - smoothRaysBase) * Math.min(1, dt * 2.2)

    // Быстрый бит v3: атака резкая (кик пинает за ~55мс), спад плавный.
    // Было dt*8 — бит опаздывал на полсекунды и читался как вата.
    const beatLag = target.bass > beatFast ? Math.min(1, dt * 18) : Math.min(1, dt * 3.5)
    beatFast += (target.bass - beatFast) * beatLag
    // Скрим: та же огибающая, но от верхней середины. Крикнул — вспыхнуло.
    const screamLag = target.scream > screamFast ? Math.min(1, dt * 14) : Math.min(1, dt * 3)
    screamFast += (target.scream - screamFast) * screamLag

    setQuiet({
      // v3 — погружение: музыка едет в скорость, неон и лучи.
      // Поле и петли остаются эмбиентом (константы), иначе всё
      // дёргается хором — капустный калейдоскоп.
      speed: base.speed * slow * (1 + bands.level * 0.45 + beatFast * 0.25 + screamFast * 0.15),
      intensity: base.intensity * (1 + impulse * 0.3 + bands.level * 0.25) * fade,
      neon: smoothNeonBase * (1 + bands.level * 0.3 + beatFast * 0.2 + screamFast * 0.2),
      scale: base.scale * (1 + bands.bass * 0.05 + beatFast * 0.04),
      // Лучи — главный реактивный слой: длина от бита, яркость от уровня,
      // плюс вспышки от скрима (нечётные shafts в шейдере).
      rays: smoothRaysBase * (1 + bands.level * 0.3 + beatFast * 0.35 + screamFast * 0.25),
      // Энергия, удар и скрим едут в шейдер напрямую (длина/яркость shafts).
      energy: bands.level,
      beat: beatFast,
      scream: screamFast,
    })
    applySettings()
  }

  function ensureAudioLoop() {
    if (audioRaf) return
    lastSample = 0
    lastSampleAt = 0
    audioRaf = requestAnimationFrame(tick)
  }

  function stopAudioLoop() {
    if (!audioRaf) return
    cancelAnimationFrame(audioRaf)
    audioRaf = 0
  }

  /* --------------------------------------------------------------- public */

  function resize() {
    if (engine !== 'webgl') return
    pushResize()
  }

  function setEnabled(on: boolean) {
    enabled = !!on
    syncVisibility()
  }

  /** Узел из общего графа (features/player/audio-graph), не свой. */
  function bindAnalyser(node: AnalyserNode | null) {
    analyser = node
    bins = node ? new Float32Array(node.frequencyBinCount) : null
    ensureAudioLoop()
  }

  /**
   * Пауза. Анализатор остаётся подключённым намеренно: на паузе он молчит,
   * полосы уходят в ноль, течение замедляется и картинка гаснет сама.
   * Если отключить узел, значения застынут на последних и угасания не будет.
   */
  function setPaused(on: boolean) {
    paused = !!on
    ensureAudioLoop()
  }

  /** Лайк/дизлайк: короткий импульс яркости. Оттенок — через set().
   *  v3.1: импульс 0.7 вместо 1 — единица пересвечивала. */
  function pulseReaction() {
    impulse = 0.7
    ensureAudioLoop()
  }

  const instance = {
    get engine(): VibeEngine {
      return engine
    },
    get settings(): VibeSettings {
      return { ...settings }
    },

    set(patch: Partial<VibeSettings> = {}) {
      for (const k of NUMERIC_KEYS) {
        const v = patch[k]
        if (v !== undefined && !Number.isNaN(Number(v))) {
          settings[k] = Number(v)
        }
      }
      if (patch.backgroundColor !== undefined) {
        settings.backgroundColor = patch.backgroundColor
      }
      // Запоминаем как базу: музыка домножается поверх неё, иначе каждая
      // выборка закрепляла бы добавку и значения разъезжались вверх.
      for (const k of NUMERIC_KEYS) {
        const v = patch[k]
        if (v !== undefined && !Number.isNaN(Number(v))) base[k] = Number(v)
      }
      ensureAudioLoop()
      applySettings()
      return instance
    },

    setEnabled,
    resize,
    bindAnalyser,
    setPaused,
    pulseReaction,

    destroy() {
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stopAudioLoop()
      worker?.postMessage({ type: 'dispose' })
      worker?.terminate()
      worker = null
      host?.remove()
      host = null
      analyser = null
      bins = null
    },
  }

  if (engine === 'webgl' && !buildWebGL()) {
    engine = 'css'
    buildCss()
  } else if (engine === 'css') {
    buildCss()
  }

  onEngine(engine)

  ro?.observe(container)
  io?.observe(container)
  document.addEventListener('visibilitychange', onVisibilityChange)
  ensureAudioLoop()
  syncVisibility()

  return instance
}

export type VibeInstance = ReturnType<typeof createVibe>