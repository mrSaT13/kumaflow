/**
 * IndexedDB хранилище для сгенерированных плейлистов
 * 
 * ИЗМЕНЕНИЕ (14.04.2026): Переход с localStorage на IndexedDB
 * Причина: localStorage лимит ~5MB, IndexedDB — сотни MB
 */

import type { GeneratedPlaylist } from '@/store/generated-playlists.store'

const DB_NAME = 'kumaflow-playlists'
const DB_VERSION = 1
const STORE_NAME = 'generated-playlists'

let db: IDBDatabase | null = null

/**
 * Открыть/создать БД
 */
function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('expiresAt', 'expiresAt', { unique: false })
        store.createIndex('type', 'type', { unique: false })
      }
    }

    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onerror = () => {
      console.error('[PlaylistDB] Failed to open database:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Получить все плейлисты
 */
export async function getAllPlaylists(): Promise<GeneratedPlaylist[]> {
  try {
    const database = await openDB()
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        const playlists: GeneratedPlaylist[] = request.result || []
        
        // Удаляем просроченные
        const now = Date.now()
        const valid = playlists.filter(p => p.expiresAt > now)
        
        if (valid.length !== playlists.length) {
          cleanupExpired(valid)
        }
        
        resolve(valid)
      }

      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[PlaylistDB] Failed to get playlists:', error)
    return []
  }
}

/**
 * Сохранить плейлист
 */
export async function savePlaylist(playlist: GeneratedPlaylist): Promise<void> {
  try {
    const database = await openDB()
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(playlist)  // put = insert или update

      request.onsuccess = () => {
        console.log('[PlaylistDB] Saved playlist:', playlist.id)
        resolve()
      }

      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[PlaylistDB] Failed to save playlist:', error)
    throw error
  }
}

/**
 * Удалить плейлист
 */
export async function deletePlaylist(id: string): Promise<void> {
  try {
    const database = await openDB()
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[PlaylistDB] Failed to delete playlist:', error)
  }
}

/**
 * Очистить просроченные плейлисты
 */
async function cleanupExpired(playlists: GeneratedPlaylist[]): Promise<void> {
  const now = Date.now()
  const expired = playlists.filter(p => p.expiresAt <= now)
  
  for (const p of expired) {
    await deletePlaylist(p.id)
  }
  
  if (expired.length > 0) {
    console.log(`[PlaylistDB] Cleaned up ${expired.length} expired playlists`)
  }
}

/**
 * Очистить ВСЕ плейлисты
 */
export async function clearAll(): Promise<void> {
  try {
    const database = await openDB()
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        console.log('[PlaylistDB] All playlists cleared')
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[PlaylistDB] Failed to clear:', error)
  }
}

/**
 * Получить плейлист по ID
 */
export async function getPlaylistById(id: string): Promise<GeneratedPlaylist | null> {
  try {
    const database = await openDB()
    
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } catch (error) {
    console.error('[PlaylistDB] Failed to get playlist:', error)
    return null
  }
}

/**
 * Получить количество плейлистов
 */
export async function getCount(): Promise<number> {
  const playlists = await getAllPlaylists()
  return playlists.length
}
