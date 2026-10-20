/**
 * Локальные пилюли «Моей волны» из localStorage.
 *
 * Отдельный модуль, потому что ключ 'my-wave-settings' читают несколько
 * мест (главная, герой, автопродление), и каждый раз парсить JSON
 * вручную — это способ разъехаться. Здесь одна функция на всех.
 *
 * Формат: {activity?, characteristic?, mood?, language?} — коды, которые
 * понимает мозг (mood/activity из GET /api/wave/options).
 */
export const WAVE_SETTINGS_KEY = 'my-wave-settings'

export interface LocalWaveSettings {
  activity?: string
  characteristic?: string
  mood?: string
  language?: string
}

/** Прочитать пилюли. Любая ошибка — пустой объект (волна просто без контекста). */
export function readLocalWaveSettings(): LocalWaveSettings {
  try {
    const raw = localStorage.getItem(WAVE_SETTINGS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: LocalWaveSettings = {}
    for (const k of ['activity', 'characteristic', 'mood', 'language'] as const) {
      const v = parsed[k]
      if (typeof v === 'string' && v.trim()) out[k] = v.trim()
    }
    return out
  } catch {
    return {}
  }
}
