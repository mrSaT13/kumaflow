/**
 * Store для аватара аккаунта
 * 
 * Хранит:
 * - Аватар (base64 или URL)
 * - Позицию crop (x, y)
 * - Масштаб
 */

import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface AvatarSettings {
  // Данные аватара (base64 или URL)
  avatarData?: string
  
  // Позиция crop (проценты 0-100)
  cropX: number
  cropY: number
  
  // Масштаб (0.5-3.0)
  scale: number
  
  // Размер аватара (px)
  size: number
}

interface AvatarStore {
  settings: AvatarSettings
  
  // Actions
  setAvatarData: (data: string) => void
  setCropPosition: (x: number, y: number) => void
  setScale: (scale: number) => void
  setSize: (size: number) => void
  resetAvatar: () => void
}

const defaultSettings: AvatarSettings = {
  avatarData: undefined,
  cropX: 50,  // Центр
  cropY: 50,  // Центр
  scale: 1.0,
  size: 32,  // Стандартный размер
}

export const useAvatarStore = createWithEqualityFn<AvatarStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          settings: defaultSettings,

          setAvatarData: (data) => {
            set((state) => {
              state.settings.avatarData = data
            })
          },

          setCropPosition: (x, y) => {
            set((state) => {
              state.settings.cropX = Math.max(0, Math.min(100, x))
              state.settings.cropY = Math.max(0, Math.min(100, y))
            })
          },

          setScale: (scale) => {
            set((state) => {
              state.settings.scale = Math.max(0.5, Math.min(3.0, scale))
            })
          },

          setSize: (size) => {
            set((state) => {
              state.settings.size = Math.max(24, Math.min(64, size))
            })
          },

          resetAvatar: () => {
            set((state) => {
              state.settings = defaultSettings
            })
          },
        })),
        {
          name: 'avatar_settings',
        },
      ),
    ),
    {
      name: 'avatar-persistence',
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

export const useAvatar = () => useAvatarStore((state) => state.settings)
export const useAvatarActions = () => useAvatarStore((state) => ({
  setAvatarData: state.setAvatarData,
  setCropPosition: state.setCropPosition,
  setScale: state.setScale,
  setSize: state.setSize,
  resetAvatar: state.resetAvatar,
}))
