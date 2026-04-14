/**
 * Search Page — Поиск
 * Как в Яндекс Музыке: поиск по трекам, артистам, альбомам
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { subsonic } from '@/service/subsonic'
import { search3 } from '@/service/subsonic-api'
import { usePlayerActions } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { generateArtistRadio } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import {
  Search as SearchIcon,
  Play,
  Music2,
  Mic2,
  Disc,
  ChevronLeft,
  X,
  Loader2,
} from 'lucide-react'
import { useThemeStore } from '@/store/theme.store'
import { Theme } from '@/types/themeContext'

function useThemeClasses() {
  // Используем CSS переменные из темы вместо проверки Theme.Dark
  // Это гарантирует работу со всеми 48 темами
  // НО теперь используем inline style с var(--theme-*) вместо Tailwind классов

  return {
    isDark: true, // Для обратной совместимости
    bg: 'bg-background',
    bgGradient: 'bg-background',  // Используем просто bg-background без градиента
    cardBg: 'bg-background-alternate border-border',
    cardHover: 'hover:bg-background-alternate/50',
    text: {
      primary: 'text-foreground',
      secondary: 'text-muted-foreground',
      muted: 'text-muted-foreground/70',
    },
    link: 'text-accent hover:text-accent/80',
    borderDashed: 'border-border/50',
    input: 'bg-background-alternate border-border text-foreground placeholder-muted-foreground',
    headerBg: 'bg-background-alternate/90',
    headerBorder: 'border-border',
  }
}

export default function SearchPage() {
  const navigate = useNavigate()
  const t = useThemeClasses()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ songs: ISong[], artists: any[], albums: any[] }>({ songs: [], artists: [], albums: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'tracks' | 'artists' | 'albums'>('all')
  const { setSongList } = usePlayerActions()
  const [isPlayingArtist, setIsPlayingArtist] = useState<string | null>(null)

  // Debounced search
  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults({ songs: [], artists: [], albums: [] })
      return
    }

    setIsLoading(true)
    try {
      const result = await search3(searchQuery, {
        artistCount: 15,
        albumCount: 15,
        songCount: 30,
      })

      setResults({
        songs: result.songs || [],
        artists: result.artists || [],
        albums: result.albums || [],
      })
    } catch (error) {
      console.error('[Search] Failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => search(query), 300)
    return () => clearTimeout(timeout)
  }, [query, search])

  const handlePlaySong = async (song: ISong) => {
    setSongList([song], 0)
  }

  const handleGoToArtist = (artistId: string) => {
    navigate(`/library/artists/${artistId}`)
  }

  const handleGoToAlbum = (albumId: string) => {
    navigate(`/library/albums/${albumId}`)
  }

  const handlePlayArtistRadio = async (artistId: string, artistName: string) => {
    if (isPlayingArtist === artistId) return
    setIsPlayingArtist(artistId)

    try {
      const result = await generateArtistRadio(artistId, 25)
      if (result.songs.length > 0) {
        setSongList(result.songs, 0, false)
        toast.success(`▶️ Радио: ${artistName}`, { autoClose: 2000 })
      }
    } catch (error) {
      console.error('[Search] Failed to play radio:', error)
      toast.error('Не удалось запустить радио')
    } finally {
      setIsPlayingArtist(null)
    }
  }

  const hasResults = results.songs.length > 0 || results.artists.length > 0 || results.albums.length > 0
  const totalResults = results.songs.length + results.artists.length + results.albums.length

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
      {/* Основной контент */}
      <div className="relative z-10">
        {/* Header */}
        <div 
          className="sticky top-0 z-10 border-b"
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
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 h-16">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-full transition-colors"
                style={{ 
                  color: 'var(--theme-foreground)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-background-alternate)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

            {/* Search Input */}
            <div className="flex-1 relative">
              <SearchIcon 
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                style={{ color: 'var(--theme-muted-foreground)' }}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по трекам, артистам, альбомам..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all"
                style={{
                  backgroundColor: 'var(--theme-background-alternate)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-foreground)',
                }}
                autoFocus
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors"
                  style={{ color: 'var(--theme-muted-foreground)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-background-alternate)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          {hasResults && (
            <div className="flex gap-2 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {[
                { id: 'all' as const, label: `Все (${totalResults})` },
                { id: 'tracks' as const, label: `Треки (${results.songs.length})` },
                { id: 'artists' as const, label: `Артисты (${results.artists.length})` },
                { id: 'albums' as const, label: `Альбомы (${results.albums.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200"
                  style={{
                    backgroundColor: activeTab === tab.id ? 'var(--theme-accent)' : 'transparent',
                    color: activeTab === tab.id ? 'white' : 'var(--theme-accent)',
                    border: activeTab === tab.id ? 'none' : '1px solid var(--theme-accent)',
                    opacity: activeTab === tab.id ? 1 : 0.7,
                    transform: activeTab === tab.id ? 'scale(1.05)' : 'scale(1)',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab.id) {
                      e.currentTarget.style.opacity = '1'
                      e.currentTarget.style.backgroundColor = 'var(--theme-accent)'
                      e.currentTarget.style.color = 'white'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab.id) {
                      e.currentTarget.style.opacity = '0.7'
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = 'var(--theme-accent)'
                    }
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {!query && !hasResults ? (
          /* Empty state */
          <div className="text-center py-20">
            <SearchIcon className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--theme-muted-foreground)' }} />
            <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--theme-foreground)' }}>
              Найдите свою музыку
            </h2>
            <p className="text-sm" style={{ color: 'var(--theme-muted-foreground)' }}>
              Ищите по трекам, артистам и альбомам
            </p>
          </div>
        ) : isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mx-auto mb-4" />
            <p style={{ color: 'var(--theme-muted-foreground)' }}>Поиск...</p>
          </div>
        ) : !hasResults ? (
          <div className="text-center py-12">
            <Music2 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--theme-muted-foreground)' }} />
            <p className="font-medium" style={{ color: 'var(--theme-foreground)' }}>Ничего не найдено</p>
            <p className="text-sm mt-1" style={{ color: 'var(--theme-muted-foreground)' }}>
              Попробуйте изменить запрос
            </p>
          </div>
        ) : (
          <>
            {/* Tracks */}
            {(activeTab === 'all' || activeTab === 'tracks') && results.songs.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--theme-foreground)' }}>
                  <Music2 className="w-5 h-5 inline mr-2" />
                  Треки
                </h3>
                <div className="space-y-1">
                  {results.songs.slice(0, 10).map((song) => (
                    <div
                      key={song.id}
                      className="rounded-xl p-3 transition-all duration-200 group flex items-center gap-3 cursor-pointer hover:bg-accent/10"
                      style={{
                        backgroundColor: 'var(--theme-background-alternate)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.filter = 'brightness(1.15)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.filter = 'none'
                      }}
                    >
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--theme-background)' }}>
                        {song.coverArt ? (
                          <img
                            src={getSimpleCoverArtUrl(song.coverArt, 'song', '100')}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                            <Music2 size={16} />
                          </div>
                        )}
                        <button
                          onClick={() => handlePlaySong(song)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <Play className="w-4 h-4 text-white fill-white" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" style={{ color: 'var(--theme-foreground)' }}>{song.title}</p>
                        <button
                          onClick={() => song.artistId && handleGoToArtist(song.artistId)}
                          className="text-sm truncate hover:underline"
                          style={{ color: 'var(--theme-muted-foreground)' }}
                        >
                          {song.artist}
                        </button>
                      </div>
                      {song.duration && (
                        <span className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>
                          {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Artists */}
            {(activeTab === 'all' || activeTab === 'artists') && results.artists.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--theme-foreground)' }}>
                  <Mic2 className="w-5 h-5 inline mr-2" />
                  Артисты
                </h3>
                <div className="flex gap-6 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                  {results.artists.slice(0, 10).map((artist: any) => (
                    <div
                      key={artist.id}
                      className="flex-shrink-0 w-[160px] group flex flex-col items-center"
                    >
                      {/* Круглая картинка - клик для радио */}
                      <button
                        onClick={() => handlePlayArtistRadio(artist.id, artist.name)}
                        disabled={isPlayingArtist === artist.id}
                        className="w-[140px] h-[140px] rounded-full overflow-hidden shadow-md hover:shadow-xl transition-all hover:scale-105 relative"
                        style={{ backgroundColor: 'var(--theme-background-alternate)' }}
                      >
                        {artist.coverArt ? (
                          <img
                            src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '200')}
                            alt={artist.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                            <Mic2 size={40} />
                          </div>
                        )}
                        {/* Play overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          {isPlayingArtist === artist.id ? (
                            <Loader2 className="w-10 h-10 text-white animate-spin" />
                          ) : (
                            <Play className="w-10 h-10 text-white fill-white" />
                          )}
                        </div>
                      </button>
                      
                      {/* Имя артиста - кликабельная ссылка */}
                      <div className="mt-3 text-center w-[140px]">
                        <Link 
                          to={`/library/artists/${artist.id}`}
                          className="text-sm font-semibold truncate block px-2 transition-colors"
                          style={{ color: 'var(--theme-accent)' }}
                          title={artist.name}
                        >
                          {artist.name}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Albums */}
            {(activeTab === 'all' || activeTab === 'albums') && results.albums.length > 0 && (
              <div className="mb-8">
                <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--theme-foreground)' }}>
                  <Disc className="w-5 h-5 inline mr-2" />
                  Альбомы
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {results.albums.slice(0, 8).map((album: any) => (
                    <Link
                      key={album.id}
                      to={`/library/albums/${album.id}`}
                      className="group text-left block"
                    >
                      <div className="aspect-square rounded-xl overflow-hidden shadow-md group-hover:shadow-xl transition-all group-hover:scale-[1.02] bg-gray-300">
                        {album.coverArt ? (
                          <img
                            src={getSimpleCoverArtUrl(album.coverArt, 'album', '300')}
                            alt={album.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                            <Disc size={40} />
                          </div>
                        )}
                      </div>
                      <div className="mt-2">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--theme-foreground)' }}>{album.name}</div>
                        <div className="text-xs truncate" style={{ color: 'var(--theme-muted-foreground)' }}>{album.artist}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  )
}
