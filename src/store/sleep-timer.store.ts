import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'
import { usePlayerActions, usePlayerStore } from './player.store'
import { trackSleepTimerSet } from '@/service/ml-event-tracker'

export type SleepTimerMode = 'timed' | 'endOfSong'

export interface SleepTimerState {
  isEnabled: boolean
  mode: SleepTimerMode
  remainingSeconds: number
  presetMinutes: number
}

interface SleepTimerStore {
  state: SleepTimerState

  // Actions
  enable: (minutes: number) => void
  enableEndOfSong: () => void
  disable: () => void
  setRemainingSeconds: (seconds: number) => void
  reset: () => void

  // Computed
  isActive: () => boolean
  getRemainingTime: () => string
}

const defaultState: SleepTimerState = {
  isEnabled: false,
  mode: 'timed',
  remainingSeconds: 0,
  presetMinutes: 0,
}

// Таймер
let timerInterval: NodeJS.Timeout | null = null
let timerStartTime: number = 0
let timerTargetTime: number = 0

function startTimer() {
  // Очищаем предыдущий таймер если есть
  stopTimer()

  const store = useSleepTimerStore.getState()
  
  // Запускаем таймер только для режима 'timed'
  if (store.state.mode !== 'timed' || store.state.remainingSeconds <= 0) {
    console.log('[SleepTimer] Not starting timer (mode check):', {
      mode: store.state.mode,
      remainingSeconds: store.state.remainingSeconds
    })
    return
  }

  // Запоминаем время старта и целевое время
  timerStartTime = Date.now()
  timerTargetTime = timerStartTime + (store.state.remainingSeconds * 1000)

  // Запускаем проверку каждые 500ms
  timerInterval = setInterval(() => {
    const store = useSleepTimerStore.getState()

    if (!store.state.isEnabled || store.state.mode !== 'timed') {
      stopTimer()
      return
    }

    // Вычисляем оставшееся время
    const now = Date.now()
    const remaining = Math.max(0, Math.floor((timerTargetTime - now) / 1000))

    store.setRemainingSeconds(remaining)

    // Если время вышло
    if (remaining <= 0) {
      stopTimer()
    }
  }, 500)

  console.log('[SleepTimer] Timer started for', store.state.remainingSeconds, 'seconds')
}

// Отдельная функция для режима 'endOfSong'
function startEndOfSongTimer() {
  // Очищаем предыдущий таймер если есть
  stopTimer()

  const store = useSleepTimerStore.getState()
  
  // Для endOfSong режима используем оставшееся время
  if (store.state.mode !== 'endOfSong' || store.state.remainingSeconds <= 0) {
    console.log('[SleepTimer] Not starting endOfSong timer:', {
      mode: store.state.mode,
      remainingSeconds: store.state.remainingSeconds
    })
    return
  }

  // Запоминаем время старта и целевое время
  timerStartTime = Date.now()
  timerTargetTime = timerStartTime + (store.state.remainingSeconds * 1000)

  console.log('[SleepTimer] EndOfSong timer started for', store.state.remainingSeconds, 'seconds')

  // Запускаем проверку каждые 500ms
  timerInterval = setInterval(() => {
    const store = useSleepTimerStore.getState()

    if (!store.state.isEnabled) {
      stopTimer()
      return
    }

    // Вычисляем оставшееся время
    const now = Date.now()
    const remaining = Math.max(0, Math.floor((timerTargetTime - now) / 1000))

    store.setRemainingSeconds(remaining)

    // Если время вышло
    if (remaining <= 0) {
      stopTimer()
    }
  }, 500)
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
    timerStartTime = 0
    timerTargetTime = 0
    console.log('[SleepTimer] Timer stopped')
  }
}

async function handleTimerComplete() {
  console.log('[SleepTimer] Timer completed, starting fade-out...')

  // Выключаем таймер
  useSleepTimerStore.getState().disable()

  // Плавное затухание громкости (3 секунды)
  const audio = document.querySelector('audio')
  if (audio) {
    const initialVolume = audio.volume
    const fadeDuration = 3000 // 3 секунды
    const fadeSteps = 30
    const stepDelay = fadeDuration / fadeSteps
    const volumeStep = initialVolume / fadeSteps

    console.log('[SleepTimer] Fading out volume over', fadeDuration, 'ms')

    // Плавное уменьшение громкости
    for (let i = 0; i < fadeSteps; i++) {
      await new Promise(resolve => setTimeout(resolve, stepDelay))
      audio.volume = initialVolume - (volumeStep * (i + 1))
    }

    // Останавливаем воспроизведение
    audio.pause()
    audio.currentTime = 0
    audio.volume = initialVolume // Возвращаем громкость для следующего запуска
  }

  // Создаём кастомное событие которое слушает плеер
  window.dispatchEvent(new CustomEvent('sleep-timer-complete'))

  // Уведомление (опционально)
  console.log('[SleepTimer] Playback stopped with fade-out')

  // Toast уведомление
  import('react-toastify').then(({ toast }) => {
    toast.default('⏰ Таймер сна остановил воспроизведение', {
      type: 'info',
      autoClose: 5000
    })
  })
}

export const useSleepTimerStore = createWithEqualityFn<SleepTimerStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          state: defaultState,

          enable: (minutes: number) => {
            set((state) => {
              state.state.isEnabled = true
              state.state.mode = 'timed'
              state.state.remainingSeconds = minutes * 60
              state.state.presetMinutes = minutes
            })

            // Трекаем событие
            trackSleepTimerSet(minutes)

            // Запускаем обратный отсчёт
            startTimer()
          },

          enableEndOfSong: () => {
            // Вычисляем время до конца трека
            const audio = document.querySelector('audio')
            if (!audio || !audio.duration || audio.duration <= 0 || isNaN(audio.duration)) {
              console.warn('[SleepTimer] Cannot calculate time to end of song - no audio or invalid duration')
              const allAudios = document.querySelectorAll('audio')
              console.log('[SleepTimer] Found audio elements:', allAudios.length)
              if (allAudios.length > 0) {
                allAudios.forEach((a, i) => {
                  console.log(`[SleepTimer] Audio ${i}:`, {
                    duration: a.duration,
                    currentTime: a.currentTime,
                    paused: a.paused
                  })
                })
              }
              return
            }

            const timeToEnd = audio.duration - audio.currentTime
            const minutesToEnd = Math.ceil(timeToEnd / 60)

            console.log('[SleepTimer] End of song mode:', {
              duration: audio.duration,
              currentTime: audio.currentTime,
              timeToEnd: timeToEnd,
              minutesToEnd: minutesToEnd
            })

            // Сначала обновляем state
            set((state) => {
              state.state.isEnabled = true
              state.state.mode = 'endOfSong'
              state.state.remainingSeconds = Math.floor(timeToEnd)
              state.state.presetMinutes = minutesToEnd
            })

            // Трекаем событие
            trackSleepTimerSet(minutesToEnd)

            // Запускаем таймер ПОСЛЕ обновления state (через setTimeout чтобы state успел обновиться)
            setTimeout(() => {
              console.log('[SleepTimer] Starting endOfSong timer with', Math.floor(timeToEnd), 'seconds')
              startEndOfSongTimer()
            }, 100)
          },

          disable: () => {
            set((state) => {
              state.state.isEnabled = false
              state.state.mode = 'timed'
              state.state.remainingSeconds = 0
              state.state.presetMinutes = 0
            })

            // Останавливаем таймер
            stopTimer()
          },

          setRemainingSeconds: (seconds: number) => {
            set((state) => {
              state.state.remainingSeconds = seconds
            })

            // Если время вышло, останавливаем воспроизведение с затуханием
            if (seconds <= 0) {
              handleTimerComplete()
            }
          },

          reset: () => {
            get().disable()
          },

          isActive: () => {
            return get().state.isEnabled
          },

          getRemainingTime: () => {
            const { remainingSeconds } = get().state

            if (remainingSeconds <= 0) return '00:00'

            const minutes = Math.floor(remainingSeconds / 60)
            const seconds = remainingSeconds % 60

            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
          },
        })),
        {
          name: 'sleep_timer_store',
        },
      ),
    ),
    {
      name: 'sleep-timer-persistence',
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

export const useSleepTimer = () => useSleepTimerStore((state) => state)
