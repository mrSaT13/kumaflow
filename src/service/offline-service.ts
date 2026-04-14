/**
 * Offline Service - Управление офлайн-режимом
 * 
 * - Проверка наличия интернета
 * - Переключение на закешированные треки при отсутствии интернета
 * - Приоритет: онлайн > кеш
 */

import { cacheService } from './cache-service'

class OfflineService {
  private isOnline: boolean = navigator.onLine
  private listeners: Set<(online: boolean) => void> = new Set()

  constructor() {
    // Слушаем события сети
    window.addEventListener('online', () => this.handleOnlineStatus(true))
    window.addEventListener('offline', () => this.handleOnlineStatus(false))
  }

  private handleOnlineStatus(online: boolean) {
    this.isOnline = online
    console.log(`[OfflineService] Status changed: ${online ? 'ONLINE' : 'OFFLINE'}`)
    
    // Уведомляем слушателей
    this.listeners.forEach(listener => listener(online))
  }

  /**
   * Проверка наличия интернета
   */
  isOnlineNow(): boolean {
    return this.isOnline && navigator.onLine
  }

  /**
   * Получить URL для воспроизведения
   * Приоритет: онлайн > кеш
   */
  async getPlaybackUrl(trackId: string, onlineUrl: string): Promise<string> {
    // Если онлайн - используем обычный URL
    if (this.isOnlineNow()) {
      return onlineUrl
    }

    // Если офлайн - пробуем получить из кеша
    console.log(`[OfflineService] Offline mode, trying to get cached audio for ${trackId}`)
    const cachedUrl = await this.getCachedAudioUrl(trackId)

    if (cachedUrl) {
      console.log(`[OfflineService] Using cached audio for ${trackId}`)
      return cachedUrl
    }

    // Если нет в кеше - возвращаем оригинальный URL (будет ошибка воспроизведения)
    console.warn(`[OfflineService] No cached audio for ${trackId}, using online URL`)
    return onlineUrl
  }

  /**
   * Получить закешированный аудиофайл
   */
  async getCachedAudioUrl(trackId: string): Promise<string | null> {
    return await cacheService.getCachedAudioUrl(trackId)
  }

  /**
   * Проверка наличия трека в кеше
   */
  async isTrackCached(trackId: string): Promise<boolean> {
    return await cacheService.isAudioCached(trackId)
  }

  /**
   * Подписка на изменения статуса сети
   */
  subscribe(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener)
    // Сразу вызываем с текущим статусом
    listener(this.isOnline)
    
    // Возвращаем функцию отписки
    return () => {
      this.listeners.delete(listener)
    }
  }
}

// Singleton
export const offlineService = new OfflineService()
