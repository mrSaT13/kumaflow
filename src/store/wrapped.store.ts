import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

export interface WrappedArtist {
  id: string
  name: string
  playCount: number
  image?: string
}

export interface WrappedTrack {
  id: string
  title: string
  artist: string
  artistId: string
  playCount: number
  genre?: string
}

export interface WrappedGenre {
  name: string
  playCount: number
  trackCount: number
}

export interface WrappedMonthData {
  month: number // 0-11
  year: number
  topArtists: WrappedArtist[]
  topTracks: WrappedTrack[]
  topGenres: WrappedGenre[]
  totalPlays: number
  totalHours: number
}

export interface WrappedYearData {
  year: number
  months: WrappedMonthData[]
  topArtists: WrappedArtist[]
  topTracks: WrappedTrack[]
  topGenres: WrappedGenre[]
  totalPlays: number
  totalHours: number
  totalDays: number
  favoriteArtist?: WrappedArtist
  favoriteTrack?: WrappedTrack
  favoriteGenre?: WrappedGenre
}

interface WrappedStore {
  currentYear: number
  years: Record<number, WrappedYearData>
  
  // Actions
  setYear: (year: number) => void
  addYearData: (year: number, data: WrappedYearData) => void
  getYearData: (year: number) => WrappedYearData | null
  clearData: () => void
  hasData: (year: number) => boolean
}

const defaultState = {
  currentYear: new Date().getFullYear(),
  years: {} as Record<number, WrappedYearData>,
}

export const useWrappedStore = createWithEqualityFn<WrappedStore>()(
  persist(
    subscribeWithSelector(
      devtools(
        immer((set, get) => ({
          ...defaultState,

          setYear: (year: number) => {
            set((state) => {
              state.currentYear = year
            })
          },

          addYearData: (year: number, data: WrappedYearData) => {
            set((state) => {
              state.years[year] = data
            })
          },

          getYearData: (year: number) => {
            return get().years[year] || null
          },

          clearData: () => {
            set((state) => {
              state.years = {}
            })
          },

          hasData: (year: number) => {
            return !!get().years[year]
          },
        })),
        {
          name: 'wrapped_store',
        },
      ),
    ),
    {
      name: 'wrapped-persistence',
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

export const useWrapped = () => useWrappedStore((state) => state)
