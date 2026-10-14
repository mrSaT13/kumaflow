import { devtools, persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'

export interface PinnedArtist {
  artistId: string
  artistName: string
  coverArt?: string
  pinnedAt: number
}

/** Лимит пинов, чтобы сайдбар не превращался в простыню. */
export const MAX_PINNED_ARTISTS = 20

interface PinnedArtistsStore {
  pinned: PinnedArtist[]

  pin: (artist: { artistId: string; artistName: string; coverArt?: string }) => void
  unpin: (artistId: string) => void
  isPinned: (artistId: string) => boolean
  clearAll: () => void
}

export const usePinnedArtistsStore = createWithEqualityFn<PinnedArtistsStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          pinned: [],

          pin: (artist) => {
            set((state) => {
              if (state.pinned.some((p) => p.artistId === artist.artistId)) return
              if (state.pinned.length >= MAX_PINNED_ARTISTS) {
                state.pinned.shift()
              }
              state.pinned.push({ ...artist, pinnedAt: Date.now() })
            })
          },

          unpin: (artistId) => {
            set((state) => {
              state.pinned = state.pinned.filter((p) => p.artistId !== artistId)
            })
          },

          isPinned: (artistId: string) => {
            return get().pinned.some((p) => p.artistId === artistId)
          },

          clearAll: () => {
            set({ pinned: [] })
          },
        })),
        {
          name: 'pinned_artists_store',
        },
      ),
    ),
    {
      name: 'pinned-artists-persistence',
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

export const usePinnedArtists = () => usePinnedArtistsStore((state) => state.pinned)
export const usePinnedArtistsActions = () => usePinnedArtistsStore((state) => ({
  pin: state.pin,
  unpin: state.unpin,
  isPinned: state.isPinned,
  clearAll: state.clearAll,
}))
