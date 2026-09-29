/**
 * My Wave Settings - Настройки "Моя Волна"
 * Модальное окно с настройками персонализации
 */

import {
  Brain,
  Briefcase,
  Car,
  Cpu,
  Dumbbell,
  Flag,
  Heart,
  Languages,
  Mic,
  MonitorSmartphone,
  Moon,
  Music,
  RefreshCw,
  Sparkles,
  Sunrise,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import i18n from '@/i18n'
import { isBrainActive } from '@/store/brain.store'
import { useML } from '@/store/ml.store'
import { fetchBrainMoods } from '@/service/brain-wave'

export const WAVE_SOURCE_KEY = 'my-wave-source'
export type WaveSource = 'local' | 'brain'

export function getWaveSource(): WaveSource {
  try {
    return localStorage.getItem(WAVE_SOURCE_KEY) === 'brain' ? 'brain' : 'local'
  } catch {
    return 'local'
  }
}

/** Человеческие подписи вместо сырых ключей (wakeup/work/unfamiliar/...).
 * RU-значения — фолбэк, основной текст берётся из локали через waveLabel(). */
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
  const k = (key || '').trim()
  if (!k) return ''
  return i18n.t(`wave.${k}`, { defaultValue: WAVE_LABELS[k] ?? k })
}

/** Раскраска мозговых настроений по типу (W5b): одинаковый teal
 * ничего не говорит, цвет должен совпадать со смыслом.
 * Ключи — lowercase, сервер отдаёт mood_labels в нижнем регистре. */
export function brainMoodGradient(mood: string): string {
  const m = (mood || '').trim().toLowerCase()
  const has = (...keys: string[]) => keys.some((k) => m.includes(k))
  if (has('energetic', 'энергичн', 'бодр')) return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
  if (has('happy', 'весел', 'счастлив', 'радост')) return 'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)'
  if (has('calm', 'спокой', 'chill', 'чил')) return 'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)'
  if (has('sad', 'груст', 'меланхол', 'melanchol')) return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  if (has('dark', 'тёмн', 'темн')) return 'linear-gradient(135deg, #232526 0%, #414345 100%)'
  if (has('warm', 'тёпл', 'тепл')) return 'linear-gradient(135deg, #ff9a3c 0%, #ff6a88 100%)'
  if (has('aggress', 'агресс')) return 'linear-gradient(135deg, #cb2d3e 0%, #ef473a 100%)'
  if (has('romant', 'романт', 'love', 'любов')) return 'linear-gradient(135deg, #ff758f 0%, #ff7eb3 100%)'
  if (has('focus', 'фокус', 'сосредоточ', 'работ')) return 'linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%)'
  if (has('party', 'вечерин', 'танц', 'dance')) return 'linear-gradient(135deg, #8E2DE2 0%, #4A00E0 100%)'
  if (has('sleep', 'сон', 'night', 'ноч')) return 'linear-gradient(135deg, #0f2027 0%, #2c5364 100%)'
  return 'linear-gradient(135deg, #43cea2 0%, #185a9d 100%)'
}

const WAVE_CTX_KEY = 'my-wave-last'

export interface WaveContext {
  ids: string[]
  hint: string
  source: WaveSource
  at: number
}

/** Запоминаем, что именно сейчас играет Волна — для шапки «Сейчас играет / Работаю» как в Яндексе */
export function saveWaveContext(
  ids: string[],
  hint: string,
  source: WaveSource,
) {
  try {
    const ctx: WaveContext = {
      ids: ids.slice(0, 100),
      hint,
      source,
      at: Date.now(),
    }
    localStorage.setItem(WAVE_CTX_KEY, JSON.stringify(ctx))
  } catch {
    /* ignore */
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

interface MyWaveSettingsProps {
  isOpen: boolean
  onClose: () => void
  onApplied?: () => void
}

export default function MyWaveSettings({
  isOpen,
  onClose,
  onApplied,
}: MyWaveSettingsProps) {
  const { profile } = useML()
  const { t } = useTranslation()

  // Состояния настроек
  const [activity, setActivity] = useState<string>('')
  const [characteristic, setCharacteristic] = useState<string>('')
  const [mood, setMood] = useState<string>('')
  const [language, setLanguage] = useState<string>('')
  // Источник Волны как в мобайле (локальный AutoDJ / Brain)
  const [source, setSource] = useState<WaveSource>('local')
  const [brainOn, setBrainOn] = useState<boolean>(false)
  // Настроения с мозга (W5b): пинг waveContinue(queue=[], count=5) → distinct moods.
  // Стандартные 4 пилюли всегда на месте, мозговые — довеском (могут совпадать).
  const [brainMoods, setBrainMoods] = useState<string[]>([])
  const [brainMoodsLoading, setBrainMoodsLoading] = useState(false)
  const [brainMoodsNote, setBrainMoodsNote] = useState<string | null>(null)
  // Зеркало для then-колбэка (без stale closure при переоткрытии окна)
  const brainMoodsRef = useRef<string[]>([])

  // Подгружаем сохраненные настройки при открытии (как в мобайле: initState из prefs)
  useEffect(() => {
    if (!isOpen) return
    try {
      const raw = JSON.parse(localStorage.getItem('my-wave-settings') || '{}')
      setActivity(raw.activity || '')
      setCharacteristic(raw.characteristic || '')
      setMood(raw.mood || '')
      setLanguage(raw.language || '')
      setSource(getWaveSource())
      setBrainOn(isBrainActive())
    } catch {
      /* ignore */
    }
    // Мозговые настроения — фоном, окно не ждёт
    setBrainMoodsNote(null)
    if (isBrainActive()) {
      setBrainMoodsLoading(true)
      fetchBrainMoods()
        .then(({ moods: ms, reason }) => {
          const fresh = ms.filter((m) => m && m.length <= 24).slice(0, 10)
          // Пустой ответ не затирает ранее подгруженные (анализ частичный —
          // было «то есть, то нет»). Затираем только непустым.
          if (fresh.length > 0) {
            brainMoodsRef.current = fresh
            setBrainMoods(fresh)
            setBrainMoodsNote(null)
            return
          }
          if (brainMoodsRef.current.length > 0) return // кэш жив, ноту не показываем
          if (reason === 'unavailable') {
            setBrainMoodsNote(
              t('brain.moodsUnavailable', {
                defaultValue: 'Мозг не ответил (401/сеть) — проверь токен Brain',
              }),
            )
          } else if (reason === 'empty') {
            setBrainMoodsNote(
              t('brain.moodsEmpty', {
                defaultValue: 'На сервере нет sonic-анализа — запусти анализ библиотеки',
              }),
            )
          }
        })
        .catch(() => undefined)
        .finally(() => setBrainMoodsLoading(false))
    } else {
      setBrainMoods([])
    }
  }, [isOpen])

  if (!isOpen) return null

  const activeHint = [activity, characteristic, mood, language]
    .filter(Boolean)
    .map(waveLabel)
    .join(' • ')

  const handleSave = () => {
    // Сохраняем настройки в localStorage
    const settings = { activity, characteristic, mood, language }
    localStorage.setItem('my-wave-settings', JSON.stringify(settings))
    localStorage.setItem(WAVE_SOURCE_KEY, source)

    console.log('Saving My Wave settings:', settings, 'source:', source)

    if (source === 'brain' && !isBrainActive()) {
      toast.warning(t('brain.waveNotConnected'), {
        autoClose: 4000,
      })
    } else {
      const sourceLabel =
        source === 'brain' ? t('brain.waveSourceLabel') : t('brain.waveLocal')
      toast.success(
        activeHint
          ? t('brain.waveApplied', { source: sourceLabel, hint: activeHint })
          : t('brain.settingsSaved'),
        {
          autoClose: 1500,
        },
      )
    }

    onClose()
    // Как в мобайле (_applyWave): применить = сразу перегенерировать
    onApplied?.()
  }

  const handleReset = () => {
    // Сброс = как будто ничего не выбрано: чистим стейт, сохраняем пусто,
    // закрываем и сразу перегенерируем волну (onApplied).
    setActivity('')
    setCharacteristic('')
    setMood('')
    setLanguage('')
    try {
      localStorage.setItem('my-wave-settings', JSON.stringify({}))
    } catch {
      /* ignore */
    }
    onClose()
    onApplied?.()
  }

  return (
    <div className="my-wave-settings-overlay" onClick={onClose}>
      <div
        className="my-wave-settings-modal glass-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="settings-header">
          <div className="header-left">
            <Music className="w-6 h-6 text-orange-500" />
            <h2 className="settings-title">{t('wave.title')}</h2>
          </div>
          <div className="header-right">
            <button
              className="icon-button reset"
              onClick={handleReset}
              title={t('wave.reset')}
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              className="icon-button close"
              onClick={onClose}
              title={t('wave.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Под занятие */}
        <div className="settings-section">
          <h3 className="section-title">{t('wave.byActivity')}</h3>
          <div className="oval-buttons">
            <button
              className={`oval-button ${activity === 'wakeup' ? 'active' : ''}`}
              onClick={() => setActivity(activity === 'wakeup' ? '' : 'wakeup')}
            >
              <Sunrise className="w-4 h-4" />
              {t('wave.wakeup')}
            </button>
            <button
              className={`oval-button ${activity === 'commute' ? 'active' : ''}`}
              onClick={() =>
                setActivity(activity === 'commute' ? '' : 'commute')
              }
            >
              <Car className="w-4 h-4" />
              {t('wave.commute')}
            </button>
            <button
              className={`oval-button ${activity === 'work' ? 'active' : ''}`}
              onClick={() => setActivity(activity === 'work' ? '' : 'work')}
            >
              <Briefcase className="w-4 h-4" />
              {t('wave.work')}
            </button>
            <button
              className={`oval-button ${activity === 'workout' ? 'active' : ''}`}
              onClick={() =>
                setActivity(activity === 'workout' ? '' : 'workout')
              }
            >
              <Dumbbell className="w-4 h-4" />
              {t('wave.workout')}
            </button>
            <button
              className={`oval-button ${activity === 'sleep' ? 'active' : ''}`}
              onClick={() => setActivity(activity === 'sleep' ? '' : 'sleep')}
            >
              <Moon className="w-4 h-4" />
              {t('wave.sleep')}
            </button>
          </div>
        </div>

        {/* По характеру */}
        <div className="settings-section">
          <h3 className="section-title">{t('wave.byCharacter')}</h3>
          <div className="character-buttons">
            <button
              className={`character-button ${characteristic === 'favorite' ? 'active' : ''}`}
              onClick={() =>
                setCharacteristic(
                  characteristic === 'favorite' ? '' : 'favorite',
                )
              }
            >
              <Heart
                className={`w-5 h-5 ${characteristic === 'favorite' ? 'fill-red-500 text-red-500' : ''}`}
              />
              <span>{t('wave.favorite')}</span>
            </button>
            <button
              className={`character-button ${characteristic === 'unfamiliar' ? 'active' : ''}`}
              onClick={() =>
                setCharacteristic(
                  characteristic === 'unfamiliar' ? '' : 'unfamiliar',
                )
              }
            >
              <Sparkles
                className={`w-5 h-5 ${characteristic === 'unfamiliar' ? 'fill-purple-500 text-purple-500' : ''}`}
              />
              <span>{t('wave.unfamiliar')}</span>
            </button>
            <button
              className={`character-button ${characteristic === 'popular' ? 'active' : ''}`}
              onClick={() =>
                setCharacteristic(characteristic === 'popular' ? '' : 'popular')
              }
            >
              <Zap
                className={`w-5 h-5 ${characteristic === 'popular' ? 'fill-yellow-500 text-yellow-500' : ''}`}
              />
              <span>{t('wave.popular')}</span>
            </button>
          </div>
        </div>

        {/* По настроению */}
        <div className="settings-section">
          <h3 className="section-title">{t('wave.byMood')}</h3>
          <div className="mood-buttons">
            <button
              className={`mood-button energetic ${mood === 'energetic' ? 'active' : ''}`}
              onClick={() => setMood(mood === 'energetic' ? '' : 'energetic')}
            >
              {t('wave.energetic')}
            </button>
            <button
              className={`mood-button happy ${mood === 'happy' ? 'active' : ''}`}
              onClick={() => setMood(mood === 'happy' ? '' : 'happy')}
            >
              {t('wave.happy')}
            </button>
            <button
              className={`mood-button calm ${mood === 'calm' ? 'active' : ''}`}
              onClick={() => setMood(mood === 'calm' ? '' : 'calm')}
            >
              {t('wave.calm')}
            </button>
            <button
              className={`mood-button sad ${mood === 'sad' ? 'active' : ''}`}
              onClick={() => setMood(mood === 'sad' ? '' : 'sad')}
            >
              {t('wave.sad')}
            </button>
            {/* Мозговые настроения (W5b): есть в твоей библиотеке прямо сейчас */}
            {brainMoods
              .filter((m) => !['energetic', 'happy', 'calm', 'sad'].includes(m))
              .map((m) => (
                <button
                  key={`brain-mood-${m}`}
                  className={`mood-button brain-mood ${mood === m ? 'active' : ''}`}
                  style={{ background: brainMoodGradient(m) }}
                  title={t('brain.moodFromBrain', { defaultValue: 'Из твоей библиотеки (мозг)' })}
                  onClick={() => setMood(mood === m ? '' : m)}
                >
                  <Brain className="w-4 h-4" />
                  {waveLabel(m)}
                </button>
              ))}
          </div>
          {brainMoodsLoading ? (
            <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
              {t('brain.moodsLoading', { defaultValue: 'Подгружаем настроения с мозга…' })}
            </p>
          ) : brainMoodsNote ? (
            <p style={{ fontSize: 12, color: '#b45309', marginTop: 8 }}>
              ⚠️ {brainMoodsNote}
            </p>
          ) : null}
        </div>

        {/* По языку */}
        <div className="settings-section">
          <h3 className="section-title">{t('wave.byLanguage')}</h3>
          <div className="language-buttons">
            <button
              className={`language-button ${language === 'russian' ? 'active' : ''}`}
              onClick={() =>
                setLanguage(language === 'russian' ? '' : 'russian')
              }
            >
              <Flag className="w-4 h-4" />
              {t('wave.russian')}
            </button>
            <button
              className={`language-button ${language === 'foreign' ? 'active' : ''}`}
              onClick={() =>
                setLanguage(language === 'foreign' ? '' : 'foreign')
              }
            >
              <Languages className="w-4 h-4" />
              {t('wave.foreign')}
            </button>
            <button
              className={`language-button ${language === 'instrumental' ? 'active' : ''}`}
              onClick={() =>
                setLanguage(language === 'instrumental' ? '' : 'instrumental')
              }
            >
              <Mic className="w-4 h-4" />
              {t('wave.instrumental')}
            </button>
          </div>
        </div>

        {/* Источник Волны — как в мобайле: локальный AutoDJ или KFB */}
        <div className="settings-section">
          <h3 className="section-title">{t('wave.source')}</h3>
          <div className="language-buttons">
            <button
              className={`language-button ${source === 'local' ? 'active' : ''}`}
              onClick={() => setSource('local')}
            >
              <MonitorSmartphone className="w-4 h-4" />
              {t('wave.local')}
            </button>
            <button
              className={`language-button ${source === 'brain' ? 'active' : ''}`}
              onClick={() => setSource('brain')}
            >
              <Cpu className="w-4 h-4" />
              {t('brain.short')}
            </button>
          </div>
          <p
            style={{
              fontSize: 12,
              color: brainOn ? '#16a34a' : '#999',
              marginTop: 8,
            }}
          >
            {brainOn ? t('brain.waveStatusOn') : t('brain.waveStatusOff')}
          </p>
        </div>

        {/* Кнопка сохранить */}
        <div className="settings-footer">
          {activeHint ? (
            <p className="wave-hint">
              {t('wave.waveHint', { hint: activeHint })}
            </p>
          ) : null}
          <button className="save-button" onClick={handleSave}>
            {t('wave.apply')}
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

        .oval-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 20px;
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

        .mood-buttons {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .mood-button {
          aspect-ratio: 1;
          border-radius: 50%;
          border: 3px solid transparent;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
          color: white;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 8px;
        }

        .mood-button.brain-mood {
          background: linear-gradient(135deg, #43cea2 0%, #185a9d 100%);
        }

        .mood-button.energetic {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        .mood-button.happy {
          background: linear-gradient(135deg, #fccb90 0%, #d57eeb 100%);
        }

        .mood-button.calm {
          background: linear-gradient(135deg, #5ee7df 0%, #b490ca 100%);
        }

        .mood-button.sad {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .mood-button:hover {
          transform: scale(1.05);
        }

        .mood-button.active {
          border-color: white;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
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

          .mood-buttons {
            grid-template-columns: repeat(2, 1fr);
          }

          .character-buttons {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  )
}
