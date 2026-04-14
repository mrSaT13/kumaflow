/**
 * MyWave Discoveries — Отслеживание артистов открытых через Мою Волну
 * 
 * Как в Яндекс Музыке "Встретились в Моей волне":
 * - Отслеживает артистов впервые услышанных через Мою Волну
 * - Считает "вес открытия": +1 первое прослушивание, +2 лайк, +3 в плейлист
 * - Показывает артистов с весом >= 5
 */

import { useMLStore } from '@/store/ml.store'
import type { IArtist } from '@/types/responses/artist'

export interface MyWaveDiscovery {
  artistId: string
  artistName: string
  artistImageUrl?: string
  discoveredAt: number        // когда впервые услышан
  weight: number              // вес открытия
  playCount: number           // сколько раз слушал
  likedAt?: number            // когда лайкнул
  addedToPlaylist?: number    // когда добавил в плейлист
  lastHeardAt: number         // когда последний раз слышал
}

const STORAGE_KEY = 'kumaflow:mywave-discoveries'
const DISCOVERY_THRESHOLD = 5  // Порог попадания в секцию

export class MyWaveDiscoveryTracker {
  private discoveries: Map<string, MyWaveDiscovery> = new Map()

  constructor() {
    this.load()
  }

  /**
   * Отследить что пользователь услышал артиста через Мою Волну
   */
  logArtistHeard(artistId: string, artistName: string, artistImageUrl?: string): void {
    const now = Date.now()
    const existing = this.discoveries.get(artistId)

    if (existing) {
      // Уже слышал — обновляем lastHeardAt и playCount
      existing.lastHeardAt = now
      existing.playCount++
      // +0.5 за повторное прослушивание (макс +2)
      if (existing.weight < 7) {  // 5 (threshold) + 2 (max bonus)
        existing.weight += 0.5
      }
    } else {
      // Впервые — создаём запись
      this.discoveries.set(artistId, {
        artistId,
        artistName,
        artistImageUrl,
        discoveredAt: now,
        weight: 1,  // +1 за первое прослушивание
        playCount: 1,
        lastHeardAt: now,
      })
    }

    this.save()
  }

  /**
   * Лайк артиста/трека из Моей волны
   */
  logLike(artistId: string): void {
    const existing = this.discoveries.get(artistId)
    if (existing) {
      existing.likedAt = Date.now()
      existing.weight += 2  // +2 за лайк
      this.save()
    }
  }

  /**
   * Добавление в плейлист
   */
  logAddedToPlaylist(artistId: string): void {
    const existing = this.discoveries.get(artistId)
    if (existing) {
      existing.addedToPlaylist = Date.now()
      existing.weight += 3  // +3 за добавление в плейлист
      this.save()
    }
  }

  /**
   * Получить артистов для секции "Встречали в Моей волне"
   */
  getQualifiedArtists(): MyWaveDiscovery[] {
    return Array.from(this.discoveries.values())
      .filter(d => d.weight >= DISCOVERY_THRESHOLD)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10)  // Топ-10
  }

  /**
   * Получить когда артист был открыт
   */
  getDiscoveryInfo(artistId: string): MyWaveDiscovery | undefined {
    return this.discoveries.get(artistId)
  }

  /**
   * Форматировать время открытия
   */
  formatDiscoveryDate(discoveredAt: number): string {
    const now = Date.now()
    const diffMs = now - discoveredAt
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 1) return 'Сегодня'
    if (diffDays < 7) return `${diffDays}д назад`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}н назад`
    
    return new Date(discoveredAt).toLocaleDateString('ru-RU', {
      month: 'short',
      year: 'numeric',
    })
  }

  /**
   * Очистить старые записи (> 3 месяцев)
   */
  cleanupOldEntries(maxAgeDays: number = 90): void {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000)
    
    for (const [id, discovery] of this.discoveries.entries()) {
      if (discovery.lastHeardAt < cutoff) {
        this.discoveries.delete(id)
      }
    }
    
    this.save()
  }

  /**
   * Сбросить все записи
   */
  reset(): void {
    this.discoveries.clear()
    this.save()
  }

  // === Persistence ===

  private save(): void {
    try {
      const data = Array.from(this.discoveries.entries())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      console.error('[MyWaveDiscoveries] Failed to save:', e)
    }
  }

  private load(): void {
    if (typeof localStorage === 'undefined') return  // Not in browser
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const entries = JSON.parse(raw) as [string, MyWaveDiscovery][]
        this.discoveries = new Map(entries)
      }
    } catch (e) {
      console.error('[MyWaveDiscoveries] Failed to load:', e)
    }
  }
}

// Экспортируем синглтон
export const myWaveDiscoveryTracker = new MyWaveDiscoveryTracker()
