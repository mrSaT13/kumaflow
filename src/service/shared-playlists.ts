/**
 * Shared Playlists Service - Сервис для общих плейлистов
 * 
 * Позволяет создавать плейлисты с красивым оформлением
 * и оценивать плейлисты других пользователей
 */

import { httpClient } from '@/api/httpClient'
import { subsonic } from '@/service/subsonic'
import type { ISong } from '@/types/responses/song'

export interface SharedPlaylist {
  id: string
  name: string
  comment: string
  author: string
  authorId: string
  songs: ISong[]
  coverArt?: string
  gradient: string
  rating: number  // Средняя оценка (1-5)
  userRating?: number  // Оценка текущего пользователя
  createdAt: string
  playCount: number
  isPublic: boolean
}

export interface PlaylistRating {
  playlistId: string
  userId: string
  rating: number  // 1-5
  createdAt: number
}

const STORAGE_KEY = 'shared-playlists-ratings'

/**
 * Сохранить оценку плейлиста локально
 */
export function savePlaylistRating(rating: PlaylistRating): void {
  const ratings = getAllRatings()
  
  // Удаляем старую оценку если есть
  const filtered = ratings.filter(r => 
    !(r.playlistId === rating.playlistId && r.userId === rating.userId)
  )
  
  // Добавляем новую
  filtered.push(rating)
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  console.log('[SharedPlaylists] Saved rating:', rating)
}

/**
 * Получить все оценки
 */
export function getAllRatings(): PlaylistRating[] {
  const data = localStorage.getItem(STORAGE_KEY)
  if (!data) return []
  
  try {
    return JSON.parse(data)
  } catch (error) {
    console.error('[SharedPlaylists] Error loading ratings:', error)
    return []
  }
}

/**
 * Получить оценку пользователя для плейлиста
 */
export function getUserRating(playlistId: string, userId: string): number | undefined {
  const ratings = getAllRatings()
  const rating = ratings.find(r => r.playlistId === playlistId && r.userId === userId)
  return rating?.rating
}

/**
 * Рассчитать средний рейтинг для плейлиста
 */
export function getAverageRating(playlistId: string): { average: number; count: number } {
  const ratings = getAllRatings()
  const playlistRatings = ratings.filter(r => r.playlistId === playlistId)
  
  if (playlistRatings.length === 0) {
    return { average: 0, count: 0 }
  }
  
  const sum = playlistRatings.reduce((acc, r) => acc + r.rating, 0)
  return {
    average: sum / playlistRatings.length,
    count: playlistRatings.length,
  }
}

/**
 * Установить рейтинг плейлиста (ЛОКАЛЬНО)
 * Note: Navidrome не поддерживает оценку плейлистов напрямую
 * Оцениваем только локально в localStorage
 */
export async function setPlaylistRating(
  playlistId: string,
  rating: number  // 1-5
): Promise<void> {
  try {
    // Сохраняем только локальную оценку
    const currentUser = localStorage.getItem('current-user-id') || 'anonymous'
    savePlaylistRating({
      playlistId,
      userId: currentUser,
      rating,
      createdAt: Date.now(),
    })
    
    console.log(`[SharedPlaylists] Set local rating ${rating} for playlist ${playlistId}`)
  } catch (error) {
    console.error('[SharedPlaylists] Error setting rating:', error)
    throw error
  }
}

/**
 * Создать общий плейлист с красивым оформлением
 */
export async function createSharedPlaylist(
  name: string,
  songs: ISong[],
  comment: string,
  gradient: string,
  isPublic: boolean = true
): Promise<SharedPlaylist> {
  try {
    // Создаём плейлист через Subsonic API
    const songIds = songs.map(s => s.id)
    const playlist = await subsonic.playlists.create(name, songIds)

    if (!playlist) {
      throw new Error('Failed to create playlist')
    }

    // Обновляем с комментарием и публичностью
    await subsonic.playlists.update({
      playlistId: playlist.id,
      name,
      comment,
      isPublic: isPublic ? 'true' : 'false',
    })
    
    // Получаем информацию о текущем пользователе из localStorage
    // Navidrome хранит username в localStorage
    const storedUser = localStorage.getItem('subsonic-username') || 
                       localStorage.getItem('username') ||
                       'Anonymous'
    
    const sharedPlaylist: SharedPlaylist = {
      id: playlist.id,
      name,
      comment,
      author: storedUser,
      authorId: storedUser,
      songs,
      gradient,
      rating: 0,
      createdAt: new Date().toISOString(),
      playCount: 0,
      isPublic,
    }
    
    console.log('[SharedPlaylists] Created shared playlist:', sharedPlaylist.id)
    console.log('[SharedPlaylists] User:', storedUser)
    
    return sharedPlaylist
  } catch (error) {
    console.error('[SharedPlaylists] Error creating playlist:', error)
    throw error
  }
}

/**
 * Получить все публичные плейлисты пользователей
 * 
 * ИЗМЕНЕНИЕ (14.04.2026): Реализована заглушка
 * Было: return [] (строка 197)
 * Стало: Получение плейлистов через Subsonic API + localStorage для "общих" плейлистов
 * 
 * Логика:
 * 1. Получаем свои плейлисты через Subsonic
 * 2. Загружаем "избранные общие плейлисты" из localStorage (которые пользователь отметил как общие)
 * 3. Объединяем и возвращаем с рейтингами
 */
export async function getFeaturedPlaylists(): Promise<SharedPlaylist[]> {
  try {
    console.log('[SharedPlaylists] Getting featured playlists...')

    // 1. Получаем свои плейлисты через Subsonic API
    const playlists = await subsonic.playlists.getAll()
    
    if (!playlists || playlists.length === 0) {
      console.log('[SharedPlaylists] No playlists found')
      return []
    }

    // 2. Загружаем список "общих" плейлистов из localStorage
    // (плейлисты которые пользователь сделал публичными)
    const sharedPlaylistIds = JSON.parse(
      localStorage.getItem('shared-playlists-ids') || '[]'
    ) as string[]

    // 3. Фильтруем только публичные плейлисты
    const publicPlaylists = playlists.filter(p => 
      p.public || sharedPlaylistIds.includes(p.id)
    )

    if (publicPlaylists.length === 0) {
      console.log('[SharedPlaylists] No public playlists found')
      return []
    }

    console.log('[SharedPlaylists] Found', publicPlaylists.length, 'public playlists')

    // 4. Преобразуем в SharedPlaylist формат
    const result: SharedPlaylist[] = []
    const currentUser = localStorage.getItem('subsonic-username') || 
                        localStorage.getItem('username') || 
                        'Anonymous'

    for (const playlist of publicPlaylists) {
      // Получаем средний рейтинг
      const { average, count } = getAverageRating(playlist.id)

      // Получаем пользователя-автора (owner в Navidrome)
      const author = playlist.owner || currentUser

      const sharedPlaylist: SharedPlaylist = {
        id: playlist.id,
        name: playlist.name,
        comment: playlist.comment || '',
        author,
        authorId: author,
        songs: [],  // Загружаем отдельно если нужно
        coverArt: playlist.coverArt,
        gradient: 'from-primary/20 to-primary/40',  // Дефолтный градиент
        rating: average,
        userRating: getUserRating(playlist.id, currentUser),
        createdAt: playlist.created || new Date().toISOString(),
        playCount: parseInt(localStorage.getItem(`playlist-playcount-${playlist.id}`) || '0'),
        isPublic: playlist.public || sharedPlaylistIds.includes(playlist.id),
      }

      result.push(sharedPlaylist)
    }

    console.log('[SharedPlaylists] Returning', result.length, 'shared playlists')
    return result
  } catch (error) {
    console.error('[SharedPlaylists] Error getting featured playlists:', error)
    return []
  }
}

/**
 * Увеличить счётчик воспроизведений плейлиста
 */
export async function incrementPlayCount(playlistId: string): Promise<void> {
  const key = `playlist-playcount-${playlistId}`
  const current = parseInt(localStorage.getItem(key) || '0')
  localStorage.setItem(key, (current + 1).toString())
  console.log(`[SharedPlaylists] Playlist ${playlistId} played ${current + 1} times`)
}
