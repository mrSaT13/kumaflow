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
  expiresAt?: string
  autoUpdateHours?: number
}

interface MLPlaylistsState {
  playlists: MLGeneratedPlaylist[]
  lastGenerated: Record<string, string>
  autoUpdateEnabled: boolean
  updateIntervalHours: number
  
  // Actions
  addPlaylist: (playlist: MLGeneratedPlaylist) => void
  removePlaylist: (id: string) => void
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
              // Удаляем старую версию такого же плейлиста
              state.playlists = state.playlists.filter(p => p.type !== playlist.type)
              state.playlists.push(playlist)
              state.lastGenerated[playlist.type] = playlist.createdAt
            })
          },

          removePlaylist: (id) => {
            set((state) => {
              state.playlists = state.playlists.filter(p => p.id !== id)
            })
          },

          getPlaylist: (type) => {
            const state = get()
            return state.playlists.find(p => p.type === type)
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
