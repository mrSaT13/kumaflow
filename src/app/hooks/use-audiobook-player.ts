/**
 * Audiobook Player Hook
 * 
 * Воспроизведение аудиокниг с запоминанием позиции
 * Автосохранение прогресса каждые 30 секунд
 * Синхронизация с Audiobookshelf сервером
 */

import { useEffect, useRef, useState } from 'react'
import { audiobookshelfService } from '@/service/audiobookshelf-api'
import { useAudiobookshelf } from '@/store/audiobookshelf.store'

interface UseAudiobookPlayerProps {
  bookId: string
  libraryId: string
  onProgressUpdate?: (currentTime: number, percentage: number) => void
  onFinish?: () => void
}

interface UseAudiobookPlayerReturn {
  isPlaying: boolean
  isLoading: boolean
  currentTime: number
  duration: number
  percentage: number
  error: string | null
  
  // Controls
  play: () => Promise<void>
  pause: () => Promise<void>
  stop: () => Promise<void>
  seek: (time: number) => Promise<void>
  skipForward: (seconds?: number) => void
  skipBackward: (seconds?: number) => void
  setPlaybackRate: (rate: number) => void
  
  // State
  playbackRate: number
  isFinished: boolean
}

const AUTO_SAVE_INTERVAL = 30000 // 30 секунд
const SKIP_FORWARD_SECONDS = 30
const SKIP_BACKWARD_SECONDS = 15

export function useAudiobookPlayer({
  bookId,
  libraryId,
  onProgressUpdate,
  onFinish,
}: UseAudiobookPlayerProps): UseAudiobookPlayerReturn {
  const { config } = useAudiobookshelf()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRateState] = useState(1.0)
  const [error, setError] = useState<string | null>(null)
  const [isFinished, setIsFinished] = useState(false)

  const percentage = duration > 0 ? (currentTime / duration) * 100 : 0

  // Инициализация плеера
  useEffect(() => {
    if (!config.enabled || !config.isConnected) {
      setError('Audiobookshelf не подключён')
      setIsLoading(false)
      return
    }

    const initPlayer = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Получаем прогресс пользователя
        const progress = await audiobookshelfService.getProgress(bookId)
        
        if (progress) {
          setCurrentTime(progress.currentTime)
          setDuration(progress.duration)
          setIsFinished(progress.isFinished)
        }

        // Получаем URL для воспроизведения
        const streamUrl = await audiobookshelfService.getStreamUrl(bookId)
        
        // Создаём аудио элемент
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ''
        }

        const audio = new Audio(streamUrl)
        audioRef.current = audio

        // Настраиваем обработчики
        audio.addEventListener('timeupdate', handleTimeUpdate)
        audio.addEventListener('loadedmetadata', handleLoadedMetadata)
        audio.addEventListener('ended', handleEnded)
        audio.addEventListener('error', handleError)
        audio.addEventListener('play', () => setIsPlaying(true))
        audio.addEventListener('pause', () => setIsPlaying(false))

        // Восстанавливаем скорость воспроизведения
        audio.playbackRate = playbackRate

        setIsLoading(false)
      } catch (err) {
        console.error('[AudiobookPlayer] Init failed:', err)
        setError('Ошибка загрузки книги')
        setIsLoading(false)
      }
    }

    initPlayer()

    // Очистка
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
      }
    }
  }, [bookId, config.enabled, config.isConnected])

  // Автосохранение прогресса
  useEffect(() => {
    if (isPlaying) {
      saveIntervalRef.current = setInterval(saveProgress, AUTO_SAVE_INTERVAL)
    } else {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
      }
    }

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current)
      }
    }
  }, [isPlaying, currentTime, duration])

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleEnded = () => {
    setIsPlaying(false)
    setIsFinished(true)
    saveProgress(true)
    onFinish?.()
  }

  const handleError = (e: Event) => {
    console.error('[AudiobookPlayer] Error:', e)
    setError('Ошибка воспроизведения')
    setIsPlaying(false)
  }

  const saveProgress = async (force: boolean = false) => {
    if (!audioRef.current || !duration) return

    const currentTime = audioRef.current.currentTime
    const isFinished = currentTime >= duration - 1
    
    try {
      await audiobookshelfService.updateProgress(
        bookId,
        currentTime,
        duration,
        isFinished
      )

      const percentage = (currentTime / duration) * 100
      onProgressUpdate?.(currentTime, percentage)

      if (isFinished && !force) {
        setIsFinished(true)
      }
    } catch (error) {
      console.error('[AudiobookPlayer] Save progress failed:', error)
    }
  }

  const play = async () => {
    if (!audioRef.current) return

    try {
      await audioRef.current.play()
      setIsPlaying(true)
    } catch (err) {
      console.error('[AudiobookPlayer] Play failed:', err)
      setError('Не удалось запустить воспроизведение')
    }
  }

  const pause = async () => {
    if (!audioRef.current) return

    audioRef.current.pause()
    setIsPlaying(false)
    await saveProgress()
  }

  const stop = async () => {
    if (!audioRef.current) return

    audioRef.current.pause()
    audioRef.current.currentTime = 0
    setIsPlaying(false)
    await saveProgress()
  }

  const seek = async (time: number) => {
    if (!audioRef.current) return

    audioRef.current.currentTime = Math.max(0, Math.min(time, duration))
    setCurrentTime(audioRef.current.currentTime)
    await saveProgress()
  }

  const skipForward = (seconds: number = SKIP_FORWARD_SECONDS) => {
    seek(currentTime + seconds)
  }

  const skipBackward = (seconds: number = SKIP_BACKWARD_SECONDS) => {
    seek(Math.max(0, currentTime - seconds))
  }

  const setPlaybackRate = (rate: number) => {
    setPlaybackRateState(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
  }

  return {
    isPlaying,
    isLoading,
    currentTime,
    duration,
    percentage,
    error,
    play,
    pause,
    stop,
    seek,
    skipForward,
    skipBackward,
    setPlaybackRate,
    playbackRate,
    isFinished,
  }
}
