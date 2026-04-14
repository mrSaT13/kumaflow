/**
 * Cache Service - Работа с IndexedDB для кэширования музыки
 *
 * Функционал:
 * - Кэширование аудио файлов (песни, подкасты)
 * - Кэширование обложек альбомов
 * - LRU eviction при превышении лимита
 * - TTL (время жизни) для кэша
 * - Статистика использования
 *
 * ВАЖНО: Не используем URL.createObjectURL() для избежания проблем с памятью
 * Вместо этого храним только Blob данные и создаём URL только при воспроизведении
 */

export interface CacheEntry {
  id: string // song/album id
  type: 'song' | 'cover' | 'podcast'
  url: string // оригинальный URL
  blob: Blob // бинарные данные
  size: number // размер в байтах
  createdAt: number // timestamp создания
  lastAccessedAt: number // последнего доступа
  expiresAt: number // время истечения
  playlistId?: string // если из плейлиста
}

export interface CacheConfig {
  maxSizeMB: number // максимальный размер в MB
  ttlDays: number // время жизни в днях
  enabled: boolean // включён ли кэш
}

const DB_NAME = 'kumaflow-cache'
const DB_VERSION = 1
const STORE_NAME = 'cache'

let db: IDBDatabase | null = null

/**
 * Инициализация базы данных
 */
export async function initCacheDB(): Promise<IDBDatabase> {
  if (db) return db

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result

      // Создаём хранилище
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' })

        // Индексы для поиска
        store.createIndex('type', 'type', { unique: false })
        store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false })
        store.createIndex('expiresAt', 'expiresAt', { unique: false })
        store.createIndex('playlistId', 'playlistId', { unique: false })
      }
    }
  })
}

/**
 * Получить запись из кэша
 */
export async function getCacheEntry(id: string): Promise<CacheEntry | null> {
  const database = await initCacheDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const entry = request.result as CacheEntry | undefined

      if (entry) {
        // Проверяем не истёк ли TTL
        if (Date.now() > entry.expiresAt) {
          // Удаляем просроченную запись
          deleteCacheEntry(id)
          resolve(null)
        } else {
          // Обновляем lastAccessedAt
          entry.lastAccessedAt = Date.now()
          updateCacheEntry(entry)
          resolve(entry)
        }
      } else {
        resolve(null)
      }
    }
  })
}

/**
 * Сохранить запись в кэш
 */
export async function setCacheEntry(entry: CacheEntry): Promise<void> {
  const database = await initCacheDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(entry)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * Обновить запись в кэше
 */
export async function updateCacheEntry(entry: CacheEntry): Promise<void> {
  const database = await initCacheDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(entry)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * Удалить запись из кэша
 */
export async function deleteCacheEntry(id: string): Promise<void> {
  const database = await initCacheDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * Получить все записи из кэша
 */
export async function getAllCacheEntries(): Promise<CacheEntry[]> {
  const database = await initCacheDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as CacheEntry[])
  })
}

/**
 * Получить статистику кэша
 */
export async function getCacheStats(): Promise<{
  totalSize: number // общий размер в байтах
  totalEntries: number // количество записей
  songsCount: number // количество песен
  coversCount: number // количество обложек
  podcastsCount: number // количество подкастов
}> {
  const entries = await getAllCacheEntries()

  return {
    totalSize: entries.reduce((sum, e) => sum + e.size, 0),
    totalEntries: entries.length,
    songsCount: entries.filter((e) => e.type === 'song').length,
    coversCount: entries.filter((e) => e.type === 'cover').length,
    podcastsCount: entries.filter((e) => e.type === 'podcast').length,
  }
}

/**
 * Очистить кэш по типу
 */
export async function clearCacheByType(
  type: 'song' | 'cover' | 'podcast',
): Promise<void> {
  const entries = await getAllCacheEntries()
  const toDelete = entries.filter((e) => e.type === type)

  await Promise.all(toDelete.map((e) => deleteCacheEntry(e.id)))
}

/**
 * Полная очистка кэша
 */
export async function clearAllCache(): Promise<void> {
  const database = await initCacheDB()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

/**
 * LRU Eviction - удалить наименее используемые записи
 */
export async function evictLRU(targetSizeMB: number): Promise<void> {
  const entries = await getAllCacheEntries()

  // Сортируем по lastAccessedAt (старые первыми)
  entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)

  const targetSizeBytes = targetSizeMB * 1024 * 1024
  let currentSize = entries.reduce((sum, e) => sum + e.size, 0)

  // Удаляем пока не достигнем лимита
  for (const entry of entries) {
    if (currentSize <= targetSizeBytes) break

    // Не удаляем записи из плейлистов
    if (entry.playlistId) continue

    await deleteCacheEntry(entry.id)
    currentSize -= entry.size
    console.log('[Cache] Evicted LRU entry:', entry.id, entry.type)
  }
}

/**
 * Очистка просроченных записей
 */
export async function cleanupExpiredEntries(): Promise<void> {
  const entries = await getAllCacheEntries()
  const now = Date.now()

  const expired = entries.filter((e) => now > e.expiresAt)

  await Promise.all(expired.map((e) => deleteCacheEntry(e.id)))

  if (expired.length > 0) {
    console.log('[Cache] Cleaned up', expired.length, 'expired entries')
  }
}

/**
 * Очистка старых записей (не из плейлистов)
 */
export async function cleanupOldEntries(
  keepLastN: number = 100,
): Promise<void> {
  const entries = await getAllCacheEntries()

  // Фильтруем записи без playlistId
  const nonPlaylistEntries = entries.filter((e) => !e.playlistId)

  // Сортируем по lastAccessedAt (новые первыми)
  nonPlaylistEntries.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)

  // Оставляем только последние N
  const toDelete = nonPlaylistEntries.slice(keepLastN)

  await Promise.all(toDelete.map((e) => deleteCacheEntry(e.id)))

  if (toDelete.length > 0) {
    console.log('[Cache] Cleaned up', toDelete.length, 'old entries')
  }
}

/**
 * Проверка доступности кэша
 */
export async function isCacheAvailable(): Promise<boolean> {
  try {
    await initCacheDB()
    return true
  } catch (error) {
    console.error('[Cache] Not available:', error)
    return false
  }
}

/**
 * Кэширование песни
 */
export async function cacheSong(
  songId: string,
  url: string,
  blob: Blob,
  playlistId?: string,
): Promise<void> {
  const config = await getCacheConfig()

  const entry: CacheEntry = {
    id: `song_${songId}`,
    type: 'song',
    url,
    blob,
    size: blob.size,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    expiresAt: Date.now() + config.ttlDays * 24 * 60 * 60 * 1000,
    playlistId,
  }

  await setCacheEntry(entry)

  // Сохраняем ID песни в localStorage для страницы кэша
  const cachedSongsKey = 'kumaflow-cached-songs'
  const cachedSongs = JSON.parse(localStorage.getItem(cachedSongsKey) || '[]')
  if (!cachedSongs.includes(songId)) {
    cachedSongs.push(songId)
    localStorage.setItem(cachedSongsKey, JSON.stringify(cachedSongs))
  }

  // Проверяем размер кэша
  await enforceSizeLimit(config.maxSizeMB)

  // Отправляем событие об обновлении кэша
  window.dispatchEvent(
    new CustomEvent('cache-updated', {
      detail: { type: 'song-added', songId },
    }),
  )

  console.log(
    '[Cache] Song cached:',
    songId,
    'size:',
    (blob.size / 1024).toFixed(2),
    'KB',
  )
}

/**
 * Создать запись кэша для обложки
 */
export async function cacheCover(
  coverId: string,
  url: string,
  blob: Blob,
): Promise<void> {
  const config = await getCacheConfig()

  const entry: CacheEntry = {
    id: `cover_${coverId}`,
    type: 'cover',
    url,
    blob,
    size: blob.size,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
    expiresAt: Date.now() + config.ttlDays * 24 * 60 * 60 * 1000,
  }

  await setCacheEntry(entry)
  console.log('[Cache] Cover cached:', coverId)
}

/**
 * Получить кэшированную песню
 */
export async function getCachedSong(songId: string): Promise<Blob | null> {
  const entry = await getCacheEntry(`song_${songId}`)
  return entry?.blob || null
}

/**
 * Получить URL для кэшированной песни
 */
export async function getCachedSongUrl(songId: string): Promise<string | null> {
  const entry = await getCacheEntry(`song_${songId}`)
  if (!entry) return null

  // Создаём blob URL для воспроизведения
  const url = URL.createObjectURL(entry.blob)
  console.log('[Cache] Created blob URL for song:', songId, url)
  return url
}

/**
 * Очистить blob URL (чтобы избежать утечек памяти)
 */
export function revokeCachedSongUrl(url: string): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
    console.log('[Cache] Revoked blob URL:', url)
  }
}

/**
 * Получить кэшированную обложку
 */
export async function getCachedCover(coverId: string): Promise<string | null> {
  const entry = await getCacheEntry(`cover_${coverId}`)
  if (!entry) return null

  // Возвращаем Data URL для отображения
  return URL.createObjectURL(entry.blob)
}

/**
 * Проверка и соблюдение лимита размера
 */
async function enforceSizeLimit(maxSizeMB: number): Promise<void> {
  const stats = await getCacheStats()
  const currentMB = stats.totalSize / (1024 * 1024)

  if (currentMB > maxSizeMB) {
    console.log(
      '[Cache] Size limit exceeded:',
      currentMB.toFixed(2),
      'MB >',
      maxSizeMB,
      'MB',
    )
    await evictLRU(maxSizeMB * 0.8) // Очищаем до 80% от лимита
  }
}

/**
 * Конфигурация кэша (хранится в localStorage)
 */
const CACHE_CONFIG_KEY = 'kumaflow-cache-config'

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSizeMB: 200, // 🔴 УМЕНЬШЕНО: с 500MB до 200MB для экономии памяти
  ttlDays: 30,
  enabled: true,
}

export async function getCacheConfig(): Promise<CacheConfig> {
  const stored = localStorage.getItem(CACHE_CONFIG_KEY)
  if (stored) {
    return { ...DEFAULT_CACHE_CONFIG, ...JSON.parse(stored) }
  }
  return DEFAULT_CACHE_CONFIG
}

export async function setCacheConfig(
  config: Partial<CacheConfig>,
): Promise<void> {
  const current = await getCacheConfig()
  const updated = { ...current, ...config }
  localStorage.setItem(CACHE_CONFIG_KEY, JSON.stringify(updated))
  console.log('[Cache] Config updated:', updated)
}
