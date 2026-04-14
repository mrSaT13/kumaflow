/**
 * Хук для получения URL воспроизведения с учётом офлайн-режима
 */

import { useState, useEffect } from 'react'
import { offlineService } from '@/service/offline-service'
import { getSongStreamUrl } from '@/api/httpClient'

interface UsePlaybackUrlResult {
  playbackUrl: string | null
  isLoading: boolean
  isCached: boolean
  isOffline: boolean
}

export function usePlaybackUrl(trackId: string): UsePlaybackUrlResult {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCached, setIsCached] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    let cancelled = false

    async function loadUrl() {
      if (!trackId) {
        setPlaybackUrl(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      try {
        // Получаем онлайн URL
        const onlineUrl = getSongStreamUrl(trackId)
        
        // Проверяем офлайн режим и получаем подходящий URL
        const url = await offlineService.getPlaybackUrl(trackId, onlineUrl)
        
        if (!cancelled) {
          setPlaybackUrl(url)
          
          // Проверяем, из кеша ли URL
          const cached = await offlineService.isTrackCached(trackId)
          setIsCached(cached)
          setIsOffline(!offlineService.isOnlineNow())
          setIsLoading(false)
        }
      } catch (error) {
        console.error('[usePlaybackUrl] Failed to get playback URL:', error)
        if (!cancelled) {
          setPlaybackUrl(null)
          setIsLoading(false)
        }
      }
    }

    loadUrl()

    // Подписка на изменения сети
    const unsubscribe = offlineService.subscribe((online) => {
      if (!cancelled) {
        setIsOffline(!online)
        // Перезагружаем URL при изменении статуса сети
        loadUrl()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [trackId])

  return { playbackUrl, isLoading, isCached, isOffline }
}
