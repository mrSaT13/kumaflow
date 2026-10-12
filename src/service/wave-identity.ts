/**
 * Природа ленты: «это Моя волна или нет».
 *
 * Проверка по имени плейлита была зашита в трёх местах (player.store, handoff,
 * player.tsx) и разъезжалась. Плюс имя обрезается при handoff — принимающее
 * устройство получало «Продолжить · Телефон» и переставало понимать, что
 * продолжает волну: isMyWave становился false, шапка показывала
 * «Воспроизвести», а открытия переставали писаться.
 *
 * Поэтому источник истины здесь — состав очереди (my-wave-last), а не имя.
 * Имя — только подсказка.
 */

export type WaveSource = 'local' | 'brain'

export const WAVE_CTX_KEY = 'my-wave-last'

export interface WaveContext {
  ids: string[]
  hint: string
  source: WaveSource
  at: number
}

/** Запоминаем, что именно сейчас играет Волна. */
export function saveWaveContext(
  ids: string[],
  hint: string,
  source: WaveSource,
): void {
  try {
    const ctx: WaveContext = {
      ids: (ids ?? []).slice(0, 100),
      hint,
      source,
      at: Date.now(),
    }
    localStorage.setItem(WAVE_CTX_KEY, JSON.stringify(ctx))
  } catch {
    /* приватный режим / переполнение — не критично */
  }
}

export function readWaveContext(): WaveContext | null {
  try {
    const raw = localStorage.getItem(WAVE_CTX_KEY)
    if (!raw) return null
    const ctx = JSON.parse(raw) as WaveContext
    if (!ctx || !Array.isArray(ctx.ids)) return null
    return ctx
  } catch {
    return null
  }
}

/** Моя волна по имени плейлиста. Имена приходят и по-русски, и по-английски. */
export function isWavePlaylistName(name?: string | null): boolean {
  const n = (name ?? '').toLowerCase().trim()
  if (!n) return false
  return (
    n.includes('моя волна') ||
    n.includes('mywave') ||
    n.includes('my wave') ||
    n.includes('в стиле') ||
    n.includes('по треку')
  )
}

// ==================== Сид волны: «В стиле: Reamonn» ====================
//
// Радио по артисту/треку — это не обычная волна с пилюлями, а лента,
// посаженная на сид. Яндекс в этом случае меняет подпись в ховере и в
// фуллскрине на «В стиле: <артист>», и не показывает пилюли настроения
// вообще — иначе «Работаю» противоречит «В стиле: Reamonn».
//
// Сид живёт отдельно от настроек: у него своя кнопка сброса (× у
// капсулы), и обычный запуск волны обязан его гасить, иначе капсула
// продолжит врать.

export interface WaveSeed {
  kind: 'artist' | 'track'
  label: string
}

export const WAVE_SEED_KEY = 'my-wave-seed'

export function saveWaveSeed(seed: WaveSeed | null): void {
  try {
    if (!seed || !seed.label) {
      localStorage.removeItem(WAVE_SEED_KEY)
      return
    }
    localStorage.setItem(
      WAVE_SEED_KEY,
      JSON.stringify({ kind: seed.kind, label: seed.label, at: Date.now() }),
    )
  } catch {
    /* приватный режим / переполнение — не критично */
  }
}

export function readWaveSeed(): WaveSeed | null {
  try {
    const raw = localStorage.getItem(WAVE_SEED_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as WaveSeed
    if (!s?.label) return null
    return {
      kind: s.kind === 'track' ? 'track' : 'artist',
      label: String(s.label),
    }
  } catch {
    return null
  }
}

/** Сорвать сид — обычный запуск волны. Иначе капсула продолжит врать. */
export function clearWaveSeed(): void {
  try {
    localStorage.removeItem(WAVE_SEED_KEY)
  } catch {
    /* игнор */
  }
}

/** Подпись сида ровно как у Яндекса. Пустая строка — сида нет. */
export function seedLabel(seed: WaveSeed | null): string {
  if (!seed?.label) return ''
  return seed.kind === 'track'
    ? `По треку: ${seed.label}`
    : `В стиле: ${seed.label}`
}

/** Доля совпадения id очереди с сохранённой волной. */
export function waveOverlap(ids: string[], ctx: WaveContext | null): number {
  if (!ctx || ctx.ids.length === 0 || !ids || ids.length === 0) return 0
  const saved = new Set(ctx.ids)
  let hit = 0
  for (const id of ids) if (saved.has(id)) hit++
  return hit / Math.min(ids.length, ctx.ids.length)
}

export interface WaveDetection {
  isWave: boolean
  /** Чем пришли к выводу: имя пришло или состав очереди. */
  via: 'name' | 'queue' | 'none'
  overlap: number
  ctx: WaveContext | null
}

/**
 * Волна ли эта очередь.
 *
 * Сначала верим имени — оно точнее. Если имени нет (handoff его обрезает),
 * определяем по составу: у заведомо волновой очереди пересечение с
 * my-wave-last большое, у случайной — почти нулевое. Порог 0.5 означает
 * «половина очереди та же самая», что для подборки из 20–50 треков
 * однозначно указывает на ту же волну, а не на случайное совпадение.
 */
export function detectWaveQueue(
  ids: string[],
  playlistName?: string | null,
): WaveDetection {
  const ctx = readWaveContext()
  if (isWavePlaylistName(playlistName)) {
    return { isWave: true, via: 'name', overlap: 1, ctx }
  }
  const ov = waveOverlap(ids ?? [], ctx)
  if (ov >= 0.5) {
    return { isWave: true, via: 'queue', overlap: ov, ctx }
  }
  return { isWave: false, via: 'none', overlap: ov, ctx }
}

/**
 * Принять очередь за волну: восстановить контекст и вернуть имя,
 * которым её надо пометить. Исходное имя вида «Продолжить · Телефон»
 * сохраняем, чтобы было видно, откуда пришло.
 */
export function adoptWaveQueue(
  ids: string[],
  playlistName: string,
): { playlistName: string; detection: WaveDetection } {
  const detection = detectWaveQueue(ids, playlistName)
  if (!detection.isWave) return { playlistName, detection }
  const hint = detection.ctx?.hint ?? ''
  saveWaveContext(ids, hint, detection.ctx?.source ?? 'brain')
  // Имя «Продолжить · Телефон» оставляем — оно информативно, — но волну
  // помечаем, чтобы isMyWave сработал по имени.
  const name = /моя волна|mywave|my wave/i.test(playlistName)
    ? playlistName
    : `${playlistName} · Моя волна`
  return { playlistName: name, detection }
}
