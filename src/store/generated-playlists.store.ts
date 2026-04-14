/**
 * Хранилище сгенерированных плейлистов
 *
 * ИЗМЕНЕНИЕ (14.04.2026): Переход на IndexedDB (вместо localStorage)
 * Причина: localStorage лимит ~5MB, IndexedDB — сотни MB
 */

import type { ISong } from '@/types/responses/song'
import * as playlistDB from '@/service/playlist-database'

export interface GeneratedPlaylist {
  id: string
  type: 'shared-listens' | 'daily-mix' | 'mood-mix' | 'activity-mix' | 'genre-cluster' | 'k-pop-top' | 'ai-discovery' | 'holiday'
  name: string
  description: string
  songs: ISong[]
  createdAt: number
  expiresAt: number  // Через 24 часа удаляется
  gradient?: string  // Градиент для карточки
  metadata: {
    accountsCount?: number
    genres?: string[]
    avgEnergy?: number
    genre?: string
    seed?: number
    lastTracks?: string[]
    holidayId?: string  // 🆕 ID праздника
    holidayName?: string
    holidayIcon?: string
  }
}

// 🆕 Все функции теперь async через IndexedDB

/**
 * Сохранить сгенерированный плейлист
 * 
 * ИЗМЕНЕНИЕ (14.04.2026): Переход на IndexedDB
 * Больше нет проблем с QuotaExceededError!
 */
export async function saveGeneratedPlaylist(playlist: Omit<GeneratedPlaylist, 'id' | 'createdAt' | 'expiresAt'>): Promise<GeneratedPlaylist> {
  const now = Date.now()
  const newPlaylist: GeneratedPlaylist = {
    ...playlist,
    id: `playlist_${now}_${Math.random().toString(36).substring(2, 10)}`,
    createdAt: now,
    expiresAt: now + (24 * 60 * 60 * 1000),  // 24 часа
  }

  // 🆕 Сохраняем в IndexedDB
  await playlistDB.savePlaylist(newPlaylist)
  console.log('[PlaylistStore] Saved playlist:', newPlaylist.id, newPlaylist.name)

  return newPlaylist
}

/**
 * Сохранить AI плейлист по жанру (с фиксированным ID для обновления)
 * 
 * ИЗМЕНЕНИЕ (14.04.2026): Переход на IndexedDB
 */
export async function saveAIGenrePlaylist(playlist: Omit<GeneratedPlaylist, 'id' | 'createdAt' | 'expiresAt'> & { genre: string }): Promise<GeneratedPlaylist> {
  const now = Date.now()
  const playlists = await getAllGeneratedPlaylists()

  // 🆕 Очищаем просроченные перед сохранением
  const validPlaylists = playlists.filter(p => p.expiresAt > now)

  // Ищем существующий плейлист этого жанра
  const existingIndex = validPlaylists.findIndex(p => p.metadata.genre === playlist.genre && p.type === 'genre-cluster')

  const newPlaylist: GeneratedPlaylist = {
    ...playlist,
    id: existingIndex !== -1 ? validPlaylists[existingIndex].id : `ai-genre-${playlist.genre.toLowerCase().replace(/\s+/g, '-')}`,
    createdAt: now,
    expiresAt: now + (24 * 60 * 60 * 1000),  // 24 часа
  }

  // 🆕 Сохраняем/обновляем в IndexedDB
  await playlistDB.savePlaylist(newPlaylist)
  console.log('[PlaylistStore] Saved AI genre playlist:', newPlaylist.id, newPlaylist.name)

  return newPlaylist
}

/**
 * Получить все плейлисты
 */
export async function getAllGeneratedPlaylists(): Promise<GeneratedPlaylist[]> {
  return await playlistDB.getAllPlaylists()
}

/**
 * Получить плейлист по ID
 */
export async function getGeneratedPlaylistById(id: string): Promise<GeneratedPlaylist | null> {
  return await playlistDB.getPlaylistById(id)
}

/**
 * Удалить плейлист
 */
export async function deleteGeneratedPlaylist(id: string): Promise<void> {
  await playlistDB.deletePlaylist(id)
}

/**
 * Очистить все плейлисты
 */
export async function clearAllGeneratedPlaylists(): Promise<void> {
  await playlistDB.clearAll()
}

/**
 * Создать обложку плейлиста (коллаж из обложек треков)
 */
export function generatePlaylistCover(songs: ISong[]): string[] {
  // Берём 6 случайных обложек из плейлиста
  const covers = songs
    .filter(s => s.coverArt)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6)
    .map(s => s.coverArt!)

  return covers
}
