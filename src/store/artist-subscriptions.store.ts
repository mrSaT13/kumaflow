import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface ArtistSubscription {
  artistId: string
  artistName: string
  subscribedAt: number
  lastCheckAt?: number
  lastKnownTrackId?: string
  lastKnownTrackName?: string
}

interface ArtistSubscriptionsStore {
  subscriptions: ArtistSubscription[]
  notificationsEnabled: boolean
  
  // Actions
  subscribe: (artistId: string, artistName: string) => void
  unsubscribe: (artistId: string) => void
  isSubscribed: (artistId: string) => boolean
  updateLastCheck: (artistId: string, trackId?: string, trackName?: string) => void
  setNotificationsEnabled: (enabled: boolean) => void
  clearAll: () => void
  
  // Getters
  getSubscriptions: () => ArtistSubscription[]
}

const defaultSubscriptions: ArtistSubscription[] = []

export const useArtistSubscriptionsStore = createWithEqualityFn<ArtistSubscriptionsStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          subscriptions: defaultSubscriptions,
          notificationsEnabled: true,
          
          subscribe: (artistId: string, artistName: string) => {
            set((state) => {
              const exists = state.subscriptions.find(s => s.artistId === artistId)
              if (!exists) {
                state.subscriptions.push({
                  artistId,
                  artistName,
                  subscribedAt: Date.now(),
                })
                console.log(`[ArtistSubscriptions] Подписка на "${artistName}"`)
              }
            })
          },
          
          unsubscribe: (artistId: string) => {
            set((state) => {
              const sub = state.subscriptions.find(s => s.artistId === artistId)
              if (sub) {
                state.subscriptions = state.subscriptions.filter(s => s.artistId !== artistId)
                console.log(`[ArtistSubscriptions] Отписка от "${sub.artistName}"`)
              }
            })
          },
          
          isSubscribed: (artistId: string) => {
            return get().subscriptions.some(s => s.artistId === artistId)
          },
          
          updateLastCheck: (artistId: string, trackId?: string, trackName?: string) => {
            set((state) => {
              const sub = state.subscriptions.find(s => s.artistId === artistId)
              if (sub) {
                sub.lastCheckAt = Date.now()
                if (trackId) sub.lastKnownTrackId = trackId
                if (trackName) sub.lastKnownTrackName = trackName
              }
            })
          },
          
          setNotificationsEnabled: (enabled: boolean) => {
            set({ notificationsEnabled: enabled })
          },
          
          clearAll: () => {
            set({ subscriptions: [] })
          },
          
          getSubscriptions: () => {
            return get().subscriptions
          },
        })),
        {
          name: 'artist_subscriptions_store',
        },
      ),
    ),
    {
      name: 'artist-subscriptions',
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

export const useArtistSubscriptions = () => useArtistSubscriptionsStore((state) => state)
