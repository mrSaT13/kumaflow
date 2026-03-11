/**
 * Store для кастомизации плеера
 * 
 * Позволяет настраивать:
 * - Тип прогресс-бара (slider, bar, waveform)
 * - Иконку маркера (circle, square, diamond, custom)
 * - Цвет прогресса
 * - Высоту прогресс-бара
 */

import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export type ProgressType = 'slider' | 'bar' | 'waveform'
export type ProgressIcon = 'circle' | 'square' | 'diamond' | 'custom'

export interface PlayerCustomization {
  // Тип прогресс-бара
  progressType: ProgressType
  
  // Иконка маркера прогресса
  progressIcon: ProgressIcon
  
  // Custom SVG иконка (base64 или URL)
  customIconSvg?: string
  
  // Цвет прогресс-бара (hex)
  progressColor: string
  
  // Высота прогресс-бара (px)
  progressHeight: number
  
  // Размер маркера (множитель 1.0-3.0)
  markerSize: number
  
  // Анимация при наведении
  hoverAnimation: boolean
  
  // Показывать время при наведении
  showTimeOnHover: boolean
  
  // ВАУ-эффекты:
  // Свечение маркера (glow effect)
  glowEffect: boolean
  
  // Количество слоёв свечения (1-10)
  glowLayers: number
  
  // Пульсация при воспроизведении
  pulseOnPlay: boolean
  
  // Градиентный прогресс
  gradientProgress: boolean
  
  // Анимированная иконка (GIF/SVG animation)
  animatedIcon?: string  // URL или base64 GIF/SVG
  
  // Скорость анимации (ms)
  animationSpeed: number
  
  // Тип анимации
  animationType: 'none' | 'rotate' | 'scale' | 'bounce' | 'spin'
  
  // Вращение при наведении (градусы)
  hoverRotation: number
}

interface PlayerCustomizationStore {
  settings: PlayerCustomization
  
  // Actions
  setProgressType: (type: ProgressType) => void
  setProgressIcon: (icon: ProgressIcon) => void
  setCustomIconSvg: (svg: string) => void
  setProgressColor: (color: string) => void
  setProgressHeight: (height: number) => void
  setHoverAnimation: (enabled: boolean) => void
  setShowTimeOnHover: (enabled: boolean) => void
  resetToDefaults: () => void
}

const defaultSettings: PlayerCustomization = {
  progressType: 'slider',
  progressIcon: 'circle',
  progressColor: '#10b981',  // emerald-500
  progressHeight: 4,
  markerSize: 1.5,  // Увеличенный размер по умолчанию для SVG
  hoverAnimation: true,
  showTimeOnHover: true,
  // ВАУ-эффекты по умолчанию выключены
  glowEffect: false,
  glowLayers: 5,  // 5 слоёв по умолчанию
  pulseOnPlay: false,
  gradientProgress: false,
  animatedIcon: undefined,
  animationSpeed: 1000,  // 1 секунда
  animationType: 'none',
  hoverRotation: 15,  // 15 градусов
}

export const usePlayerCustomizationStore = createWithEqualityFn<PlayerCustomizationStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set) => ({
          settings: defaultSettings,

          setProgressType: (type) => {
            set((state) => {
              state.settings.progressType = type
            })
          },

          setProgressIcon: (icon) => {
            set((state) => {
              state.settings.progressIcon = icon
            })
          },

          setCustomIconSvg: (svg) => {
            set((state) => {
              state.settings.customIconSvg = svg
            })
          },

          setProgressColor: (color) => {
            set((state) => {
              state.settings.progressColor = color
            })
          },

          setProgressHeight: (height) => {
            set((state) => {
              state.settings.progressHeight = Math.max(2, Math.min(12, height))
            })
          },

          setMarkerSize: (size) => {
            set((state) => {
              state.settings.markerSize = Math.max(0.5, Math.min(3.0, size))
            })
          },

          setHoverAnimation: (enabled) => {
            set((state) => {
              state.settings.hoverAnimation = enabled
            })
          },

          setShowTimeOnHover: (enabled) => {
            set((state) => {
              state.settings.showTimeOnHover = enabled
            })
          },

          // ВАУ-эффекты actions
          setGlowEffect: (enabled) => {
            set((state) => {
              state.settings.glowEffect = enabled
            })
          },

          setGlowLayers: (layers) => {
            set((state) => {
              state.settings.glowLayers = Math.max(1, Math.min(10, layers))
            })
          },

          setPulseOnPlay: (enabled) => {
            set((state) => {
              state.settings.pulseOnPlay = enabled
            })
          },

          setGradientProgress: (enabled) => {
            set((state) => {
              state.settings.gradientProgress = enabled
            })
          },

          setAnimatedIcon: (icon) => {
            set((state) => {
              state.settings.animatedIcon = icon
            })
          },

          setAnimationSpeed: (speed) => {
            set((state) => {
              state.settings.animationSpeed = Math.max(200, Math.min(5000, speed))
            })
          },

          setAnimationType: (type) => {
            set((state) => {
              state.settings.animationType = type
            })
          },

          setHoverRotation: (degrees) => {
            set((state) => {
              state.settings.hoverRotation = Math.max(0, Math.min(360, degrees))
            })
          },

          resetToDefaults: () => {
            set((state) => {
              state.settings = defaultSettings
            })
          },
        })),
        {
          name: 'player_customization_settings',
        },
      ),
    ),
    {
      name: 'player-customization-persistence',
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

export const usePlayerCustomization = () => usePlayerCustomizationStore((state) => state.settings)
export const usePlayerCustomizationActions = () => usePlayerCustomizationStore((state) => ({
  setProgressType: state.setProgressType,
  setProgressIcon: state.setProgressIcon,
  setCustomIconSvg: state.setCustomIconSvg,
  setProgressColor: state.setProgressColor,
  setProgressHeight: state.setProgressHeight,
  setMarkerSize: state.setMarkerSize,
  setHoverAnimation: state.setHoverAnimation,
  setShowTimeOnHover: state.setShowTimeOnHover,
  // ВАУ-эффекты
  setGlowEffect: state.setGlowEffect,
  setGlowLayers: state.setGlowLayers,
  setPulseOnPlay: state.setPulseOnPlay,
  setGradientProgress: state.setGradientProgress,
  setAnimatedIcon: state.setAnimatedIcon,
  setAnimationSpeed: state.setAnimationSpeed,
  setAnimationType: state.setAnimationType,
  setHoverRotation: state.setHoverRotation,
  resetToDefaults: state.resetToDefaults,
}))
