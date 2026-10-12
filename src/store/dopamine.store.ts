/**
 * Настройки «вау-слоя» — визуальные эффекты, привязанные к музыке.
 *
 * Отдельный стор, потому что эффекты трёх разных подсистем, у каждой
 * своя точка включения:
 *   - прогресс-бар  → ui/slider.tsx (ProgressSlider) и player/player.tsx
 *   - обложка       → fullscreen/now-playing.tsx
 *   - кнопка Play   → fullscreen/now-playing.tsx
 * Плюс общий мастер-тумблер: выключил раз — выключились все три.
 *
 * Пульс — это не «анимация включена/выключена», а подписка на аудио-граф:
 * значения пишутся в CSS-переменные (--pulse), а не в состояние React.
 * Иначе 60 ререндеров в секунду на каждый подписанный компонент.
 */

import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface DopamineSettings {
  /** Мастер-тумблер. Выключает все эффекты разом. */
  enabled: boolean

  /** Пульсирует свечение прогресс-бара в такт музыке. */
  pulseProgressBar: boolean
  /** Обложка чуть «дышит» на низких частотах. */
  pulseCover: boolean
  /** Яркость блика на кнопке Play в фулскрине. */
  pulsePlayButton: boolean

  /**
   * Сила реакции, 0..1. Насколько сильно интерфейс реагирует на музыку.
   * При 0.3 подсветка едва заметна, при 1.0 — заметно «кидает».
   */
  pulseIntensity: number

  /** Блик, проезжающий по карточкам ML-плейлистов при наведении. */
  cardShine: boolean
  /** Сезонный анимированный фон у праздничных плейлистов. */
  holidayBackdrop: boolean
  /** Показывать стрик дней подряд в плеер-баре. */
  streakInPlayerBar: boolean
  /** Показывать стрик в hero на главной. */
  streakOnHome: boolean
}

interface DopamineStore {
  settings: DopamineSettings
  setEnabled: (enabled: boolean) => void
  setPulseProgressBar: (enabled: boolean) => void
  setPulseCover: (enabled: boolean) => void
  setPulsePlayButton: (enabled: boolean) => void
  setPulseIntensity: (value: number) => void
  setCardShine: (enabled: boolean) => void
  setHolidayBackdrop: (enabled: boolean) => void
  setStreakInPlayerBar: (enabled: boolean) => void
  setStreakOnHome: (enabled: boolean) => void
  /** Включить/выключить все три источника пульса разом. */
  setAllPulse: (enabled: boolean) => void
  resetToDefaults: () => void
}

const defaultSettings: DopamineSettings = {
  // Мастер-тумблер по умолчанию выключен: эффекты бьют по батарее и по
  // чувствительным к движению людям. Три пульса — по отдельности — включены,
  // чтобы пользователь получал эффект сразу, но мог отключить мастером.
  enabled: false,

  pulseProgressBar: true,
  pulseCover: true,
  pulsePlayButton: true,
  pulseIntensity: 0.6,

  cardShine: true,
  holidayBackdrop: true,
  streakInPlayerBar: true,
  streakOnHome: true,
}

export const useDopamineStore = createWithEqualityFn<DopamineStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          settings: defaultSettings,

          setEnabled: (enabled) => {
            set((state) => {
              state.settings.enabled = enabled
            })
          },

          setPulseProgressBar: (enabled) => {
            set((state) => {
              state.settings.pulseProgressBar = enabled
            })
          },

          setPulseCover: (enabled) => {
            set((state) => {
              state.settings.pulseCover = enabled
            })
          },

          setPulsePlayButton: (enabled) => {
            set((state) => {
              state.settings.pulsePlayButton = enabled
            })
          },

          setPulseIntensity: (value) => {
            set((state) => {
              state.settings.pulseIntensity = Math.max(0, Math.min(1, value))
            })
          },

          setCardShine: (enabled) => {
            set((state) => {
              state.settings.cardShine = enabled
            })
          },

          setHolidayBackdrop: (enabled) => {
            set((state) => {
              state.settings.holidayBackdrop = enabled
            })
          },

          setStreakInPlayerBar: (enabled) => {
            set((state) => {
              state.settings.streakInPlayerBar = enabled
            })
          },

          setStreakOnHome: (enabled) => {
            set((state) => {
              state.settings.streakOnHome = enabled
            })
          },

          setAllPulse: (enabled) => {
            set((state) => {
              state.settings.pulseProgressBar = enabled
              state.settings.pulseCover = enabled
              state.settings.pulsePlayButton = enabled
              // Мастер включаем тоже: иначе три тумблера включены, а
              // ничего не происходит, и это выглядит как баг.
              state.settings.enabled = enabled
            })
          },

          resetToDefaults: () => {
            set((state) => {
              state.settings = { ...defaultSettings }
            })
          },
        })),
        {
          name: 'dopamine_store',
        },
      ),
    ),
    {
      name: 'dopamine-persistence',
      storage: {
        getItem: async (name) => {
          const item = localStorage.getItem(name)
          return item ? JSON.parse(item) : null
        },
        setItem: async (name, value) => {
          localStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: async (name) => {
          localStorage.removeItem(name)
        },
      },
    },
  ),
)

export const useDopamineSettings = () =>
  useDopamineStore((state) => state.settings)

export const useDopamineActions = () =>
  useDopamineStore((state) => ({
    setEnabled: state.setEnabled,
    setPulseProgressBar: state.setPulseProgressBar,
    setPulseCover: state.setPulseCover,
    setPulsePlayButton: state.setPulsePlayButton,
    setPulseIntensity: state.setPulseIntensity,
    setCardShine: state.setCardShine,
    setHolidayBackdrop: state.setHolidayBackdrop,
    setStreakInPlayerBar: state.setStreakInPlayerBar,
    setStreakOnHome: state.setStreakOnHome,
    setAllPulse: state.setAllPulse,
    resetToDefaults: state.resetToDefaults,
  }))

/**
 * Включён ли хоть один источник пульса.
 *
 * Отдельный селектор, потому что useAudioPulse должен стартовать rAF только
 * когда пульс реально куда-то выводится. Иначе анализатор крутится вхолостую
 * на каждой странице, где пульс никто не читает.
 */
export const useAnyPulseEnabled = () =>
  useDopamineStore(
    (state) =>
      state.settings.enabled &&
      (state.settings.pulseProgressBar ||
        state.settings.pulseCover ||
        state.settings.pulsePlayButton),
  )
