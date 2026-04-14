/**
 * New Album Page — Современный дизайн страницы альбома
 * Версия 1.0 — Стиль под новую страницу артиста
 *
 * ОСОБЕННОСТИ:
 * 1. Баннер-хедер с коллажем из обложек других альбомов артиста
 * 2. Сворачиваемые секции (CollapsibleSection)
 * 3. Кастомные строки треков (SongRow) с контекстным меню (ПКМ)
 * 4. Закреплённая кнопка Play при скролле
 * 5. Дискография артиста и альбомы жанра
 * 6. Переключатель в настройках: pageDesignSettings.newAlbumDesignEnabled
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronUp,
  Play,
  Shuffle,
  Radio,
  Music2,
  Disc,
  ListMusic,
  Share2,
  Loader2,
  Heart,
  Ellipsis,
  ChevronRight,
  Clock,
  Eye,
  SkipForward,
  Plus,
  Calendar,
  Mic2,
  Tag,
} from 'lucide-react'
import { useGetAlbum, useGetArtistAlbums, useGetGenreAlbums } from '@/app/hooks/use-album'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { subsonic } from '@/service/subsonic'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/app/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { ROUTES } from '@/routes/routesList'
import { AlbumInfo } from '@/app/components/album/info'
import { AlbumComment } from '@/app/components/album/comment'
import { RecordLabelsInfo } from '@/app/components/album/record-labels'
import { AlbumFallback } from '@/app/components/fallbacks/album-fallbacks'
import ErrorPage from '@/app/pages/error-page'
import { sortRecentAlbums } from '@/utils/album'
import { convertSecondsToHumanRead } from '@/utils/convertSecondsToTime'

// ==================== СВОРАЧИВАЕМАЯ СЕКЦИЯ ====================

interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  defaultExpanded?: boolean
  children: React.ReactNode
  count?: number
  onViewAll?: () => void
  viewAllLabel?: string
}

function CollapsibleSection({ title, icon, defaultExpanded = true, children, count, onViewAll, viewAllLabel = 'Все' }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className="mb-8">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between mb-4 group"
        style={{ color: 'var(--theme-foreground)' }}
      >
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-xl font-bold">{title}</h2>
          {count !== undefined && (
            <span
              className="text-sm px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-foreground)', opacity: 0.9 }}
            >
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onViewAll && (
            <span
              className="text-sm font-medium mr-2"
              style={{ color: 'var(--theme-accent)' }}
              onClick={(e) => { e.stopPropagation(); onViewAll() }}
            >
              {viewAllLabel}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 transition-transform group-hover:scale-110" />
          ) : (
            <ChevronDown className="w-5 h-5 transition-transform group-hover:scale-110" />
          )}
        </div>
      </button>
      {isExpanded && children}
    </div>
  )
}

// ==================== ЕДИНЫЙ СТИЛЬ КНОПОК ====================

const actionButtonStyle = 'p-3 rounded-xl transition-all hover:scale-110 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100'
const actionButtonBg = { backgroundColor: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', color: 'white' }
const actionButtonBgActive = { backgroundColor: 'var(--theme-accent)', backdropFilter: 'blur(10px)', color: 'white' }

// ==================== СТРОКА ТРЕКА С КОНТЕКСТНЫМ МЕНЮ ====================

interface SongRowProps {
  song: any
  index: number
  playCount: number
  onPlay: () => void
  onPlayNext?: (song: any) => void  // 🆕
  onAddToEnd?: (song: any) => void  // 🆕
  onToggleLike?: (songId: string) => void  // 🆕
  isLiked?: boolean  // 🆕
  onPlayTrackRadio?: (song: any) => void
  isTrackRadioGenerating?: boolean
  navigate?: (path: string) => void
  albumId?: string  // 🆕 Для бана артиста
}

function SongRow({ song, index, playCount, onPlay, onPlayNext, onAddToEnd, onToggleLike, isLiked, onPlayTrackRadio, isTrackRadioGenerating, navigate, albumId }: SongRowProps) {
  const [hovered, setHovered] = useState(false)
  const duration = song.duration || 0
  const mins = Math.floor(duration / 60)
  const secs = (duration % 60).toString().padStart(2, '0')

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="grid items-center cursor-pointer transition-all duration-200 rounded-lg"
          style={{
            gridTemplateColumns: '40px 1fr 1fr 80px 80px 50px 50px',
            gap: '12px',
            padding: '8px 12px',
            backgroundColor: hovered ? 'var(--theme-accent)' : 'var(--theme-background-alternate)',
            opacity: hovered ? 0.95 : 1,
            transform: hovered ? 'scale(1.01)' : 'scale(1)',
            boxShadow: hovered ? '0 4px 12px rgba(0, 0, 0, 0.3)' : 'none',
          }}
          onClick={onPlay}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* № */}
          <span className="text-sm text-center" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)' }}>
            {index + 1}
          </span>

          {/* Название */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 relative" style={{ backgroundColor: 'var(--theme-background)' }}>
              {song.coverArt ? (
                <LazyLoadImage
                  src={getSimpleCoverArtUrl(song.coverArt, 'song', '100')}
                  alt=""
                  className="w-full h-full object-cover"
                  effect="opacity"
                  threshold={100}
                  placeholder={
                    <div className="w-full h-full flex items-center justify-center">
                      <Disc className="w-5 h-5 animate-pulse" style={{ color: 'var(--theme-muted-foreground)' }} />
                    </div>
                  }
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Disc className="w-5 h-5" style={{ color: 'var(--theme-muted-foreground)' }} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate transition-colors" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-foreground)' }}>
                {song.title}
              </p>
              {song.artist && (
                <p className="text-xs truncate transition-colors" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)', opacity: 0.8 }}>
                  {song.artist}
                </p>
              )}
            </div>
          </div>

          {/* Диск/Номер */}
          <p className="text-sm truncate" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)' }}>
            {song.discNumber ? `Диск ${song.discNumber}` : '—'}
          </p>

          {/* Длительность */}
          <span className="text-sm text-center" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)' }}>
            {mins}:{secs}
          </span>

          {/* Прослушивания */}
          <div className="flex items-center justify-center gap-1">
            <Eye className="w-3.5 h-3.5" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)' }} />
            <span className="text-sm" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)' }}>
              {playCount}
            </span>
          </div>

          {/* Битрейт */}
          <span className="text-sm text-center" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)' }}>
            {song.bitRate ? `${song.bitRate} kbps` : '—'}
          </span>

          {/* Избранное */}
          <div className="text-center">
            {isLiked && <Heart className="w-4 h-4 inline" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-accent)', fill: isLiked ? (hovered ? 'var(--theme-background)' : 'var(--theme-accent)') : 'none' }} />}
          </div>
        </div>
      </ContextMenuTrigger>

      {/* Контекстное меню - ПКМ */}
      <ContextMenuContent>
        <ContextMenuItem onClick={onPlay}>
          <Play className="w-4 h-4 mr-2" />
          Воспроизвести
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onPlayNext?.(song)}>
          <SkipForward className="w-4 h-4 mr-2" />
          Воспроизвести следующим
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAddToEnd?.(song)}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить в конец очереди
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => onPlayTrackRadio?.(song)} disabled={isTrackRadioGenerating}>
          <Radio className="w-4 h-4 mr-2" />
          {isTrackRadioGenerating ? 'Генерация...' : 'Радио трека'}
        </ContextMenuItem>

        <ContextMenuSeparator />

        {song.artistId && (
          <ContextMenuItem onClick={() => navigate?.(`/library/artists/${song.artistId}`)}>
            <Mic2 className="w-4 h-4 mr-2" />
            Перейти к {song.artist}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => onToggleLike?.(song.id)}>
          <Heart className="w-4 h-4 mr-2" />
          {isLiked ? 'Убрать из избранного' : 'Добавить в избранное'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ==================== СЕТКА АЛЬБОМОВ ====================

function AlbumGrid({ albums, navigate }: { albums: any[], navigate: any }) {
  if (albums.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {albums.map((album) => (
        <button
          key={album.id}
          onClick={() => navigate(`/library/albums/${album.id}`)}
          className="group text-left"
        >
          <div className="aspect-square rounded-xl overflow-hidden shadow-md group-hover:shadow-xl transition-all group-hover:scale-[1.02] mb-2 relative" style={{ backgroundColor: 'var(--theme-background)' }}>
            {album.coverArt ? (
              <LazyLoadImage
                src={getSimpleCoverArtUrl(album.coverArt, 'album', '300')}
                effect="opacity"
                className="w-full h-full object-cover"
                alt={album.name}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                <Disc size={40} />
              </div>
            )}
            {album.year && (
              <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
                {album.year}
              </div>
            )}
          </div>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-foreground)' }}>{album.name}</p>
          {album.artist && <p className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>{album.artist}</p>}
        </button>
      ))}
    </div>
  )
}

// ==================== НОВАЯ СТРАНИЦА АЛЬБОМА ====================

export default function NewAlbumPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { albumId } = useParams() as { albumId: string }
  const { setSongList, playNextSong, addSongToEnd } = usePlayerActions()

  const [isGeneratingRadio, setIsGeneratingRadio] = useState(false)
  const [isTrackRadioGenerating, setIsTrackRadioGenerating] = useState(false)
  const [showStickyPlay, setShowStickyPlay] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [starredSongs, setStarredSongs] = useState<Set<string>>(new Set())  // 🆕 Избранные треки

  const {
    data: album,
    isLoading: albumIsLoading,
    isFetched,
  } = useGetAlbum(albumId)

  console.log('[NewAlbum] Album data loaded:', album)
  console.log('[NewAlbum] album.artistId:', album?.artistId)
  console.log('[NewAlbum] album.artist:', album?.artist)

  const { data: artist, isLoading: moreAlbumsIsLoading, refetch: refetchArtist } = useGetArtistAlbums(album?.artistId || '')

  console.log('[NewAlbum] Artist data:', artist, 'isLoading:', moreAlbumsIsLoading)

  // Принудительный refetch когда появляется album.artistId
  useEffect(() => {
    if (album?.artistId && !artist) {
      console.log('[NewAlbum] 🔥 Forcing refetch for artistId:', album.artistId)
      refetchArtist()
    }
  }, [album?.artistId, artist, refetchArtist])
  const { data: randomAlbums, isLoading: randomAlbumsIsLoading } = useGetGenreAlbums(album?.genre || '')

  // Debug: логируем загрузку дискографии
  useEffect(() => {
    console.log('[NewAlbum] === Discography Debug ===')
    console.log('[NewAlbum] albumId param:', albumId)
    console.log('[NewAlbum] album:', album)
    console.log('[NewAlbum] album.artistId:', album?.artistId)
    console.log('[NewAlbum] album.artist:', album?.artist)
    console.log('[NewAlbum] artist data:', artist)
    console.log('[NewAlbum] artist.album:', artist?.album)
    console.log('[NewAlbum] artist.album?.length:', artist?.album?.length)
    if (artist && (!artist.album || artist.album.length === 0)) {
      console.warn('[NewAlbum] ⚠️ No albums returned! Full artist response:', JSON.stringify(artist, null, 2).substring(0, 500))
    }
    if (!album?.artistId && !album?.artist) {
      console.warn('[NewAlbum] ⚠️ album.artistId AND album.artist are BOTH undefined!')
    }
  }, [albumId, album, artist])

  const songs = album?.song || []
  const moreAlbums = artist?.album || []
  const genreAlbums = randomAlbums?.list || []

  // Проверяем избранное
  useEffect(() => {
    if (album?.starred !== undefined && album.starred !== null) {
      setIsFavorite(true)
    }
  }, [album?.starred])

  // Закреплённая кнопка Play
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop
      setShowStickyPlay(scrollY > 250)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 🆕 Загрузка starred треков
  useEffect(() => {
    const loadStarred = async () => {
      try {
        const starred = await subsonic.star.getStarred()
        if (starred?.songs) {
          setStarredSongs(new Set(starred.songs.map((s: any) => s.id)))
        }
      } catch (e) {
        console.error('[Album] Failed to load starred songs:', e)
      }
    }
    loadStarred()
  }, [albumId])

  // 🆕 Toggle Like функция
  const handleToggleLike = async (songId: string) => {
    const isCurrentlyLiked = starredSongs.has(songId)
    try {
      if (isCurrentlyLiked) {
        await subsonic.star.unstarItem(songId)
        setStarredSongs(prev => {
          const next = new Set(prev)
          next.delete(songId)
          return next
        })
        toast.info('💔 Убрано из избранного', { autoClose: 1500 })
      } else {
        await subsonic.star.starItem(songId)
        setStarredSongs(prev => {
          const next = new Set(prev)
          next.add(songId)
          return next
        })
        toast.success('❤️ Добавлено в избранное', { autoClose: 1500 })
      }
    } catch (e) {
      toast.error('Ошибка при изменении избранного', { autoClose: 2000 })
    }
  }

  if (albumIsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 animate-spin" style={{ color: 'var(--theme-accent)' }} />
      </div>
    )
  }
  if (isFetched && !album) {
    return <ErrorPage status={404} statusText="Not Found" />
  }
  if (!album) return <AlbumFallback />

  // Подсчёт статистики
  const totalSongs = songs.length
  const totalDuration = album.duration ? convertSecondsToHumanRead(album.duration) : '—'
  const albumYear = album.year || '—'
  const albumGenre = album.genre || '—'

  // Баннер-альбомы: другие альбомы артиста с обложками
  const bannerAlbums = moreAlbums
    .filter((a: any) => a.id !== albumId && a.coverArt)
    .sort((a: any, b: any) => (b.songCount || 0) - (a.songCount || 0))
    .slice(0, 6)

  // Другие альбомы артиста (без текущего)
  const otherArtistAlbums = moreAlbums
    .filter((a: any) => a.id !== albumId)
    .sort((a: any, b: any) => (b.year || 0) - (a.year || 0))
    .slice(0, 12)

  console.log('[NewAlbum] Discography: moreAlbums:', moreAlbums?.length, 'otherArtistAlbums:', otherArtistAlbums.length, 'albumId:', albumId, 'bannerAlbums:', bannerAlbums.length)

  // Альбомы жанра (без текущего)
  const otherGenreAlbums = genreAlbums
    .filter((a: any) => a.id !== albumId)
    .slice(0, 12)

  const accentColor = 'var(--theme-accent)'

  // ==================== ОБРАБОТЧИКИ ====================

  const handlePlayAll = () => {
    if (songs.length > 0) setSongList(songs, 0)
  }

  const handleShuffleAll = () => {
    if (songs.length > 0) {
      const shuffled = [...songs].sort(() => Math.random() - 0.5)
      setSongList(shuffled, 0)
    }
  }

  const handlePlayNext = () => {
    if (songs.length > 0) {
      playNextSong(songs)
      toast.success('⏭️ Воспроизвести следующим', { autoClose: 1500 })
    }
  }

  const handleAddToEnd = () => {
    if (songs.length > 0) {
      addSongToEnd(songs)
      toast.success('⏭️ Добавлено в конец очереди', { autoClose: 1500 })
    }
  }

  const handleToggleFavorite = () => {
    if (!albumId) return
    if (isFavorite) {
      subsonic.star.unstarItem(albumId)
      setIsFavorite(false)
      toast.success(`💔 Удалён из избранного: ${album.name}`, { autoClose: 2000 })
    } else {
      subsonic.star.starItem(albumId)
      setIsFavorite(true)
      toast.success(`❤️ Добавлен в избранное: ${album.name}`, { autoClose: 2000 })
    }
  }

  const handleShareAlbum = () => {
    const text = `🎵 ${album.name} — ${album.artist}\nПослушай на KumaFlow!`
    navigator.clipboard.writeText(text)
    toast.success('📋 Скопировано!', { autoClose: 1500 })
  }

  const handlePlayTrackRadio = async (song: any) => {
    setIsTrackRadioGenerating(true)
    try {
      // Пока просто добавляем похожие треки
      toast.info(`📻 Радио трека: ${song.title} (скоро)`, { autoClose: 2000 })
    } catch (error) {
      toast.error('Не удалось запустить радио')
    } finally {
      setIsTrackRadioGenerating(false)
    }
  }

  const handleArtistClick = (artistId: string) => {
    if (artistId) navigate(`/library/artists/${artistId}`)
  }

  const getPlayCount = (songId: string) => {
    // Можно подключить ratings если нужно
    return 0
  }

  // Колонки для заголовка таблицы
  const tableHeaderColumns = [
    { label: '#', width: '40px', align: 'center' as const },
    { label: 'Название', flex: '1fr' },
    { label: 'Диск', flex: '1fr' },
    { label: 'Время', width: '80px', align: 'center' as const },
    { label: 'Play', width: '80px', align: 'center' as const },
    { label: 'Битрейт', width: '50px', align: 'center' as const },
  ]

  return (
    <div
      className="relative w-full min-h-screen"
      style={{ backgroundColor: 'var(--theme-background)', color: 'var(--theme-foreground)', animation: 'fadeIn 0.3s ease-in-out' }}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* HEADER С КОЛЛАЖЕМ */}
      <div className="relative w-full" style={{ height: '400px', overflow: 'hidden' }}>
        <div className="absolute inset-0" style={{ display: 'flex', gap: '2px' }}>
          {bannerAlbums.length > 0 ? (
            bannerAlbums.map((bannerAlbum: any, i: number) => (
              <div
                key={bannerAlbum.id}
                className="flex-1 relative overflow-hidden"
                style={{ opacity: 0.4 + (i * 0.1) }}
              >
                <img
                  src={getSimpleCoverArtUrl(bannerAlbum.coverArt!, 'album', '500')}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))
          ) : (
            <div className="flex-1" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.3 }} />
          )}
        </div>

        {/* Градиентное затемнение */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.95) 70%, var(--theme-background) 100%)' }}
        />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} />

        {/* Контент хедера */}
        <div className="relative h-full flex items-end pb-12">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 max-w-7xl mx-auto">
              {/* Обложка альбома */}
              <div className="relative z-10">
                <div
                  className="w-[180px] h-[180px] sm:w-[240px] sm:h-[240px] rounded-xl overflow-hidden shadow-2xl transition-transform hover:scale-105 cursor-pointer"
                  style={{ border: `4px solid ${accentColor}`, backgroundColor: 'var(--theme-background-alternate)' }}
                >
                  {album.coverArt ? (
                    <img
                      src={getSimpleCoverArtUrl(album.coverArt, 'album', '600')}
                      alt={album.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                      <Disc size={80} />
                    </div>
                  )}
                </div>
              </div>

              {/* Кнопки в правом верхнем углу */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
                <button
                  onClick={handleShareAlbum}
                  className="p-2.5 rounded-lg transition-all hover:scale-110"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', backdropFilter: 'blur(10px)' }}
                  title="Поделиться"
                >
                  <Share2 className="w-5 h-5" />
                </button>
              </div>

              {/* Информация и кнопки */}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-3xl sm:text-5xl font-bold mb-3" style={{ color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
                  {album.name}
                </h1>

                {/* Ссылка на артиста */}
                {album.artistId && (
                  <Link
                    to={`/library/artists/${album.artistId}`}
                    className="text-lg font-medium mb-3 inline-block transition-colors hover:underline"
                    style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
                    onClick={(e) => { e.preventDefault(); handleArtistClick(album.artistId!) }}
                  >
                    {album.artist}
                  </Link>
                )}

                {/* Бейджи */}
                <div className="flex flex-wrap justify-center sm:justify-start gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.9)' }} />
                    <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                      {albumYear}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Music2 className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.9)' }} />
                    <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                      {totalSongs} треков
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.9)' }} />
                    <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                      {totalDuration}
                    </span>
                  </div>
                  {albumGenre !== '—' && (
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.9)' }} />
                      <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                        {albumGenre}
                      </span>
                    </div>
                  )}
                </div>

                {/* Панель действий */}
                <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                  <button
                    onClick={handlePlayAll}
                    className={actionButtonStyle}
                    style={actionButtonBg}
                    title="Воспроизвести"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleShuffleAll}
                    className={actionButtonStyle}
                    style={actionButtonBg}
                    title="Перемешать"
                  >
                    <Shuffle className="w-5 h-5" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className={actionButtonStyle} style={actionButtonBg} title="Дополнительно">
                        <Ellipsis className="w-5 h-5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={handlePlayNext}>
                        <SkipForward className="w-4 h-4 mr-2" />
                        Воспроизвести следующим
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleAddToEnd}>
                        <ListMusic className="w-4 h-4 mr-2" />
                        Добавить в конец
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={handleToggleFavorite}
                    className={actionButtonStyle}
                    style={isFavorite ? actionButtonBgActive : actionButtonBg}
                    title={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
                  >
                    <Heart className={`w-5 h-5 ${isFavorite ? 'fill-white text-white' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* КОНТЕНТ */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Информация об альбоме */}
          <AlbumInfo album={album} />

          {/* Треки альбома */}
          {songs.length > 0 && (
            <CollapsibleSection
              title="Треки"
              icon={<ListMusic className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />}
              count={totalSongs}
              defaultExpanded={true}
            >
              {/* Заголовок таблицы */}
              <div className="grid mb-2 px-2" style={{ gridTemplateColumns: '40px 1fr 1fr 80px 80px 50px 50px', gap: '12px' }}>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}>#</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--theme-muted-foreground)' }}>Название</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--theme-muted-foreground)' }}>Диск</span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                  <Clock className="w-3 h-3 inline mr-1" />Время
                </span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                  <Eye className="w-3 h-3 inline mr-1" />Play
                </span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}>Битрейт</span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}>❤</span>
              </div>

              {/* Строки треков */}
              <div className="space-y-1" key={`album-songs-${starredSongs.size}`}>
                {songs.map((song: any, index: number) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    index={index}
                    playCount={getPlayCount(song.id)}
                    onPlay={() => setSongList(songs, index)}
                    onPlayNext={(song) => { playNextSong([song]); toast.success('⏭️ Следующим', { autoClose: 1500 }) }}
                    onAddToEnd={(song) => { addSongToEnd([song]); toast.success('⏭️ В конец', { autoClose: 1500 }) }}
                    onToggleLike={handleToggleLike}
                    isLiked={starredSongs.has(song.id)}
                    onPlayTrackRadio={handlePlayTrackRadio}
                    isTrackRadioGenerating={isTrackRadioGenerating}
                    navigate={navigate}
                    albumId={albumId}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Комментарий альбома */}
          {album.song.length > 0 && album.song[0].comment && (
            <CollapsibleSection
              title="Комментарий"
              icon={<Music2 className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />}
              defaultExpanded={false}
            >
              <AlbumComment comment={album.song[0].comment} />
            </CollapsibleSection>
          )}

          {/* Лейблы записи */}
          <RecordLabelsInfo album={album} />

          {/* Дискография артиста */}
          {moreAlbumsIsLoading ? (
            <div className="flex items-center gap-3 p-6 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Загрузка дискографии...
            </div>
          ) : otherArtistAlbums.length > 0 ? (
            <CollapsibleSection
              title="Дискография"
              icon={<Disc className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />}
              count={otherArtistAlbums.length}
              onViewAll={() => album.artistId && navigate(`/library/albums?artistId=${album.artistId}&artistName=${encodeURIComponent(album.artist)}&mainFilter=recentlyAdded`)}
              viewAllLabel="Все альбомы"
            >
              <AlbumGrid albums={otherArtistAlbums} navigate={navigate} />
            </CollapsibleSection>
          ) : album?.artistId ? (
            <div className="p-6 text-center text-muted-foreground">
              У артиста нет других альбомов
            </div>
          ) : null}

          {/* Альбомы жанра */}
          {otherGenreAlbums.length > 0 && album.genre && (
            <CollapsibleSection
              title={`Альбомы жанра: ${album.genre}`}
              icon={<Tag className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />}
              count={otherGenreAlbums.length}
              onViewAll={() => album.genre && navigate(ROUTES.ALBUMS.GENRE(album.genre))}
              viewAllLabel="Все жанра"
            >
              <AlbumGrid albums={otherGenreAlbums} navigate={navigate} />
            </CollapsibleSection>
          )}
        </div>
      </div>

      {/* ЗАКРЕПЛЁННАЯ КНОПКА PLAY */}
      {showStickyPlay && songs.length > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 backdrop-blur-md rounded-full shadow-2xl p-2"
          style={{ backgroundColor: 'var(--theme-background-alternate)', opacity: 0.9 }}
        >
          <button
            onClick={handlePlayAll}
            className="flex items-center gap-3 px-6 py-3 rounded-full font-semibold transition-all hover:scale-105"
            style={{ backgroundColor: 'var(--theme-accent)', color: 'white' }}
          >
            <Play className="w-5 h-5" />
            <span>{album.name}</span>
            <span className="text-xs opacity-80">{totalSongs} треков • {totalDuration}</span>
          </button>
        </div>
      )}
    </div>
  )
}
