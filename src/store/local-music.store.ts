/**
 * Store для управления локальной музыкой
 *
 * Хранит:
 * - Список локальных папок с музыкой
 * - Отсканированные треки
 * - Настройки сканирования
 */

import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createWithEqualityFn } from 'zustand/traditional'
import { persist } from 'zustand/middleware'

/**
 * Локальная папка с музыкой
 */
export interface LocalMusicFolder {
  id: string
  path: string
  name: string
  enabled: boolean
  lastScannedAt?: number
  trackCount?: number
}

/**
 * Локальный трек
 */
export interface LocalTrack {
  id: string
  path: string
  filename: string
  title: string
  artist: string
  album?: string
  albumArtist?: string
  genre?: string
  year?: number
  trackNumber?: number
  duration?: number
  bitrate?: number
  sampleRate?: number
  fileSize?: number
  format?: string // 'mp3', 'flac', 'wav', etc.
  coverArtPath?: string
  folderId: string
  createdAt: number
  updatedAt: number
}

/**
 * Настройки сканирования
 */
export interface ScanSettings {
  autoScan: boolean
  scanInterval: number // в минутах
  watchForChanges: boolean
  includeSubfolders: boolean
  supportedFormats: string[]
}

const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  autoScan: true,
  scanInterval: 60, // 1 час
  watchForChanges: true,
  includeSubfolders: true,
  supportedFormats: ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'wma', 'aac'],
}

interface LocalMusicStore {
  // Состояние
  folders: LocalMusicFolder[]
  tracks: LocalTrack[]
  scanSettings: ScanSettings
  isScanning: boolean
  scanProgress: number // 0-100

  // Actions - Folders
  addFolder: (path: string, name?: string) => Promise<void>
  removeFolder: (folderId: string) => void
  toggleFolder: (folderId: string) => void
  updateFolder: (folderId: string, updates: Partial<LocalMusicFolder>) => void

  // Actions - Scanning
  startScan: (folderId?: string) => Promise<void>
  stopScan: () => void
  updateScanSettings: (settings: Partial<ScanSettings>) => void

  // Actions - Tracks
  getTracksByFolder: (folderId: string) => LocalTrack[]
  getTracksByArtist: (artist: string) => LocalTrack[]
  getTracksByAlbum: (album: string) => LocalTrack[]
  searchTracks: (query: string) => LocalTrack[]

  // Utils
  clearAllData: () => void
}

const defaultState = {
  folders: [] as LocalMusicFolder[],
  tracks: [] as LocalTrack[],
  scanSettings: DEFAULT_SCAN_SETTINGS,
  isScanning: false,
  scanProgress: 0,
}

export const useLocalMusicStore = createWithEqualityFn<LocalMusicStore>()(
  persist(
    devtools(
      immer((set, get) => ({
        ...defaultState,

        // ========== FOLDERS ==========

        addFolder: async (path, name) => {
          const folder: LocalMusicFolder = {
            id: `local_folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            path,
            name: name || path.split(/[\\/]/).pop() || 'Локальная музыка',
            enabled: true,
          }

          set((state) => {
            state.folders.push(folder)
          })

          // Автоматически запускаем сканирование после добавления
          await get().startScan(folder.id)
        },

        removeFolder: (folderId) => {
          set((state) => {
            state.folders = state.folders.filter((f) => f.id !== folderId)
            state.tracks = state.tracks.filter((t) => t.folderId !== folderId)
          })
        },

        toggleFolder: (folderId) => {
          set((state) => {
            const folder = state.folders.find((f) => f.id === folderId)
            if (folder) {
              folder.enabled = !folder.enabled
            }
          })
        },

        updateFolder: (folderId, updates) => {
          set((state) => {
            const folder = state.folders.find((f) => f.id === folderId)
            if (folder) {
              Object.assign(folder, updates)
            }
          })
        },

        // ========== SCANNING ==========

        startScan: async (folderId) => {
          const state = get()
          if (state.isScanning) return

          set({ isScanning: true, scanProgress: 0 })

          try {
            // Импортируем сервис сканирования
            const { scanLocalFolder } = await import('@/service/local-music-scanner')

            const foldersToScan = folderId
              ? state.folders.filter((f) => f.id === folderId && f.enabled)
              : state.folders.filter((f) => f.enabled)

            console.log('[Local Music] Folders to scan:', foldersToScan.length)

            let totalScanned = 0
            const newTracks: LocalTrack[] = []

            for (const folder of foldersToScan) {
              console.log('[Local Music] Scanning folder:', folder.path)

              const result = await scanLocalFolder(folder.path, folder.id)

              console.log('[Local Music] Found', result.tracks.length, 'tracks in folder')

              newTracks.push(...result.tracks)
              totalScanned += result.tracks.length

              set({
                scanProgress: Math.round(((folderId ? 1 : foldersToScan.indexOf(folder) + 1) / foldersToScan.length) * 100),
              })

              // Обновляем метаданные папки
              get().updateFolder(folder.id, {
                lastScannedAt: Date.now(),
                trackCount: result.tracks.length,
              })
            }

            console.log('[Local Music] Total new tracks:', newTracks.length)

            // Обновляем треки - добавляем новые, не удаляя старые из других папок
            set((state) => {
              const folderIds = foldersToScan.map((f) => f.id)
              
              // Удаляем старые треки только из сканируемых папок
              const otherTracks = state.tracks.filter((t) => !folderIds.includes(t.folderId))
              
              // Добавляем новые треки
              state.tracks = [...otherTracks, ...newTracks]
              
              console.log('[Local Music] Total tracks after scan:', state.tracks.length)
            })

            console.log('[Local Music] Scan complete:', totalScanned, 'tracks found')
          } catch (error) {
            console.error('[Local Music] Scan error:', error)
          } finally {
            set({ isScanning: false, scanProgress: 100 })

            // Сбрасываем прогресс через 2 секунды
            setTimeout(() => {
              set({ scanProgress: 0 })
            }, 2000)
          }
        },

        stopScan: () => {
          set({ isScanning: false, scanProgress: 0 })
        },

        updateScanSettings: (settings) => {
          set((state) => {
            Object.assign(state.scanSettings, settings)
          })
        },

        // ========== TRACKS ==========

        getTracksByFolder: (folderId) => {
          const state = get()
          return state.tracks.filter((t) => t.folderId === folderId)
        },

        getTracksByArtist: (artist) => {
          const state = get()
          return state.tracks.filter((t) =>
            t.artist.toLowerCase().includes(artist.toLowerCase())
          )
        },

        getTracksByAlbum: (album) => {
          const state = get()
          return state.tracks.filter((t) =>
            t.album?.toLowerCase().includes(album.toLowerCase())
          )
        },

        searchTracks: (query) => {
          const state = get()
          const lowerQuery = query.toLowerCase()

          return state.tracks.filter(
            (t) =>
              t.title.toLowerCase().includes(lowerQuery) ||
              t.artist.toLowerCase().includes(lowerQuery) ||
              t.album?.toLowerCase().includes(lowerQuery) ||
              t.genre?.toLowerCase().includes(lowerQuery)
          )
        },

        // ========== UTILS ==========

        clearAllData: () => {
          set(defaultState)
        },
      }))
    ),
    {
      name: 'local-music-storage',
      partialize: (state) => ({
        folders: state.folders,
        tracks: state.tracks,
        scanSettings: state.scanSettings,
      }),
    }
  )
)
