/**
 * Store для добавленных подкастов (независимых от сервера)
 * "local" означает что хранятся локально в браузере, а не на сервере
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface LocalPodcast {
  id: string
  title: string
  author: string
  description: string
  imageUrl: string
  rssUrl: string
  episodeCount: number
  createdAt: number
  lastUpdated: number
}

interface LocalPodcastsState {
  podcasts: LocalPodcast[]
  addPodcast: (podcast: LocalPodcast) => void
  removePodcast: (id: string) => void
  updatePodcast: (id: string, updates: Partial<LocalPodcast>) => void
  getPodcast: (id: string) => LocalPodcast | undefined
}

export const useLocalPodcastsStore = create<LocalPodcastsState>()(
  persist(
    (set, get) => ({
      podcasts: [],
      
      addPodcast: (podcast) => {
        set((state) => ({
          podcasts: [...state.podcasts, podcast]
        }))
      },
      
      removePodcast: (id) => {
        set((state) => ({
          podcasts: state.podcasts.filter(p => p.id !== id)
        }))
      },
      
      updatePodcast: (id, updates) => {
        set((state) => ({
          podcasts: state.podcasts.map(p => 
            p.id === id ? { ...p, ...updates } : p
          )
        }))
      },
      
      getPodcast: (id) => {
        return get().podcasts.find(p => p.id === id)
      },
    }),
    {
      name: 'local-podcasts-storage',
    }
  )
)
