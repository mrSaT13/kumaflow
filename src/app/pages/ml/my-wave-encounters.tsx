/**
 * "Встречали в Моей Волне" — артисты из истории с лайками
 * Тот же источник данных что и на главной (ViralArtistsSection)
 * Фон из установленной темы
 */

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useThemeStore } from '@/store/theme.store'
import { Theme } from '@/types/themeContext'
import { useMLStore } from '@/store/ml.store'
import { getStarredArtists } from '@/service/subsonic-api'
import { subsonic } from '@/service/subsonic'
import { generateArtistRadio } from '@/service/ml-wave-service'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { ChevronLeft, Play, Loader2, Music2, Star, Calendar, TrendingUp } from 'lucide-react'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { LazyLoadImage } from 'react-lazy-load-image-component'

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
    gradient: isDark
      ? 'bg-gradient-to-br from-violet-950/50 via-purple-900/30 to-[#1a1225]'
      : 'bg-gradient-to-br from-violet-100/50 via-purple-50/30 to-pink-100/50',
  }
}

interface ViralArtist {
  id: string
  name: string
  coverArt?: string
  likedCount: number
  lastLiked?: string
}

export default function MyWaveEncountersPage() {
  const navigate = useNavigate()
  const t = useThemeClasses()
  const { setSongList } = usePlayerActions()
  const { ratings } = useMLStore()
  const [artists, setArtists] = useState<ViralArtist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState<string | null>(null)

  useEffect(() => {
    loadArtists()
  }, [ratings])

  const loadArtists = async () => {
    setIsLoading(true)
    try {
      // Берём треки с лайками из ratings (как на главной)
      const likedRatings = Object.entries(ratings)
        .filter(([_, rating]) => rating.like === true && rating.songInfo?.artistId)
        .sort((a, b) => new Date(b[1].lastPlayed || 0).getTime() - new Date(a[1].lastPlayed || 0).getTime())

      // Загружаем лайкнутых артистов для обложек
      const starredArtists = await getStarredArtists()
      const artistCoverMap = new Map()
      for (const artist of starredArtists) {
        artistCoverMap.set(artist.id, artist.coverArt)
      }

      // Группируем по артистам
      const artistMap = new Map()
      for (const [_, rating] of likedRatings) {
        const artistId = rating.songInfo!.artistId!
        if (!artistMap.has(artistId)) {
          artistMap.set(artistId, {
            id: artistId,
            name: rating.songInfo!.artist || 'Unknown',
            coverArt: artistCoverMap.get(artistId),
            likedCount: 0,
            lastLiked: rating.lastPlayed,
          })
        }
        const artist = artistMap.get(artistId)
        artist.likedCount++
      }

      const sortedArtists = Array.from(artistMap.values())
        .sort((a, b) => b.likedCount - a.likedCount)

      setArtists(sortedArtists)
    } catch (error) {
      console.error('[MyWaveEncounters] Failed to load:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlayArtistRadio = async (artistId: string) => {
    if (isPlaying) return
    setIsPlaying(artistId)

    try {
      const result = await generateArtistRadio(artistId, 25)
      if (result.songs.length > 0) {
        setSongList(result.songs, 0, false)
        toast.success(`▶️ Радио: ${artists.find(a => a.id === artistId)?.name}`, { autoClose: 2000 })
      }
    } catch (error) {
      console.error('[MyWaveEncounters] Failed to play radio:', error)
      toast.error('Не удалось запустить радио')
    } finally {
      setIsPlaying(null)
    }
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 1) return 'Сегодня'
    if (diffDays < 7) return `${diffDays}д назад`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}н назад`

    return date.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })
  }

  return (
    <div 
      className="relative w-full min-h-screen"
      style={{ 
        backgroundColor: 'var(--theme-background)', 
        color: 'var(--theme-foreground)',
        animation: 'fadeIn 0.3s ease-in-out'
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      
      {/* Градиентный фон */}
      <div 
        className="absolute inset-0"
        style={{ backgroundColor: 'var(--theme-background-alternate)', opacity: 0.5 }}
      />

      <div className="relative z-10">
        {/* Header - sticky relative окна */}
        <div 
          className="sticky top-0 z-50 border-b"
          style={{ 
            backgroundColor: 'var(--theme-background-alternate)',
            borderColor: 'var(--theme-border)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div 
            className="absolute inset-0"
            style={{ 
              backgroundColor: 'var(--theme-background-alternate)',
              opacity: 0.85,
            }}
          />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => navigate('/')} 
                  className="p-2 rounded-full transition-colors"
                  style={{ color: 'var(--theme-foreground)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
                  <h1 className="text-xl font-bold" style={{ color: 'var(--theme-foreground)' }}>Встречали в Моей Волне</h1>
                </div>
              </div>
              <p className="text-sm" style={{ color: 'var(--theme-muted-foreground)' }}>
                {artists.length} артистов
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
              <p className={t.text.secondary}>Загрузка...</p>
            </div>
          ) : artists.length === 0 ? (
            <div className={`text-center py-16 ${t.cardBg} rounded-2xl border ${t.border}`}>
              <Music2 className={`w-16 h-16 mx-auto mb-4 ${t.text.muted}`} />
              <h3 className={`text-lg font-semibold mb-2 ${t.text.primary}`}>Пока пусто</h3>
              <p className={`text-sm mb-6 ${t.text.secondary}`}>
                Лайкайте треки — здесь появятся артисты из вашей истории
              </p>
              <button onClick={() => navigate('/')} className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors">
                На главную
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-6">
              {artists.map((artist) => (
                <div
                  key={artist.id}
                  className="flex flex-col items-center group"
                >
                  {/* Circular Cover */}
                  <div className="relative w-[140px] h-[140px] rounded-full overflow-hidden bg-gray-200 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                    {artist.coverArt ? (
                      <LazyLoadImage
                        src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '300')}
                        effect="opacity"
                        className="w-full h-full object-cover"
                        alt={artist.name}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <Music2 size={40} />
                      </div>
                    )}

                    {/* Play overlay */}
                    <button
                      onClick={() => handlePlayArtistRadio(artist.id)}
                      disabled={isPlaying === artist.id}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      {isPlaying === artist.id ? (
                        <Loader2 className="w-10 h-10 text-white animate-spin" />
                      ) : (
                        <Play className="w-10 h-10 text-white fill-white" />
                      )}
                    </button>
                  </div>

                  {/* Info */}
                  <div className="mt-3 text-center w-[140px]">
                    <Link 
                      to={`/library/artists/${artist.id}`}
                      className="font-medium truncate text-xs block transition-colors"
                      style={{ color: 'var(--theme-accent)' }}
                      title={artist.name}
                    >
                      {artist.name}
                    </Link>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <Star className="w-3 h-3 text-amber-500" />
                      <span className={`text-xs ${t.text.muted}`}>{artist.likedCount} ×</span>
                    </div>
                    {artist.lastLiked && (
                      <p className={`text-[10px] ${t.text.secondary} mt-0.5 truncate`} title={formatDate(artist.lastLiked)}>
                        {formatDate(artist.lastLiked)}
                      </p>
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
