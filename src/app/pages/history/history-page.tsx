/**
 * History Page — История прослушиваний
 * Как в Яндекс Музыке: треки за последний месяц, хронологический порядок
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMLStore } from '@/store/ml.store'
import { subsonic } from '@/service/subsonic'
import {
  History as HistoryIcon,
  Play,
  Clock,
  Trash2,
  ChevronLeft,
  Music2,
} from 'lucide-react'
import { useThemeStore } from '@/store/theme.store'
import { Theme } from '@/types/themeContext'
import { usePlayerActions } from '@/store/player.store'
import { ImageLoader } from '@/app/components/image-loader'
import { LazyLoadImage } from 'react-lazy-load-image-component'

interface HistoryEntry {
  songId: string
  timestamp: number
  duration?: number
  title?: string
  artist?: string
  album?: string
  coverArt?: string
  playCount?: number
}

function useThemeClasses() {
  const theme = useThemeStore((state) => state.theme)
  const isDark = theme === Theme.Dark

  return {
    bg: isDark ? 'bg-[#121212]' : 'bg-[#F8F9FA]',
    cardBg: isDark ? 'bg-[#1E1E1E]' : 'bg-white',
    text: {
      primary: isDark ? 'text-white' : 'text-gray-900',
      secondary: isDark ? 'text-gray-400' : 'text-gray-500',
      muted: isDark ? 'text-gray-500' : 'text-gray-400',
    },
    border: isDark ? 'border-gray-800' : 'border-gray-200',
    hover: isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-50',
  }
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const t = useThemeClasses()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<'day' | 'week' | 'month'>('month')

  const { ratings } = useMLStore()
  const ratingsRef = React.useRef(ratings)

  // Загружаем только при монтировании или изменении периода
  useEffect(() => {
    loadHistory()
  }, [selectedPeriod])

  // Обновляем ref когда ratings меняется
  useEffect(() => {
    ratingsRef.current = ratings
  }, [ratings])

  const loadHistory = async () => {
    setIsLoading(true)

    try {
      // Получаем все ratings и фильтруем те что имеют lastPlayed
      const allRatings = Object.entries(ratings)
        .filter(([_, rating]) => rating.lastPlayed && rating.playCount > 0)
        .map(([songId, rating]) => ({
          songId,
          timestamp: rating.lastPlayed ? new Date(rating.lastPlayed).getTime() : 0,
          playCount: rating.playCount || 0,
          title: rating.songInfo?.title,
          artist: rating.songInfo?.artist,
          album: rating.songInfo?.album,
          coverArt: (rating.songInfo as any)?.coverArt, // Может быть уже сохранён
          duration: undefined,
        }))

      // Фильтруем по периоду
      const now = Date.now()
      const periodMs = selectedPeriod === 'day'
        ? 24 * 60 * 60 * 1000
        : selectedPeriod === 'week'
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000

      const filtered = allRatings
        .filter(entry => now - entry.timestamp < periodMs)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50)

      // Загружаем данные из Subsonic для ВСЕХ треков (coverArt, duration)
      const withCovers: HistoryEntry[] = []

      for (const entry of filtered) {
        try {
          const song = await subsonic.songs.getSong(entry.songId)
          if (song) {
            withCovers.push({
              ...entry,
              title: song.title || entry.title,
              artist: song.artist || entry.artist,
              album: song.album || entry.album,
              coverArt: song.coverArt || entry.coverArt,
              duration: song.duration,
            })
          } else {
            withCovers.push(entry)
          }
        } catch {
          withCovers.push(entry)
        }
      }

      setHistory(withCovers)
    } catch (error) {
      console.error('[History] Failed to load:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlaySong = async (entry: HistoryEntry) => {
    try {
      const song = await subsonic.songs.getSong(entry.songId)
      if (song) {
        const { setSongList } = usePlayerActions()
        setSongList([song], 0)
      }
    } catch (error) {
      console.error('[History] Failed to play:', error)
    }
  }

  const handleGoToArtist = (artist: string) => {
    if (artist) {
      navigate(`/library/artists?search=${encodeURIComponent(artist)}`)
    }
  }

  const handleGoToAlbum = (album: string) => {
    if (album) {
      navigate(`/library/albums?search=${encodeURIComponent(album)}`)
    }
  }

  const clearHistory = async () => {
    // Очищаем только UI — Behavior Tracker хранит свои данные
    setHistory([])
  }

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 1) return 'Только что'
    if (diffHours < 24) return `${diffHours}ч назад`
    if (diffDays < 7) return `${diffDays}д назад`

    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    })
  }

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const totalListened = history.length

  return (
    <div className="relative w-full min-h-screen overflow-hidden">
      {/* Градиентный фон — светлая тема */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-300/40 via-purple-200/30 to-pink-300/35 dark:hidden" />
      {/* Градиентный фон — тёмная тема */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950/50 via-purple-900/30 to-pink-950/40 hidden dark:block" />

      {/* Контент поверх градиента */}
      <div className="relative z-10">
        {/* Header */}
        <div className={`sticky top-0 z-10 ${t.cardBg} border-b ${t.border} backdrop-blur-sm bg-opacity-90`}>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/')}
                  className={`p-2 rounded-full ${t.hover} transition-colors`}
                  title="На главную"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <HistoryIcon className="w-5 h-5" />
                  <h1 className={`text-xl font-bold ${t.text.primary}`}>История</h1>
                </div>
              </div>

              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className={`p-2 rounded-full ${t.hover} transition-colors ${t.text.muted}`}
                  title="Очистить историю"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Табы периодов */}
          <div className="flex gap-2 mb-6">
            {[
              { id: 'day' as const, label: 'Сегодня' },
              { id: 'week' as const, label: 'Неделя' },
              { id: 'month' as const, label: 'Месяц' },
            ].map((period) => (
              <button
                key={period.id}
                onClick={() => setSelectedPeriod(period.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedPeriod === period.id
                    ? 'bg-gray-900 text-white'
                    : `${t.cardBg} ${t.text.secondary} ${t.hover}`
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>

          {/* Статистика */}
          <div className={`${t.cardBg} rounded-xl p-4 mb-6 border ${t.border}`}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-violet-100 text-violet-600">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${t.text.primary}`}>{totalListened}</p>
                <p className={`text-sm ${t.text.secondary}`}>
                  треков {selectedPeriod === 'day' ? 'сегодня' : selectedPeriod === 'week' ? 'за неделю' : 'за месяц'}
                </p>
              </div>
            </div>
          </div>

          {/* Список */}
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
              <p className={t.text.secondary}>Загрузка истории...</p>
            </div>
          ) : history.length === 0 ? (
            <div className={`text-center py-16 ${t.cardBg} rounded-2xl border ${t.border}`}>
              <Music2 className={`w-16 h-16 mx-auto mb-4 ${t.text.muted}`} />
              <h3 className={`text-lg font-semibold mb-2 ${t.text.primary}`}>
                История пуста
              </h3>
              <p className={`text-sm mb-6 ${t.text.secondary}`}>
                Начните слушать музыку — и она появится здесь
              </p>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors"
              >
                На главную
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {history.map((entry, index) => (
                <div
                  key={`${entry.songId}-${index}`}
                  className={`${t.cardBg} rounded-xl p-4 border ${t.border} ${t.hover} transition-all group flex items-center gap-4`}
                >
                  {/* Обложка */}
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200">
                    {entry.coverArt ? (
                      <ImageLoader id={entry.coverArt} type="song" size={100}>
                        {(src, isImageLoading) => (
                          <LazyLoadImage
                            src={src}
                            effect="opacity"
                            className="w-full h-full object-cover"
                            alt=""
                            placeholder={
                              <div className="w-full h-full flex items-center justify-center text-gray-400">
                                <Music2 size={20} />
                              </div>
                            }
                          />
                        )}
                      </ImageLoader>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Music2 size={20} />
                      </div>
                    )}

                    {/* Play overlay */}
                    <button
                      onClick={() => handlePlaySong(entry)}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <Play className="w-5 h-5 text-white fill-white" />
                    </button>
                  </div>

                  {/* Информация */}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${t.text.primary}`}>
                      {entry.title || 'Неизвестный трек'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <button
                        onClick={() => entry.artist && handleGoToArtist(entry.artist)}
                        className={`text-sm truncate ${t.text.secondary} hover:underline ${!entry.artist ? 'pointer-events-none' : ''}`}
                      >
                        {entry.artist || 'Неизвестный артист'}
                      </button>
                      {entry.album && (
                        <>
                          <span className={t.text.muted}>•</span>
                          <button
                            onClick={() => handleGoToAlbum(entry.album!)}
                            className={`text-sm truncate ${t.text.secondary} hover:underline`}
                          >
                            {entry.album}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Время и duration */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs ${t.text.muted}`}>
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    {entry.duration && (
                      <span className={`text-xs ${t.text.muted}`}>
                        {formatDuration(entry.duration)}
                      </span>
                    )}
                    {entry.playCount && entry.playCount > 1 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                        ×{entry.playCount}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
