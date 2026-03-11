/**
 * Хук для фонового анализа треков
 *
 * Анализирует треки из ТЕКУЩЕГО плейлиста (не все!)
 * Сохраняет BPM/Moods в ML Store
 * 
 * ВАЖНО: Анализ происходит ПОСЛЕ запуска трека, не мешает воспроизведению
 */

import { useEffect, useRef } from 'react'
import { audioAnalysisService } from '@/service/audio-analysis'
import { useQuery } from '@tanstack/react-query'
import { subsonic } from '@/service/subsonic'
import { usePlayerStore } from '@/store/player.store'

interface AnalyzedTrack {
  id: string
  bpm?: number
  energy?: number
  danceability?: number
  acousticness?: number
  valence?: number
}

export function useBackgroundAudioAnalysis() {
  const analysisQueue = useRef<string[]>([])
  const isAnalyzing = useRef(false)
  const analyzedTracks = useRef<Set<string>>(new Set())
  const { currentList } = usePlayerStore((state) => state.songlist)

  // Получаем треки из ТЕКУЩЕГО плейлиста (не все!)
  const currentPlaylistIds = useRef<string[]>([])
  
  useEffect(() => {
    // Обновляем список треков текущего плейлиста - ПРОВЕРЯЕМ ЧТО ЭТО МАССИВ
    const playlistArray = Array.isArray(currentList) ? currentList : []
    currentPlaylistIds.current = playlistArray.map(s => s.id)

    // Добавляем в очередь только треки из текущего плейлиста
    const newTracks = currentPlaylistIds.current.filter(id =>
      !analyzedTracks.current.has(id) &&
      !analysisQueue.current.includes(id)
    )

    if (newTracks.length > 0) {
      console.log(`[AudioAnalysis] Added ${newTracks.length} tracks from current playlist`)
      analysisQueue.current.push(...newTracks)

      // Запускаем анализ
      if (!isAnalyzing.current) {
        processAnalysisQueue()
      }
    }
  }, [currentList])

  /**
   * Обработка очереди анализа
   * Анализирует по 3 трека за раз с паузой 2 секунды
   */
  async function processAnalysisQueue() {
    if (isAnalyzing.current || analysisQueue.current.length === 0) return

    isAnalyzing.current = true

    console.log('[AudioAnalysis] Starting background analysis...')

    // Анализируем по 3 трека за раз (меньше нагрузка)
    const batchSize = 3
    const batch = analysisQueue.current.splice(0, batchSize)

    for (const songId of batch) {
      try {
        // Получаем трек - ПРОВЕРЯЕМ ЧТО currentList это массив
        const playlistArray = Array.isArray(currentList) ? currentList : []
        const song = playlistArray.find(s => s.id === songId)
        if (!song || !song.path) {
          analyzedTracks.current.add(songId)
          continue
        }

        // Ждем 500ms перед анализом (чтобы не мешать воспроизведению)
        await new Promise(resolve => setTimeout(resolve, 500))

        // Получаем stream URL
        const streamUrl = await getStreamUrl(songId)
        if (!streamUrl) {
          analyzedTracks.current.add(songId)
          continue
        }

        // Анализируем с сохранением в ML Store (без Navidrome)
        const features = await audioAnalysisService.analyze(streamUrl, songId, false)

        console.log(`[AudioAnalysis] ${song.title}: BPM=${features.bpm}, Energy=${features.energy}`)
        
        analyzedTracks.current.add(songId)

      } catch (error) {
        console.error(`[AudioAnalysis] Error analyzing ${songId}:`, error)
        analyzedTracks.current.add(songId)
      }
    }

    isAnalyzing.current = false

    // Продолжаем если есть ещё треки
    if (analysisQueue.current.length > 0) {
      setTimeout(() => processAnalysisQueue(), 2000) // Пауза 2 секунды между батчами
    } else {
      console.log('[AudioAnalysis] Background analysis complete!')
    }
  }

  /**
   * Получить URL для стриминга
   */
  async function getStreamUrl(songId: string): Promise<string> {
    try {
      // Используем готовую функцию getSongStreamUrl из httpClient
      const { getSongStreamUrl } = await import('@/api/httpClient')
      
      // Формируем правильный URL для стриминга
      return getSongStreamUrl(songId)
    } catch (error) {
      console.error('[AudioAnalysis] Error getting stream URL:', error)
      return ''
    }
  }

  return {
    isAnalyzing: isAnalyzing.current,
    queueLength: analysisQueue.current.length,
    analyzedCount: analyzedTracks.current.size,
    totalInPlaylist: currentPlaylistIds.current.length,
  }
}
