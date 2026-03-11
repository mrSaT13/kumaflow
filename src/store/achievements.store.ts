import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  unlockedAt?: string
  progress: number
  maxProgress: number
  category: 'listening' | 'likes' | 'playlists' | 'discovery'
}

interface AchievementsStore {
  achievements: Achievement[]
  
  // Actions
  updateProgress: (achievementId: string, progress: number) => void
  unlock: (achievementId: string) => void
  checkAll: (stats: AchievementStats) => void
  getUnlockedCount: () => number
  getTotalCount: () => number
}

export interface AchievementStats {
  totalPlays: number
  totalLikes: number
  totalDislikes: number
  totalSkips: number
  totalPlaylists: number
  totalGenres: number
  totalArtists: number
  daysSinceFirstListen: number
}

const defaultAchievements: Achievement[] = [
  // Listening achievements
  {
    id: 'listener_1',
    title: 'Начинающий слушатель',
    description: 'Прослушать 100 треков',
    icon: '🎵',
    unlocked: false,
    progress: 0,
    maxProgress: 100,
    category: 'listening',
  },
  {
    id: 'listener_2',
    title: 'Любитель музыки',
    description: 'Прослушать 500 треков',
    icon: '🎧',
    unlocked: false,
    progress: 0,
    maxProgress: 500,
    category: 'listening',
  },
  {
    id: 'listener_3',
    title: 'Меломан',
    description: 'Прослушать 1000 треков',
    icon: '🎼',
    unlocked: false,
    progress: 0,
    maxProgress: 1000,
    category: 'listening',
  },
  {
    id: 'listener_4',
    title: 'Легенда',
    description: 'Прослушать 5000 треков',
    icon: '👑',
    unlocked: false,
    progress: 0,
    maxProgress: 5000,
    category: 'listening',
  },
  
  // Likes achievements
  {
    id: 'likes_1',
    title: 'Первый лайк',
    description: 'Лайкнуть 10 треков',
    icon: '👍',
    unlocked: false,
    progress: 0,
    maxProgress: 10,
    category: 'likes',
  },
  {
    id: 'likes_2',
    title: 'Ценитель',
    description: 'Лайкнуть 50 треков',
    icon: '❤️',
    unlocked: false,
    progress: 0,
    maxProgress: 50,
    category: 'likes',
  },
  {
    id: 'likes_3',
    title: 'Коллекционер',
    description: 'Лайкнуть 100 треков',
    icon: '💖',
    unlocked: false,
    progress: 0,
    maxProgress: 100,
    category: 'likes',
  },
  
  // Discovery achievements
  {
    id: 'discovery_1',
    title: 'Исследователь',
    description: 'Найти 10 новых артистов',
    icon: '🧭',
    unlocked: false,
    progress: 0,
    maxProgress: 10,
    category: 'discovery',
  },
  {
    id: 'discovery_2',
    title: 'Первооткрыватель',
    description: 'Найти 50 новых артистов',
    icon: '🗺️',
    unlocked: false,
    progress: 0,
    maxProgress: 50,
    category: 'discovery',
  },
  
  // Playlist achievements
  {
    id: 'playlist_1',
    title: 'Куратор',
    description: 'Создать 5 плейлистов',
    icon: '📋',
    unlocked: false,
    progress: 0,
    maxProgress: 5,
    category: 'playlists',
  },
  {
    id: 'playlist_2',
    title: 'Ди-джей',
    description: 'Сгенерировать 10 ML плейлистов',
    icon: '🎚️',
    unlocked: false,
    progress: 0,
    maxProgress: 10,
    category: 'playlists',
  },
]

export const useAchievementsStore = createWithEqualityFn<AchievementsStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          achievements: defaultAchievements,

          updateProgress: (achievementId: string, progress: number) => {
            set((state) => {
              const achievement = state.achievements.find(a => a.id === achievementId)
              if (achievement && !achievement.unlocked) {
                achievement.progress = Math.min(progress, achievement.maxProgress)
                
                // Автоматическая разблокировка
                if (achievement.progress >= achievement.maxProgress) {
                  achievement.unlocked = true
                  achievement.unlockedAt = new Date().toISOString()
                  console.log(`🏆 Achievement unlocked: ${achievement.title}`)
                }
              }
            })
          },

          unlock: (achievementId: string) => {
            set((state) => {
              const achievement = state.achievements.find(a => a.id === achievementId)
              if (achievement && !achievement.unlocked) {
                achievement.unlocked = true
                achievement.unlockedAt = new Date().toISOString()
                achievement.progress = achievement.maxProgress
                console.log(`🏆 Achievement unlocked: ${achievement.title}`)
              }
            })
          },

          checkAll: (stats: AchievementStats) => {
            const { updateProgress } = get()
            
            // Listening
            updateProgress('listener_1', stats.totalPlays)
            updateProgress('listener_2', stats.totalPlays)
            updateProgress('listener_3', stats.totalPlays)
            updateProgress('listener_4', stats.totalPlays)
            
            // Likes
            updateProgress('likes_1', stats.totalLikes)
            updateProgress('likes_2', stats.totalLikes)
            updateProgress('likes_3', stats.totalLikes)
            
            // Discovery
            updateProgress('discovery_1', stats.totalArtists)
            updateProgress('discovery_2', stats.totalArtists)
            
            // Playlists (будет обновляться отдельно)
          },

          getUnlockedCount: () => {
            return get().achievements.filter(a => a.unlocked).length
          },

          getTotalCount: () => {
            return get().achievements.length
          },
        })),
        {
          name: 'achievements_store',
        },
      ),
    ),
    {
      name: 'achievements-persistence',
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

export const useAchievements = () => useAchievementsStore((state) => state)
