/**
 * "В стиле" — все лайкнутые артисты из профиля
 * Фон из установленной темы
 */

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useThemeStore } from '@/store/theme.store'
import { Theme } from '@/types/themeContext'
import { useML } from '@/store/ml.store'
import { subsonic } from '@/service/subsonic'
import { generateArtistRadio } from '@/service/ml-wave-service'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { ChevronLeft, Play, Loader2, Music2, Users } from 'lucide-react'
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
      ? 'bg-gradient-to-br from-amber-950/50 via-orange-900/30 to-[#1a1225]'
      : 'bg-gradient-to-br from-amber-100/50 via-orange-50/30 to-yellow-100/50',
  }
}

interface ArtistWithStats {
  id: string
  name: string
  coverArt?: string
  weight: number
  playCount: number
  genre?: string
}

export default function InStyleArtistsPage() {
  const navigate = useNavigate()
  const t = useThemeClasses()
  const { setSongList } = usePlayerActions()
  const { profile, ratings } = useML()
  const [artists, setArtists] = useState<ArtistWithStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState<string | null>(null)

  useEffect(() => {
    loadArtists()
  }, [profile.preferredArtists])

  const loadArtists = async () => {
    setIsLoading(true)
    try {
      const preferredArtists = profile.preferredArtists || {}
      const topArtistIds = Object.entries(preferredArtists)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)

      console.log('[InStyleArtists] Loading', topArtistIds.length, 'artists')

      const artistsWithData: ArtistWithStats[] = []

      for (const artistId of topArtistIds) {
        try {
          const artist = await subsonic.artists.getOne(artistId)
          if (artist) {
            // Подсчитываем количество прослушиваний треков этого артиста
            const artistSongIds = Object.entries(ratings)
              .filter(([_, r]: [string, any]) => r.songInfo?.artistId === artistId)
              .reduce((sum, [_, r]: [string, any]) => sum + (r.playCount || 0), 0)

            artistsWithData.push({
              id: artist.id,
              name: artist.name,
              coverArt: artist.coverArt,
              weight: preferredArtists[artistId] || 0,
              playCount: artistSongIds,
              genre: artist.genre?.[0],
            })
          }
        } catch (err) {
          console.warn(`[InStyleArtists] Failed to load artist ${artistId}:`, err)
        }
      }

      // Сортируем по весу (предпочтению)
      artistsWithData.sort((a, b) => b.weight - a.weight)
      setArtists(artistsWithData)
    } catch (error) {
      console.error('[InStyleArtists] Failed to load:', error)
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
      console.error('[InStyleArtists] Failed to play radio:', error)
      toast.error('Не удалось запустить радио')
    } finally {
      setIsPlaying(null)
    }
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
                  <Users className="w-5 h-5" style={{ color: 'var(--theme-accent)' }} />
                  <h1 className="text-xl font-bold" style={{ color: 'var(--theme-foreground)' }}>В стиле</h1>
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
                Выберите артисты при холодном старте или лайкайте треки — и они появятся здесь
              </p>
              <button onClick={() => navigate('/artists/cold-start')} className="px-6 py-2.5 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 transition-colors">
                Холодный старт
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
                    {artist.genre && (
                      <p className={`text-[10px] ${t.text.secondary} mt-0.5 truncate`} title={artist.genre}>{artist.genre}</p>
                    )}
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <span className={`text-xs ${t.text.muted}`}>{artist.playCount} ×</span>
                    </div>
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
