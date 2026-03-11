import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

interface PlaybackSettings {
  scrobbleEnabled: boolean
  scrobbleThresholdSeconds: number
  gaplessPlayback: boolean
  crossfadeEnabled: boolean
  crossfadeSeconds: number
  replayGainEnabled: boolean
  replayGainMode: 'album' | 'track' | 'off'
  floatingPlayerEnabled: boolean
  floatingPlayerPosition: { x: number; y: number } | null
  progressBarType: 'line' | 'dot' | 'spectrogram'  // Тип прогресс бара
}

interface PlaybackStore {
  settings: PlaybackSettings

  // Actions
  setScrobbleEnabled: (enabled: boolean) => void
  setScrobbleThreshold: (seconds: number) => void
  setGaplessPlayback: (enabled: boolean) => void
  setCrossfadeEnabled: (enabled: boolean) => void
  setCrossfadeSeconds: (seconds: number) => void
  setReplayGainEnabled: (enabled: boolean) => void
  setReplayGainMode: (mode: 'album' | 'track' | 'off') => void
  setFloatingPlayerEnabled: (enabled: boolean) => void
  setFloatingPlayerPosition: (position: { x: number; y: number } | null) => void
  setProgressBarType: (type: 'line' | 'wave' | 'dot') => void  // Новый action
}

const defaultSettings: PlaybackSettings = {
  scrobbleEnabled: true,
  scrobbleThresholdSeconds: 30,
  gaplessPlayback: true,
  crossfadeEnabled: false,
  crossfadeSeconds: 5,
  replayGainEnabled: false,
  replayGainMode: 'album',
  floatingPlayerEnabled: false,
  floatingPlayerPosition: null,
  progressBarType: 'line',  // По умолчанию обычный прогресс бар
}

export const usePlaybackStore = createWithEqualityFn<PlaybackStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          settings: defaultSettings,

          setScrobbleEnabled: (enabled) => {
            set((state) => {
              state.settings.scrobbleEnabled = enabled
            })
          },

          setScrobbleThreshold: (seconds) => {
            set((state) => {
              state.settings.scrobbleThresholdSeconds = seconds
            })
          },

          setGaplessPlayback: (enabled) => {
            set((state) => {
              state.settings.gaplessPlayback = enabled
            })
          },

          setCrossfadeEnabled: (enabled) => {
            set((state) => {
              state.settings.crossfadeEnabled = enabled
            })
          },

          setCrossfadeSeconds: (seconds) => {
            set((state) => {
              state.settings.crossfadeSeconds = seconds
            })
          },

          setReplayGainEnabled: (enabled) => {
            set((state) => {
              state.settings.replayGainEnabled = enabled
            })
          },

          setReplayGainMode: (mode) => {
            set((state) => {
              state.settings.replayGainMode = mode
            })
          },

          setFloatingPlayerEnabled: (enabled) => {
            set((state) => {
              state.settings.floatingPlayerEnabled = enabled
            })
          },

          setFloatingPlayerPosition: (position) => {
            set((state) => {
              state.settings.floatingPlayerPosition = position
            })
          },

          setProgressBarType: (type) => {
            set((state) => {
              state.settings.progressBarType = type
            })
          },
        })),
        {
          name: 'playback_store',
        },
      ),
    ),
    {
      name: 'playback-persistence',
      storage: {
        getItem: async (name) => {
          const item = localStorage.getItem(name)
          if (!item) return null
          
          const data = JSON.parse(item)
          
          // Миграция старых значений progressBarType
          if (data?.state?.settings?.progressBarType) {
            const oldType = data.state.settings.progressBarType
            if (oldType === 'wave' || oldType === 'spectrum') {
              data.state.settings.progressBarType = 'spectrogram'
              localStorage.setItem(name, JSON.stringify(data))
            }
          }
          
          return data
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

export const usePlaybackSettings = () => usePlaybackStore((state) => state)
export const usePlaybackActions = () => usePlaybackStore((state) => ({
  setScrobbleEnabled: state.setScrobbleEnabled,
  setScrobbleThreshold: state.setScrobbleThreshold,
  setGaplessPlayback: state.setGaplessPlayback,
  setCrossfadeEnabled: state.setCrossfadeEnabled,
  setCrossfadeSeconds: state.setCrossfadeSeconds,
  setReplayGainEnabled: state.setReplayGainEnabled,
  setReplayGainMode: state.setReplayGainMode,
  setFloatingPlayerEnabled: state.setFloatingPlayerEnabled,
  setFloatingPlayerPosition: state.setFloatingPlayerPosition,
  setProgressBarType: state.setProgressBarType,
}))
