import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'
import type { ISong } from '@/types/responses/song'

export interface MLGeneratedPlaylist {
  id: string
  type: 'daily-mix' | 'discover-weekly' | 'my-wave' | 'trends'
  name: string
  description: string
  songs: ISong[]
  createdAt: string
  lastUpdated: string  // Дата последнего обновления
  expiresAt?: string
  autoUpdateHours?: number
  llmComment?: string  // Короткий комментарий от LLM о плейлисте
  sharedTracksInfo?: Record<string, { accounts: string[]; totalPlays: number; songKey?: string }>  // Информация о shared listens
}

interface MLPlaylistsState {
  playlists: MLGeneratedPlaylist[]
  lastGenerated: Record<string, string>
  autoUpdateEnabled: boolean
  updateIntervalHours: number

  // Actions
  addPlaylist: (playlist: MLGeneratedPlaylist) => void
  removePlaylist: (id: string) => void
  updatePlaylist: (id: string, updates: Partial<MLGeneratedPlaylist>) => void
  getPlaylist: (type: string) => MLGeneratedPlaylist | undefined
  clearExpiredPlaylists: () => void
  setAutoUpdateEnabled: (enabled: boolean) => void
  setUpdateInterval: (hours: number) => void
  updateLastGenerated: (type: string, date: string) => void
  shouldRegenerate: (type: string) => boolean
}

const defaultState = {
  playlists: [],
  lastGenerated: {},
  autoUpdateEnabled: true,
  updateIntervalHours: 24,
}

export const useMLPlaylistsState = createWithEqualityFn<MLPlaylistsState>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          ...defaultState,

          addPlaylist: (playlist) => {
            set((state) => {
              // Ищем существующий плейлист по ID (не по типу!)
              const existingIndex = state.playlists.findIndex(p => p.id === playlist.id)

              if (existingIndex !== -1) {
                // Обновляем существующий — сохраняем СТАРЫЙ ID и дату создания
                const existingPlaylist = state.playlists[existingIndex]
                state.playlists[existingIndex] = {
                  ...existingPlaylist,  // Сохраняем id и createdAt из существующего
                  ...playlist,  // Применяем новые данные
                  id: existingPlaylist.id,  // ← Сохраняем старый ID
                  createdAt: existingPlaylist.createdAt,  // ← Сохраняем дату создания
                }
              } else {
                // Добавляем новый - используем ID из плейлиста или генерируем
                const fixedId = playlist.id || `ml_${playlist.type}`
                state.playlists.push({
                  ...playlist,
                  id: fixedId,  // ← Используем ID из плейлиста
                })
              }

              state.lastGenerated[playlist.type] = playlist.createdAt
            })
          },

          removePlaylist: (id) => {
            set((state) => {
              state.playlists = state.playlists.filter(p => p.id !== id)
            })
          },

          updatePlaylist: (id, updates) => {
            set((state) => {
              const playlistIndex = state.playlists.findIndex(p => p.id === id)
              if (playlistIndex !== -1) {
                state.playlists[playlistIndex] = {
                  ...state.playlists[playlistIndex],
                  ...updates,
                }
              }
            })
          },

          getPlaylist: (id) => {
            const state = get()
            console.log('[ml-playlists-state] getPlaylist called with id:', id)
            console.log('[ml-playlists-state] Available playlists:', state.playlists.map(p => ({ id: p.id, type: p.type, name: p.name })))
            
            // Ищем по ID (полное совпадение)
            const byId = state.playlists.find(p => p.id === id)
            if (byId) {
              console.log('[ml-playlists-state] Found by ID:', byId)
              return byId
            }

            // Если не найдено по ID, ищем по type (для обратной совместимости)
            const byType = state.playlists.find(p => p.type === id)
            if (byType) {
              console.log('[ml-playlists-state] Found by type:', byType)
              return byType
            }
            
            console.log('[ml-playlists-state] Playlist not found!')
            return undefined
          },

          clearExpiredPlaylists: () => {
            set((state) => {
              const now = new Date()
              state.playlists = state.playlists.filter(playlist => {
                if (!playlist.expiresAt) return true
                return new Date(playlist.expiresAt) > now
              })
            })
          },

          setAutoUpdateEnabled: (enabled) => {
            set((state) => {
              state.autoUpdateEnabled = enabled
            })
          },

          setUpdateInterval: (hours) => {
            set((state) => {
              state.updateIntervalHours = hours
            })
          },

          updateLastGenerated: (type, date) => {
            set((state) => {
              state.lastGenerated[type] = date
            })
          },

          shouldRegenerate: (type) => {
            const state = get()
            const lastGen = state.lastGenerated[type]
            
            if (!lastGen) return true
            
            const last = new Date(lastGen)
            const now = new Date()
            const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)
            
            return hoursSince >= state.updateIntervalHours
          },
        })),
        {
          name: 'ml_playlists_state',
        },
      ),
    ),
    {
      name: 'ml-playlists-state-persistence',
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

export const useMLPlaylistsStateActions = () => useMLPlaylistsState((state) => ({
  addPlaylist: state.addPlaylist,
  removePlaylist: state.removePlaylist,
  getPlaylist: state.getPlaylist,
  clearExpiredPlaylists: state.clearExpiredPlaylists,
  setAutoUpdateEnabled: state.setAutoUpdateEnabled,
  setUpdateInterval: state.setUpdateInterval,
  shouldRegenerate: state.shouldRegenerate,
}))
