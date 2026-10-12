/**
 * My Wave Settings - Настройки "Моя Волна"
 * Модальное окно с настройками персонализации
 */

import { useState, useEffect } from 'react'
import type { ComponentType } from 'react'
import { useML } from '@/store/ml.store'
import { isBrainActive } from '@/store/brain.store'
import { toast } from 'react-toastify'
import {
  X, RefreshCw, Heart, Sparkles, Zap, Music, Mic, Cpu, MonitorSmartphone,
  Sunrise, Car, Laptop, Dumbbell, MoonStar, Languages, Globe, Loader2,
  BookOpen, Footprints, PartyPopper, Coffee, CloudRain, Waves,
  Flame, Smile, AlertTriangle, Rocket, ChevronDown,
} from 'lucide-react'
import { waveSettingsGet, waveSettingsPut, waveOptions } from '@/service/brain-wave'

export const WAVE_SOURCE_KEY = 'my-wave-source'
// Тип переехал в service/wave-identity — там же контекст волны и её распознавание.
import type { WaveSource } from '@/service/wave-identity'

export function getWaveSource(): WaveSource {
  try {
    return localStorage.getItem(WAVE_SOURCE_KEY) === 'brain' ? 'brain' : 'local'
  } catch {
    return 'local'
  }
}

/** Человеческие подписи вместо сырых ключей (wakeup/work/unfamiliar/...) */
export const WAVE_LABELS: Record<string, string> = {
  wakeup: 'Просыпаюсь',
  commute: 'В дороге',
  work: 'Работаю',
  workout: 'Тренируюсь',
  sleep: 'Засыпаю',
  favorite: 'Любимое',
  unfamiliar: 'Незнакомое',
  popular: 'Популярное',
  energetic: 'Бодрое',
  happy: 'Весёлое',
  calm: 'Спокойное',
  sad: 'Грустное',
  russian: 'Русский',
  foreign: 'Иностранный',
  instrumental: 'Без слов',
}

export function waveLabel(key: string): string {
  return WAVE_LABELS[key] || key
}

// Коды занятий/настроений, которых нет в WAVE_LABELS (сервер присылает свои)
Object.assign(WAVE_LABELS, {
  study: 'Учёба / фокус',
  walk: 'Прогулка',
  party: 'Вечеринка',
  rest: 'Отдых',
  workout_session: 'Тренировка',
  dark: 'Тёмное',
  melancholic: 'Меланхоличное',
  chill: 'Chill',
  ru: 'Русский',
})

/** Иконка занятия/настроения/характера/языка по коду (мозг присылает любые коды). */
const WAVE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  wakeup: Sunrise,
  commute: Car,
  work: Laptop,
  study: BookOpen,
  workout: Dumbbell,
  walk: Footprints,
  party: PartyPopper,
  rest: Coffee,
  sleep: MoonStar,
  favorite: Heart,
  unfamiliar: Sparkles,
  popular: Zap,
  energetic: Zap,
  happy: Sparkles,
  calm: Waves,
  sad: CloudRain,
  dark: MoonStar,
  melancholic: CloudRain,
  chill: Waves,
  russian: Languages,
  ru: Languages,
  foreign: Globe,
  instrumental: Mic,
}

// Тона настроений: сервер присылает живые муды из sonic-анализа (12+ штук),
// поэтому тон определяем по слову в коде/названии, а не по точному совпадению.
const MOOD_TONES = ['energetic', 'happy', 'dance', 'calm', 'bold', 'tense', 'sad'] as const
type MoodTone = (typeof MOOD_TONES)[number]

/** Ключевые слова → тон. Проверяются по code и по label (рус/eng). */
const MOOD_TONE_KEYWORDS: Array<[MoodTone, string[]]> = [
  ['sad', ['sad', 'груст', 'меланхол', 'dark', 'тёмн', 'темн', 'somber', 'grief', 'nostalg']],
  ['tense', ['anxious', 'anxiety', 'тревож', 'stress', 'напряж', 'tense', 'angst', 'worry']],
  ['calm', ['calm', 'спокойн', 'relax', 'peace', 'chill', 'медленн', 'dream', 'ambient', 'soft', 'gentle']],
  ['dance', ['dance', 'танц', 'club', 'euphor', 'groov']],
  ['happy', ['happy', 'весел', 'весёл', 'радост', 'upbeat', 'bright', 'cheer', 'playful', 'fun']],
  ['energetic', ['energetic', 'энергич', 'бодр', 'power', 'fast', 'driv', 'pump', 'intense', 'активн']],
  ['bold', ['confident', 'уверен', 'epic', 'эпик', 'heroic', 'triumph', 'proud', 'drive']],
]

/** Тон настроения по коду/названию. */
function moodTone(code: string, label?: string): MoodTone {
  const hay = `${code} ${label ?? ''}`.toLowerCase()
  for (const [tone, words] of MOOD_TONE_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return tone
  }
  return 'calm'
}

/** Иконка настроения по коду/названию — чтобы не было «скрипичных» глифов. */
const MOOD_ICON_KEYWORDS: Array<[ComponentType<{ className?: string }>, string[]]> = [
  [Flame, ['энергич', 'power', 'intense', 'hot']],
  [Smile, ['happy', 'весел', 'весёл', 'радост', 'upbeat', 'cheer', 'playful']],
  [PartyPopper, ['dance', 'танц', 'club', 'party', 'euphor']],
  [Waves, ['calm', 'спокойн', 'relax', 'chill', 'ambient', 'dream', 'gentle']],
  [CloudRain, ['sad', 'груст', 'меланхол', 'nostalg']],
  [MoonStar, ['dark', 'тёмн', 'темн', 'ноч', 'night', 'grief']],
  [AlertTriangle, ['anxious', 'тревож', 'stress', 'напряж', 'tense', 'worry']],
  [Rocket, ['confident', 'уверен', 'epic', 'эпик', 'heroic', 'triumph']],
]

function moodIcon(code: string, label?: string): ComponentType<{ className?: string }> {
  const hay = `${code} ${label ?? ''}`.toLowerCase()
  for (const [Cmp, words] of MOOD_ICON_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return Cmp
  }
  return Music
}

interface WaveOption {
  code: string
  label: string
}

/** Сколько настроений показываем до кнопки «Ещё N». */
const MOOD_CHIPS_LIMIT = 8

/** Офлайн-каталог (мозг выключен или не ответил) — совпадает с ACTIVITY_CATALOG мозга. */
const LOCAL_ACTIVITIES: WaveOption[] = [
  { code: 'wakeup', label: 'Просыпаюсь' },
  { code: 'commute', label: 'В дороге' },
  { code: 'work', label: 'Работаю' },
  { code: 'study', label: 'Учёба / фокус' },
  { code: 'workout', label: 'Тренируюсь' },
  { code: 'walk', label: 'Прогулка' },
  { code: 'party', label: 'Вечеринка' },
  { code: 'rest', label: 'Отдых' },
  { code: 'sleep', label: 'Засыпаю' },
]
const LOCAL_CHARACTERISTICS: WaveOption[] = [
  { code: 'favorite', label: 'Любимое' },
  { code: 'unfamiliar', label: 'Незнакомое' },
  { code: 'popular', label: 'Популярное' },
]
const LOCAL_LANGUAGES: WaveOption[] = [
  { code: 'russian', label: 'Русский' },
  { code: 'foreign', label: 'Иностранный' },
  { code: 'instrumental', label: 'Без слов' },
]
const LOCAL_MOODS: WaveOption[] = [
  { code: 'energetic', label: 'Бодрое' },
  { code: 'happy', label: 'Весёлое' },
  { code: 'calm', label: 'Спокойное' },
  { code: 'sad', label: 'Грустное' },
]

/** Приводит элемент каталога мозга ({code,label} | строка) к {code,label}. */
function toWaveOption(raw: unknown): WaveOption | null {
  if (typeof raw === 'string') {
    const code = raw.trim()
    return code ? { code, label: waveLabel(code) } : null
  }
  if (raw && typeof raw === 'object') {
    const o = raw as { code?: string; label?: string; name?: string }
    const code = (o.code ?? o.name ?? '').trim()
    if (!code) return null
    return { code, label: (o.label ?? waveLabel(code)).trim() }
  }
  return null
}

function toWaveOptions(list: unknown): WaveOption[] {
  if (!Array.isArray(list)) return []
  return list.map(toWaveOption).filter((x): x is WaveOption => !!x)
}

function WaveIcon({ code, className }: { code: string; className?: string }) {
  const Cmp = WAVE_ICONS[code] ?? Music
  return <Cmp className={className} />
}

// Природа волны живёт в service/wave-identity. Реэкспорт оставлен, потому что
// сюда уже импортируют saveWaveContext / readWaveContext из нескольких мест.
export type { WaveContext } from '@/service/wave-identity'
export {
  saveWaveContext,
  readWaveContext,
  isWavePlaylistName,
  detectWaveQueue,
  adoptWaveQueue,
  waveOverlap,
} from '@/service/wave-identity'

interface MyWaveSettingsProps {
  isOpen: boolean
  onClose: () => void
  onApplied?: () => void
}

export default function MyWaveSettings({ isOpen, onClose, onApplied }: MyWaveSettingsProps) {
  const { profile } = useML()
  
  // Состояния настроек
  const [activity, setActivity] = useState<string>('')
  const [characteristic, setCharacteristic] = useState<string>('')
  const [mood, setMood] = useState<string>('')
  const [language, setLanguage] = useState<string>('')
  // Источник Волны как в мобайле (локальный AutoDJ / Brain)
  const [source, setSource] = useState<WaveSource>('local')
  const [brainOn, setBrainOn] = useState<boolean>(false)
  const [serverSyncing, setServerSyncing] = useState<boolean>(false)
  // Каталог пилюль: с мозга (GET /api/wave/options), иначе офлайн-лист
  const [activities, setActivities] = useState<WaveOption[]>(LOCAL_ACTIVITIES)
  const [characteristics, setCharacteristics] = useState<WaveOption[]>(LOCAL_CHARACTERISTICS)
  const [languages, setLanguages] = useState<WaveOption[]>(LOCAL_LANGUAGES)
  const [moods, setMoods] = useState<WaveOption[]>(LOCAL_MOODS)
  // Настроения с сервера (живые, 12+) не подменяют дефолтные пилюли,
  // а добавляются после них — привычные 4 всегда на месте.
  const [showAllMoods, setShowAllMoods] = useState(false)

  // Подгружаем сохраненные настройки при открытии (как в мобайле: initState из prefs).
  // Если мозг подключен — общие пилюли подтягиваем с сервера (GET /api/wave/settings),
  // сервер побеждает локальное (настроил на мобильном — ПК подхватит).
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    try {
      const raw = JSON.parse(localStorage.getItem('my-wave-settings') || '{}')
      setActivity(raw.activity || '')
      setCharacteristic(raw.characteristic || '')
      setMood(raw.mood || '')
      setLanguage(raw.language || '')
      setSource(getWaveSource())
      setBrainOn(isBrainActive())
    } catch { /* ignore */ }
    if (isBrainActive()) {
      setServerSyncing(true)

      // 1) Каталог пилюль с сервера (занятия/характеры/языки/живые настроения).
      //    Ответ — канон: сервер знает больше локального списка (study/walk/party/rest).
      waveOptions()
        .then((opts) => {
          if (cancelled || !opts) return
          const acts = toWaveOptions(opts.activities)
          const chars = toWaveOptions(opts.characteristics)
          const langs = toWaveOptions(opts.languages).map((o) =>
            o.code === 'ru' ? { ...o, code: 'russian' } : o,
          )
          const mds = toWaveOptions(opts.moods)
          if (acts.length) setActivities(acts)
          if (chars.length) setCharacteristics(chars)
          if (langs.length) setLanguages(langs)
          // Дефолтные 4 (как MOOD_PRESETS мозга) остаются Always, серверные — дополнение
          if (mds.length) {
            const base = new Set(LOCAL_MOODS.map((m) => m.code))
            setMoods([...LOCAL_MOODS, ...mds.filter((m) => !base.has(m.code))])
          }
        })
        .catch(() => undefined)

      // 2) Общие пилюли (настройки) — сервер побеждает локальные.
      waveSettingsGet()
        .then((res) => {
          if (cancelled || !res) return
          const s = res.settings || {}
          const hasAny = [s.activity, s.characteristic, s.mood, s.language].some(Boolean)
          if (!hasAny) return
          if (s.activity !== undefined) setActivity(s.activity || '')
          if (s.characteristic !== undefined) setCharacteristic(s.characteristic || '')
          if (s.mood !== undefined) setMood(s.mood || '')
          if (s.language !== undefined) setLanguage(s.language || '')
          try {
            localStorage.setItem('my-wave-settings', JSON.stringify({
              activity: s.activity || '',
              characteristic: s.characteristic || '',
              mood: s.mood || '',
              language: s.language || '',
            }))
          } catch { /* ignore */ }
        })
        .catch(() => undefined)
        .finally(() => { if (!cancelled) setServerSyncing(false) })
    }
    return () => { cancelled = true }
  }, [isOpen])

  if (!isOpen) return null

  const activeHint = [activity, characteristic, mood, language].filter(Boolean).map(waveLabel).join(' • ')
  // Серверные настроения — всё, кроме 4 дефолтных пилюль
  const extraMoods = moods.filter((m) => !LOCAL_MOODS.some((d) => d.code === m.code))
  // Выбранное настроение всегда видно, даже если оно не в первых 8
  const visibleMoods = showAllMoods
    ? extraMoods
    : extraMoods.slice(0, MOOD_CHIPS_LIMIT).concat(
        extraMoods.some((m) => m.code === mood) ? extraMoods.filter((m) => m.code === mood) : [],
      )

  const handleSave = () => {
    // Сохраняем настройки в localStorage
    const settings = { activity, characteristic, mood, language }
    localStorage.setItem('my-wave-settings', JSON.stringify(settings))
    localStorage.setItem(WAVE_SOURCE_KEY, source)

    // Общие пилюли — на сервер (PUT /api/wave/settings, "" стирает пилюлю).
    // Best-effort: локальное уже сохранено, сервер догонит остальные устройства.
    if (isBrainActive()) {
      waveSettingsPut({
        activity: activity || '',
        characteristic: characteristic || '',
        mood: mood || '',
        language: language || '',
      }).catch(() => undefined)
    }
    
    console.log('Saving My Wave settings:', settings, 'source:', source)

    if (source === 'brain' && !isBrainActive()) {
      toast.warning('Мозг не подключен — сыграет локальная Волна. Включи мозг в Настройки → Внешние API.', {
        autoClose: 4000,
      })
    } else {
      toast.success(activeHint ? `Волна (${source === 'brain' ? 'Мозг' : 'локально'}): ${activeHint}` : 'Настройки сохранены!', {
        autoClose: 1500,
      })
    }
    
    onClose()
    // Как в мобайле (_applyWave): применить = сразу перегенерировать
    onApplied?.()
  }

  const handleReset = () => {
    setActivity('')
    setCharacteristic('')
    setMood('')
    setLanguage('')
    // Сброс общих пилюль и на сервере (PUT {} — сброс для всех устройств)
    if (isBrainActive()) {
      waveSettingsPut({ activity: '', characteristic: '', mood: '', language: '' }).catch(() => undefined)
    }
  }

  return (
    <div className="my-wave-settings-overlay" onClick={onClose}>
      <div className="my-wave-settings-modal glass-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="settings-header">
          <div className="header-left">
            <Waves className="w-6 h-6 text-orange-500" />
            <h2 className="settings-title">Настроить Мою Волну</h2>
          </div>
          <div className="header-right">
            <button className="icon-button reset" onClick={handleReset} title="Сбросить">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button className="icon-button close" onClick={onClose} title="Закрыть">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Под занятие — каталог с мозга (study/walk/party/rest есть только там) */}
        <div className="settings-section">
          <h3 className="section-title">Под занятие</h3>
          <div className="oval-buttons">
            {activities.map((opt) => (
              <button
                key={opt.code}
                title={opt.code}
                className={`oval-button ${activity === opt.code ? 'active' : ''}`}
                onClick={() => setActivity(activity === opt.code ? '' : opt.code)}
              >
                <WaveIcon code={opt.code} className="oval-icon" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* По характеру */}
        <div className="settings-section">
          <h3 className="section-title">По характеру</h3>
          <div className="character-buttons">
            {characteristics.map((opt) => (
              <button
                key={opt.code}
                className={`character-button ${characteristic === opt.code ? 'active' : ''}`}
                onClick={() => setCharacteristic(characteristic === opt.code ? '' : opt.code)}
              >
                <WaveIcon code={opt.code} className="character-icon" />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Настроение: сначала 4 дефолтные пилюли (как MOOD_PRESETS мозга),
            ниже — живые настроения с сервера, если мозг подключён. */}
        <div className="settings-section">
          <div className="section-head">
            <h3 className="section-title">По настроению</h3>
            <span className="section-count">{mood ? waveLabel(mood) : 'не выбрано'}</span>
          </div>
          <div className="chip-row">
            {LOCAL_MOODS.map((opt) => {
              const tone = moodTone(opt.code, opt.label)
              const Icon = moodIcon(opt.code, opt.label)
              return (
                <button
                  key={opt.code}
                  className={`chip tone-${tone} ${mood === opt.code ? 'active' : ''}`}
                  onClick={() => setMood(mood === opt.code ? '' : opt.code)}
                >
                  <Icon className="chip-icon" />
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>

          {extraMoods.length > 0 && (
            <>
              <div className="subhead">
                Настроения с сервера
                {!showAllMoods && extraMoods.length > MOOD_CHIPS_LIMIT ? ` · ещё ${extraMoods.length - MOOD_CHIPS_LIMIT}` : ''}
              </div>
              <div className="chip-row">
                {visibleMoods.map((opt) => {
                  const tone = moodTone(opt.code, opt.label)
                  const Icon = moodIcon(opt.code, opt.label)
                  return (
                    <button
                      key={opt.code}
                      className={`chip chip-muted tone-${tone} ${mood === opt.code ? 'active' : ''}`}
                      onClick={() => setMood(mood === opt.code ? '' : opt.code)}
                    >
                      <Icon className="chip-icon" />
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
              {extraMoods.length > MOOD_CHIPS_LIMIT && (
                <button className="more-button" onClick={() => setShowAllMoods((v) => !v)}>
                  <ChevronDown className={`w-3.5 h-3.5 ${showAllMoods ? 'rotate-180' : ''}`} />
                  {showAllMoods ? 'Свернуть' : `Показать все (${extraMoods.length})`}
                </button>
              )}
            </>
          )}
        </div>

        {/* По языку */}
        <div className="settings-section">
          <h3 className="section-title">По языку</h3>
          <div className="language-buttons">
            {languages.map((opt) => (
              <button
                key={opt.code}
                className={`language-button ${language === opt.code ? 'active' : ''}`}
                onClick={() => setLanguage(language === opt.code ? '' : opt.code)}
              >
                <WaveIcon code={opt.code} className="w-4 h-4" />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Источник Волны — как в мобайле: локальный AutoDJ или Brain */}
        <div className="settings-section">
          <h3 className="section-title">Источник</h3>
          <div className="language-buttons">
            <button
              className={`language-button ${source === 'local' ? 'active' : ''}`}
              onClick={() => setSource('local')}
            >
              <MonitorSmartphone className="w-4 h-4" />
              Локальный
            </button>
            <button
              className={`language-button ${source === 'brain' ? 'active' : ''}`}
              onClick={() => setSource('brain')}
            >
              <Cpu className="w-4 h-4" />
              Мозг
            </button>
          </div>
          <p style={{ fontSize: 12, color: brainOn ? '#16a34a' : '#999', marginTop: 8 }}>
            {serverSyncing ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Синхронизация с мозгом…
              </span>
            ) : brainOn ? '● Мозг подключен (настройки общие с сервером)' : '○ Мозг выключен — будет играть локальная Волна (мозг включается в Настройки → Внешние API)'}
          </p>
        </div>

        {/* Кнопка сохранить */}
        <div className="settings-footer">
          {activeHint ? (
            <p className="wave-hint">Волна: {activeHint}</p>
          ) : null}
          <button className="save-button" onClick={handleSave}>
            Применить
          </button>
        </div>
      </div>

      {/* Стили */}
      <style>{`
        .my-wave-settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 200ms ease;
        }

        .my-wave-settings-modal {
          background: hsl(var(--popover));
          color: hsl(var(--popover-foreground));
          border-radius: 24px;
          border: 1px solid hsl(var(--border) / 0.5);
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 300ms ease;
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid hsl(var(--border));
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .settings-title {
          font-size: 24px;
          font-weight: 700;
          color: hsl(var(--foreground));
        }

        .header-right {
          display: flex;
          gap: 8px;
        }

        .icon-button {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--secondary));
          color: hsl(var(--secondary-foreground));
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 200ms ease;
        }

        .icon-button.reset:hover {
          background: #e0e0e0;
          transform: rotate(90deg);
        }

        .icon-button.close:hover {
          background: #ff4444;
          color: white;
        }

        .settings-section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .oval-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        /* Иконка в кружке — чтобы пилюля читалась как элемент управления, а не эмодзи */
        .oval-icon {
          width: 22px;
          height: 22px;
          padding: 4px;
          margin-right: 8px;
          border-radius: 9999px;
          background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
          flex-shrink: 0;
          vertical-align: middle;
        }

        .oval-button.active .oval-icon {
          background: hsl(var(--primary-foreground) / 0.22);
          color: hsl(var(--primary-foreground));
        }

        .character-icon {
          width: 24px;
          height: 24px;
          color: hsl(var(--muted-foreground));
        }

        .character-button.active .character-icon {
          color: hsl(var(--primary-foreground));
        }

        .oval-button {
          display: inline-flex;
          align-items: center;
          padding: 10px 18px;
          border-radius: 9999px;
          border: 2px solid hsl(var(--border));
          background: hsl(var(--secondary));
          color: hsl(var(--secondary-foreground));
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .oval-button:hover {
          border-color: hsl(var(--primary));
          background: hsl(var(--accent));
          color: hsl(var(--accent-foreground));
        }

        .oval-button.active {
          border-color: hsl(var(--primary));
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }

        .character-buttons {
          display: flex;
          gap: 12px;
        }

        .character-button {
          flex: 1;
          padding: 16px;
          border-radius: 16px;
          border: 2px solid hsl(var(--border));
          background: hsl(var(--secondary));
          color: hsl(var(--secondary-foreground));
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .character-button:hover {
          border-color: hsl(var(--primary));
          background: hsl(var(--accent));
          color: hsl(var(--accent-foreground));
        }

        .character-button.active {
          border-color: hsl(var(--primary));
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }

        /* Настроения: компактные чипы вместо огромных кругов.
           Цвет тона — по настроению, поэтому список читается, а не сливается. */
        .section-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        .section-head .section-title {
          margin-bottom: 0;
        }

        .section-count {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          text-transform: none;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .subhead {
          margin: 14px 0 8px;
          font-size: 12px;
          font-weight: 500;
          color: hsl(var(--muted-foreground) / 0.8);
        }

        /* Серверные настроения — визуально «второй уровень», чтобы не спорить с основными */
        .chip-muted {
          background: transparent;
          border-style: dashed;
        }

        .chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 13px;
          border-radius: 9999px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--secondary));
          color: hsl(var(--secondary-foreground));
          font-size: 13px;
          font-weight: 600;
          line-height: 1;
          cursor: pointer;
          transition: border-color 150ms ease, background 150ms ease, color 150ms ease, transform 150ms ease;
        }

        .chip:hover {
          border-color: hsl(var(--primary) / 0.6);
          transform: translateY(-1px);
        }

        .chip-icon {
          width: 15px;
          height: 15px;
          flex-shrink: 0;
          opacity: 0.75;
        }

        /* Тон подсвечиваем только выбранный — иначе пёстро */
        .chip.active {
          border-color: transparent;
          color: #fff;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
        }

        .chip.active .chip-icon {
          opacity: 1;
        }

        .chip.tone-energetic.active { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }
        .chip.tone-happy.active     { background: linear-gradient(135deg, #fccb90 0%, #d57eeb 100%); }
        .chip.tone-dance.active     { background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%); }
        .chip.tone-calm.active      { background: linear-gradient(135deg, #22d3ee 0%, #6366f1 100%); }
        .chip.tone-bold.active      { background: linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%); }
        .chip.tone-tense.active     { background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); }
        .chip.tone-sad.active       { background: linear-gradient(135deg, #64748b 0%, #6d28d9 100%); }

        .more-button {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 10px;
          padding: 6px 10px;
          border: none;
          border-radius: 8px;
          background: transparent;
          color: hsl(var(--muted-foreground));
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .more-button:hover {
          color: hsl(var(--foreground));
        }

        .more-button svg {
          transition: transform 200ms ease;
        }

        .language-buttons {
          display: flex;
          gap: 8px;
        }

        .language-button {
          flex: 1;
          padding: 12px 16px;
          border-radius: 12px;
          border: 2px solid hsl(var(--border));
          background: hsl(var(--secondary));
          color: hsl(var(--secondary-foreground));
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 200ms ease;
        }

        .language-button:hover {
          border-color: hsl(var(--primary));
          background: hsl(var(--accent));
          color: hsl(var(--accent-foreground));
        }

        .language-button.active {
          border-color: hsl(var(--primary));
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }

        .settings-footer {
          padding-top: 16px;
          border-top: 2px solid hsl(var(--border));
        }

        .wave-hint {
          font-size: 12px;
          color: hsl(var(--muted-foreground));
          margin-bottom: 8px;
        }

        .save-button {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .save-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @media (max-width: 640px) {
          .my-wave-settings-modal {
            width: 95%;
            padding: 16px;
          }

          .character-buttons {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  )
}
