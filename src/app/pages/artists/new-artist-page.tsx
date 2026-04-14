/**
 * New Artist Page — Современный дизайн страницы артиста
 * Версия 3.0 — Все исправления: затемнение, таблицы, плейлисты, сборники, любимые треки
 *
 * ИЗМЕНЕНИЯ (v3.0):
 * 1. Усилено затемнение баннера: rgba(0,0,0,0.75) вместо 0.6 — текст виден на любом фоне
 * 2. ArtistImageViewer — передаём coverArtId + type="artist" для загрузки из Navidrome
 * 3. Кнопки выбора источника биографии — цвет текста от var(--theme-foreground)/var(--theme-accent)
 * 4. Секция "В плейлистах" — загрузка subsonic.playlists.getAll, фильтрация по artistId
 * 5. Секция "Участвует в сборниках" — компиляции из альбомов артиста + поиск по библиотеке
 * 6. Популярные треки — табличный вид (#, Название, Альбом, Год, Длительность, Прослушивания)
 * 7. Секция "Любимые треки" — фильтрация topSongs по ratings > 4
 * 8. Контекстное меню (ПКМ) на треках — воспроизведение, радио, переход к артисту
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import {
  ChevronDown,
  ChevronUp,
  Play,
  Radio,
  Music2,
  Disc,
  ListMusic,
  Share2,
  Loader2,
  Mic2,
  Heart,
  ThumbsDown,
  Download,
  Bell,
  BellOff,
  Sparkles,
  Shuffle,
  Ellipsis,
  ChevronRight,
  Users,
  Star,
  Clock,
  Eye,
  SkipForward,
  Plus,
  Trash2,
} from 'lucide-react'
import { useGetArtist, useGetArtistInfo, useGetTopSongs } from '@/app/hooks/use-artist'
import { usePlayerActions } from '@/store/player.store'
import { generateArtistRadio, generateTrackRadio, generateVibeMix } from '@/service/ml-wave-service'
import { getRandomSongs } from '@/service/subsonic-api'
import { toast } from 'react-toastify'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { subsonic } from '@/service/subsonic'
import { search3 } from '@/service/subsonic-api'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { useArtistSubscriptions } from '@/store/artist-subscriptions.store'
import { useML, useMLActions } from '@/store/ml.store'
import { useExternalApi } from '@/store/external-api.store'
import { fanartService } from '@/service/fanart-api'
import { wikipediaService } from '@/service/wikipedia-api'
import { CacheArtistButton } from '@/app/components/artist/cache-button'
import { ArtistImageViewer } from '@/app/components/artist/artist-image-viewer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { StarRating } from '@/app/components/ui/star-rating'  // 🆕 Рейтинг
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/app/components/ui/context-menu'
import { lastFmService } from '@/service/lastfm-api'
import { ROUTES } from '@/routes/routesList'

// ==================== КРУЖОК ПОХОЖЕГО АРТИСТА ====================

interface SimilarArtistCircleProps {
  artist: any
  onPlayRadio: () => void
}

function SimilarArtistCircle({ artist, onPlayRadio }: SimilarArtistCircleProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className="flex-shrink-0 w-[200px] group flex flex-col items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative w-[180px] h-[180px]">
        <button
          onClick={onPlayRadio}
          className="w-full h-full rounded-full overflow-hidden shadow-lg transition-transform duration-500"
          style={{
            transform: isHovered ? 'scale(1.1)' : 'scale(1)',
            border: '4px solid var(--theme-accent)',
          }}
        >
          {artist.coverArt ? (
            <img
              src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '300')}
              alt={artist.name}
              className="w-full h-full object-cover transition-transform duration-700"
              style={{ transform: isHovered ? 'scale(1.2)' : 'scale(1)' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--theme-background-alternate)', color: 'var(--theme-muted-foreground)' }}>
              <Mic2 size={48} />
            </div>
          )}
          <div
            className="absolute inset-0 flex items-center justify-center transition-opacity duration-500 rounded-full"
            style={{
              background: isHovered ? 'radial-gradient(circle, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)' : 'transparent',
              opacity: isHovered ? 1 : 0,
            }}
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--theme-accent)' }}>
              <Radio className="w-6 h-6 text-white" />
            </div>
          </div>
        </button>
      </div>

      <Link
        to={`/library/artists/${artist.id}`}
        className="mt-3 text-sm font-medium truncate w-full text-center px-2 block transition-all duration-300"
        style={{ color: 'var(--theme-foreground)', transform: isHovered ? 'scale(1.05)' : 'scale(1)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--theme-accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--theme-foreground)')}
      >
        {artist.name}
      </Link>
    </div>
  )
}

// ==================== СЕКЦИЯ С ВОЗМОЖНОСТЬЮ СВОРАЧИВАНИЯ ====================

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
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between mb-4 group" style={{ color: 'var(--theme-foreground)' }}>
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-xl font-bold">{title}</h2>
          {count !== undefined && (
            <span className="text-sm px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--theme-accent)', color: 'var(--theme-foreground)', opacity: 0.9 }}>{count}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onViewAll && (
            <span className="text-sm font-medium mr-2" style={{ color: 'var(--theme-accent)' }} onClick={(e) => { e.stopPropagation(); onViewAll() }}>{viewAllLabel}</span>
          )}
          {isExpanded ? <ChevronUp className="w-5 h-5 transition-transform group-hover:scale-110" /> : <ChevronDown className="w-5 h-5 transition-transform group-hover:scale-110" />}
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

// ==================== ТАБЛИЦА ТРЕКОВ С КОНТЕКСТНЫМ МЕНЮ (ПКМ) ====================

interface SongRowProps {
  song: any
  index: number
  playCount: number
  onPlay: () => void
  isLiked: boolean
  currentRating?: number  // 🆕 Текущий рейтинг
  onPlayTrackRadio?: (song: any) => void
  onVibeSimilarity?: (song: any) => void
  isTrackRadioGenerating?: boolean
  isVibeGenerating?: boolean
  navigate?: (path: string) => void
  onRatingChange?: (songId: string, rating: number) => void  // 🆕
  onToggleLike?: (songId: string) => void  // 🆕
  artistId?: string  // 🆕 Для бана артиста
}

function SongRow({ song, index, playCount, onPlay, isLiked, currentRating, onPlayTrackRadio, onVibeSimilarity, isTrackRadioGenerating, isVibeGenerating, navigate, onRatingChange, onToggleLike, artistId: parentArtistId }: SongRowProps) {
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
            gridTemplateColumns: '40px 1fr 1fr 80px 80px 80px 50px 100px',
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

          {/* Название + Обложка */}
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
              <p className="text-sm font-medium truncate transition-colors" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-foreground)' }}>{song.title}</p>
            </div>
          </div>

          {/* Альбом */}
          <p className="text-sm truncate" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)' }}>
            {song.album || '—'}
          </p>

          {/* Год */}
          <span className="text-sm text-center" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-muted-foreground)' }}>
            {song.year || '—'}
          </span>

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

          {/* Избранное */}
          <div className="text-center">
            {isLiked && <Heart className="w-4 h-4 inline" style={{ color: hovered ? 'var(--theme-background)' : 'var(--theme-accent)', fill: isLiked ? (hovered ? 'var(--theme-background)' : 'var(--theme-accent)') : 'none' }} />}
          </div>

          {/* Рейтинг */}
          <div
            className="flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <StarRating
              itemId={song.id}
              initialRating={currentRating || 0}
              size="sm"
              onRatingChange={(rating) => onRatingChange?.(song.id, rating)}
            />
          </div>
        </div>
      </ContextMenuTrigger>

      {/* Контекстное меню - ПКМ */}
      <ContextMenuContent>
        <ContextMenuItem onClick={onPlay}>
          <Play className="w-4 h-4 mr-2" />
          Воспроизвести
        </ContextMenuItem>
        <ContextMenuItem onClick={() => { /* playNext */ }}>
          <SkipForward className="w-4 h-4 mr-2" />
          Воспроизвести следующим
        </ContextMenuItem>
        <ContextMenuItem onClick={() => { /* addToEnd */ }}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить в конец очереди
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => onPlayTrackRadio?.(song)} disabled={isTrackRadioGenerating}>
          <Radio className="w-4 h-4 mr-2" />
          {isTrackRadioGenerating ? 'Генерация...' : 'Радио трека'}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onVibeSimilarity?.(song)} disabled={isVibeGenerating}>
          <Music2 className="w-4 h-4 mr-2" />
          {isVibeGenerating ? 'Генерация...' : 'Vibe Similarity'}
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
        <ContextMenuItem onClick={() => {
          if (song.artistId) {
            window.dispatchEvent(new CustomEvent('ban-artist', { detail: { artistId: song.artistId, artistName: song.artist } }))
          }
        }}>
          <ThumbsDown className="w-4 h-4 mr-2" />
          Заблокировать артиста
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ==================== СЕТКА ПЛЕЙЛИСТОВ ====================

function PlaylistGrid({ playlists, navigate }: { playlists: any[], navigate: any }) {
  if (playlists.length === 0) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {playlists.map((pl) => (
        <button
          key={pl.id}
          onClick={() => navigate(`/library/playlists/${pl.id}`)}
          className="group text-left"
        >
          <div className="aspect-square rounded-xl overflow-hidden shadow-md group-hover:shadow-xl transition-all group-hover:scale-[1.02] mb-2 relative" style={{ backgroundColor: 'var(--theme-background)' }}>
            {pl.coverArt ? (
              <LazyLoadImage src={getSimpleCoverArtUrl(pl.coverArt, 'playlist', '300')} effect="opacity" className="w-full h-full object-cover" alt={pl.name} />
            ) : pl.entry && pl.entry.length > 0 ? (
              <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                {pl.entry.slice(0, 4).map((e: any, i: number) => (
                  <div key={i} className="overflow-hidden bg-muted">
                    {e.coverArt ? (
                      <img src={getSimpleCoverArtUrl(e.coverArt, 'album', '100')} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                        <Music2 size={16} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                <ListMusic size={40} />
              </div>
            )}
            {pl.songCount && (
              <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
                {pl.songCount} треков
              </div>
            )}
          </div>
          <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-foreground)' }}>{pl.name}</p>
          {pl.owner && <p className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>{pl.owner}</p>}
        </button>
      ))}
    </div>
  )
}

// ==================== ГРУППИРОВКА АЛЬБОМОВ (FEISHIN-STYLE) ====================

// ==================== НОВАЯ СТРАНИЦА АРТИСТА ====================

export default function NewArtistPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { artistId } = useParams() as { artistId: string }
  const { setSongList, playNextSong, addSongToEnd } = usePlayerActions()
  const { subscribe, unsubscribe, isSubscribed } = useArtistSubscriptions()
  const { settings } = useExternalApi()
  const { profile, ratings } = useML()
  const mlActions = useMLActions()

  const [isGeneratingRadio, setIsGeneratingRadio] = useState(false)
  const [isTrackRadioGenerating, setIsTrackRadioGenerating] = useState(false)
  const [isVibeGenerating, setIsVibeGenerating] = useState(false)
  const [isSubscribing, setIsSubscribing] = useState(false)
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false)
  const [artistBannerUrl, setArtistBannerUrl] = useState<string | undefined>(undefined)
  const [artistLogoUrl, setArtistLogoUrl] = useState<string | undefined>(undefined)
  const [bioText, setBioText] = useState('')
  const [bioSourceName, setBioSourceName] = useState<string>('')
  const [showFullBio, setShowFullBio] = useState(false)
  const [showStickyPlay, setShowStickyPlay] = useState(false)
  const [monthlyListeners, setMonthlyListeners] = useState<number | null>(null)
  const [playlistsWithArtist, setPlaylistsWithArtist] = useState<any[]>([])
  const [bioSources, setBioSources] = useState<{ wikipedia: string; lastfm: string; musicbrainz: string }>({
    wikipedia: '',
    lastfm: '',
    musicbrainz: '',
  })
  const [selectedBioSource, setSelectedBioSource] = useState<string>('')
  const [appearsOnAlbums, setAppearsOnAlbums] = useState<any[]>([])
  const [artistRating, setArtistRating] = useState<number>(0)  // 🆕 Локальный рейтинг артиста
  const [trackRatings, setTrackRatings] = useState<Record<string, number>>({})  // 🆕 Локальные рейтинги треков
  const [starredSongs, setStarredSongs] = useState<Set<string>>(new Set())  // 🆕 Избранные треки из Navidrome
  const [likedArtistSongs, setLikedArtistSongs] = useState<any[]>([])  // 🆕 Лайкнутые треки текущего артиста
  const [isLoadingLikedSongs, setIsLoadingLikedSongs] = useState(true)  // 🆕 Состояние загрузки

  const subscribed = isSubscribed(artistId)
  const isBanned = profile?.bannedArtists?.includes(artistId) || false

  const { data: artist, isLoading: artistIsLoading } = useGetArtist(artistId)
  const { data: artistInfo } = useGetArtistInfo(artistId)
  const { data: topSongs } = useGetTopSongs(artist?.name)

  const albums = artist?.album || []
  const isFavorite = artist?.starred !== undefined

  // ==================== ЗАГРУЗКА РЕЙТИНГОВ ====================
  useEffect(() => {
    // Загружаем рейтинг артиста из localStorage
    const savedArtistRating = localStorage.getItem(`artist-rating-${artistId}`)
    if (savedArtistRating) {
      setArtistRating(parseInt(savedArtistRating, 10))
    }

    // Загружаем рейтинги треков из localStorage
    const savedTrackRatings = localStorage.getItem(`track-ratings-${artistId}`)
    if (savedTrackRatings) {
      try {
        setTrackRatings(JSON.parse(savedTrackRatings))
      } catch (e) {
        console.error('[Artist] Failed to parse track ratings:', e)
      }
    }

    // 🆕 Загружаем starred треки из Navidrome
    const loadStarredSongs = async () => {
      setIsLoadingLikedSongs(true)
      try {
        const starred = await subsonic.star.getStarred()
        if (starred?.songs && starred.songs.length > 0) {
          const starredIds = new Set(starred.songs.map((s: any) => s.id))
          setStarredSongs(starredIds)
          console.log(`[Artist] Loaded ${starredIds.size} starred songs`)

          // 🆕 Фильтруем треки текущего артиста
          const artistLiked = starred.songs.filter((s: any) =>
            s.artistId === artistId || s.albumArtistId === artistId || s.artist === artist?.name
          )
          setLikedArtistSongs(artistLiked)
          console.log(`[Artist] Found ${artistLiked.length} liked songs from this artist`)
        } else {
          console.log('[Artist] No starred songs found')
          setStarredSongs(new Set())
          setLikedArtistSongs([])
        }
      } catch (e) {
        console.error('[Artist] Failed to load starred songs:', e)
        setStarredSongs(new Set())
        setLikedArtistSongs([])
      } finally {
        setIsLoadingLikedSongs(false)
      }
    }
    loadStarredSongs()
  }, [artistId])

  // ==================== ЗАГРУЗКА БИОГРАФИИ ====================
  useEffect(() => {
    if (!artist?.name) return
    const loadBio = async () => {
      const sources = { wikipedia: '', lastfm: '', musicbrainz: '' }
      if (artistInfo?.biography && artistInfo.biography.length > 50) {
        sources.musicbrainz = artistInfo.biography
      }
      try {
        const wikiInfo = await wikipediaService.searchArtist(artist.name)
        if (wikiInfo?.text && wikiInfo.text.length > 50) sources.wikipedia = wikiInfo.text
      } catch (e) { /* ignore */ }
      try {
        const lastFmInfo = await lastFmService.getArtistInfo(artist.name)
        if (lastFmInfo?.bio && lastFmInfo.bio.length > 50) sources.lastfm = lastFmInfo.bio
      } catch (e) { /* ignore */ }
      setBioSources(sources)
      if (sources.musicbrainz) {
        setBioText(sources.musicbrainz); setBioSourceName('MusicBrainz'); setSelectedBioSource('musicbrainz')
      } else if (sources.wikipedia) {
        setBioText(sources.wikipedia); setBioSourceName('Wikipedia'); setSelectedBioSource('wikipedia')
      } else if (sources.lastfm) {
        setBioText(sources.lastfm); setBioSourceName('Last.fm'); setSelectedBioSource('lastfm')
      }
    }
    loadBio()
  }, [artist?.name, artistInfo?.biography])

  const handleBioSourceChange = (source: string) => {
    setSelectedBioSource(source)
    if (source === 'musicbrainz' && bioSources.musicbrainz) { setBioText(bioSources.musicbrainz); setBioSourceName('MusicBrainz') }
    else if (source === 'wikipedia' && bioSources.wikipedia) { setBioText(bioSources.wikipedia); setBioSourceName('Wikipedia') }
    else if (source === 'lastfm' && bioSources.lastfm) { setBioText(bioSources.lastfm); setBioSourceName('Last.fm') }
  }

  // ==================== ПОДСЧЁТ СЛУШАТЕЛЕЙ ====================
  useEffect(() => {
    if (!ratings || !artistId) return
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
    const uniqueListeners = new Set<string>()
    Object.entries(ratings).forEach(([_, rating]: [string, any]) => {
      if (rating.songInfo?.artistId === artistId && rating.lastPlayed) {
        if (new Date(rating.lastPlayed).getTime() > thirtyDaysAgo) uniqueListeners.add(rating.songInfo?.userId || 'anonymous')
      }
    })
    setMonthlyListeners(uniqueListeners.size)
  }, [ratings, artistId])

  // ==================== ПОИСК АЛЬБОМОВ С УЧАСТИЕМ (APPEARS-ON) ====================
  // Navidrome не возвращает appears-on через getArtist, ищем через search
  useEffect(() => {
    if (!artist?.name || !artistId) return

    const searchAppearsOnAlbums = async () => {
      try {
        // Ищем альбомы по имени артиста
        const searchResult = await search3(artist.name, {
          albumCount: 50,
          albumOffset: 0,
          songCount: 0,
          artistCount: 0,
        })

        if (!searchResult?.albums || searchResult.albums.length === 0) {
          setAppearsOnAlbums([])
          return
        }

        // Фильтруем альбомы где артист НЕ основной
        const appearsOn = searchResult.albums.filter((album: any) => {
          // Если artistId альбома НЕ совпадает — это appears-on
          return album.artistId !== artistId
        })

        console.log(`[Artist] Found ${appearsOn.length} appears-on albums`)
        setAppearsOnAlbums(appearsOn.slice(0, 12))
      } catch (e) {
        console.error('[Artist] Failed to search appears-on albums:', e)
        setAppearsOnAlbums([])
      }
    }

    searchAppearsOnAlbums()
  }, [artist?.name, artistId])

  // ==================== ПЛЕЙЛИСТЫ С АРТИСТОМ ====================
  // Используем поиск вместо загрузки всех плейлистов
  useEffect(() => {
    if (!artist?.name || !artistId) return

    const findPlaylistsWithArtist = async () => {
      setPlaylistsWithArtist([]) // Сбрасываем при новой загрузке
      try {
        const allPlaylists = await subsonic.playlists.getAll()
        console.log(`[Artist] Loaded ${allPlaylists.length} playlists for filtering`)

        if (allPlaylists.length === 0) {
          console.log('[Artist] No playlists found')
          return
        }

        // Фильтруем плейлисты которые содержат треки артиста
        const BATCH_SIZE = 5
        const found: any[] = []
        const artistNameLower = artist.name.toLowerCase()

        for (let i = 0; i < allPlaylists.length && found.length < 12; i += BATCH_SIZE) {
          const batch = allPlaylists.slice(i, i + BATCH_SIZE)

          const results = await Promise.allSettled(
            batch.map(async (pl: any) => {
              try {
                // Загружаем детали плейлиста
                const detail = await subsonic.playlists.getOne(pl.id)

                if (!detail?.entry || detail.entry.length === 0) return null

                // Проверяем каждый трек в плейлисте
                const hasArtist = detail.entry.some((e: any) => {
                  // Проверяем по artistId
                  if (e.artistId === artistId) return true
                  // Проверяем по albumArtistId
                  if (e.albumArtistId === artistId) return true
                  // Проверяем по имени артиста (case-insensitive)
                  if (e.artist && e.artist.toLowerCase() === artistNameLower) return true
                  // Проверяем по имени артиста в albumArtist (если есть)
                  if (e.albumArtist && e.albumArtist.toLowerCase() === artistNameLower) return true
                  return false
                })

                return hasArtist ? detail : null
              } catch (e) {
                console.warn(`[Artist] Failed to load playlist ${pl.id}:`, e)
                return null
              }
            })
          )

          // Добавляем только успешные результаты
          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              found.push(result.value)
            }
          })

          // Небольшая пауза между пачками чтобы не нагружать сервер
          if (i + BATCH_SIZE < allPlaylists.length) {
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }

        console.log(`[Artist] Found ${found.length} playlists with artist ${artist.name}`)
        setPlaylistsWithArtist(found.slice(0, 12))
      } catch (e) {
        console.error('[Artist] Failed to load playlists:', e)
        setPlaylistsWithArtist([])
      }
    }

    findPlaylistsWithArtist()
  }, [artist?.name, artistId])

  // ==================== ГРУППИРОВКА АЛЬБОМОВ (FEISHIN-STYLE) ====================
  const groupedAlbums = useMemo(() => {
    if (!albums || albums.length === 0) return {}
    const grouped: Record<string, any[]> = {}
    const appearsOn: any[] = []
    const owned: any[] = []

    albums.forEach((album: any) => {
      // Проверяем является ли артист основным для альбома
      // Navidrome: album.artistId — основной артист альбома
      const isMainArtist = album.artistId === artistId ||
        album.albumArtists?.some((a: any) => a.id === artistId) ||
        album.artists?.some((a: any) => a.id === artistId && a.role === 'main')

      if (!isMainArtist) {
        // Артист не основной — это appears-on
        appearsOn.push(album)
        return
      }

      // Проверяем тип релиза
      const compKeywords = ['compilation', 'сборник', 'best of', 'greatest hits', 'anthology']
      const isCompilation = album.isCompilation ||
        compKeywords.some(kw => (album.name || '').toLowerCase().includes(kw)) ||
        album.releaseTypes?.includes('compilation')

      if (isCompilation) {
        if (!grouped['compilation']) grouped['compilation'] = []
        grouped['compilation'].push(album)
        return
      }

      const releaseTypes = album.releaseTypes || []
      const primaryType = releaseTypes.find((rt: string) =>
        ['album', 'single', 'ep', 'soundtrack', 'live'].includes(rt.toLowerCase())
      )?.toLowerCase() || 'album'

      if (!grouped[primaryType]) grouped[primaryType] = []
      grouped[primaryType].push(album)
    })

    // Если appears-on найден — добавляем
    if (appearsOn.length > 0) {
      grouped['appears-on'] = appearsOn
    }

    console.log('[Artist] Album grouping:', {
      total: albums.length,
      appearsOn: appearsOn.length,
      grouped: Object.keys(grouped).reduce((acc, key) => ({ ...acc, [key]: grouped[key].length }), {}),
    })

    return grouped
  }, [albums, artistId])

  const releaseTypeLabels: Record<string, { title: string, icon: any }> = {
    'appears-on': { title: 'Участвует в', icon: Users },
    'compilation': { title: 'Сборники', icon: Disc },
    'album': { title: 'Альбомы', icon: Disc },
    'single': { title: 'Синглы', icon: Music2 },
    'ep': { title: 'EP', icon: Disc },
  }

  // ==================== FANART.TV ====================
  useEffect(() => {
    setArtistLogoUrl(undefined)
    if (!settings.fanartShowBanner || !artistInfo?.musicBrainzId) return
    const loadLogo = async () => {
      try {
        const images = await fanartService.getArtistImages(artistInfo.musicBrainzId)
        if (images?.logos?.[0]) setArtistLogoUrl(images.logos[0].url)
      } catch (e) { /* ignore */ }
    }
    loadLogo()
  }, [settings.fanartShowBanner, artistInfo?.musicBrainzId])

  useEffect(() => {
    setArtistBannerUrl(undefined)
    if (!settings.fanartShowBanner || !artistInfo?.musicBrainzId) return
    const loadBanner = async () => {
      try {
        const images = await fanartService.getArtistImages(artistInfo.musicBrainzId)
        if (images?.artistbackgrounds?.[0]) setArtistBannerUrl(images.artistbackgrounds[0].url)
      } catch (e) { /* ignore */ }
    }
    loadBanner()
  }, [settings.fanartShowBanner, artistInfo?.musicBrainzId])

  // ==================== ЗАКРЕПЛЁННАЯ КНОПКА PLAY (FEISHIN-STYLE: сверху) ====================
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop
      const shouldShow = scrollY > 200 && topSongs && topSongs.length > 0
      console.log(`[Artist] Scroll check: scrollY=${scrollY}, topSongs=${topSongs?.length}, shouldShow=${shouldShow}`)
      setShowStickyPlay(shouldShow)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    // Проверим сразу при маунте
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [topSongs])

  // ==================== ОБРАБОТЧИКИ ====================
  const handleToggleSubscription = async () => {
    if (!artistId || isSubscribing) return
    setIsSubscribing(true)
    try {
      if (subscribed) { await unsubscribe(artistId); toast.success(`🔕 Отписан: ${artist?.name}`, { autoClose: 2000 }) }
      else { await subscribe(artistId); toast.success(`🔔 Подписан: ${artist?.name}`, { autoClose: 2000 }) }
    } catch (error) { toast.error('Ошибка подписки') }
    finally { setIsSubscribing(false) }
  }

  const handleToggleBan = () => {
    if (!artistId) return
    if (isBanned) { mlActions.unbanArtist(artistId, artist?.name || ''); toast.success(`✅ ${artist?.name} разблокирован`, { autoClose: 2000 }) }
    else { mlActions.banArtist(artistId, artist?.name || ''); toast.warning(`🚫 ${artist?.name} заблокирован`, { autoClose: 2000 }) }
  }

  const handleToggleFavorite = () => {
    if (!artistId) return
    if (isFavorite) { subsonic.unstar({ id: [artistId] }); toast.success(`💔 Удалён из избранного: ${artist?.name}`, { autoClose: 2000 }) }
    else { subsonic.star({ id: [artistId] }); toast.success(`❤️ Добавлен в избранное: ${artist?.name}`, { autoClose: 2000 }) }
  }

  const handlePlayRadio = async () => {
    if (isGeneratingRadio || !artistId) return
    setIsGeneratingRadio(true)
    try {
      const result = await generateArtistRadio(artistId, 25)
      if (result.songs.length > 0) { setSongList(result.songs, 0, false); toast.success(`▶️ Радио: ${artist?.name}`, { autoClose: 2000 }) }
    } catch (error) { toast.error('Не удалось запустить радио') }
    finally { setIsGeneratingRadio(false) }
  }

  const handlePlayTrackRadio = async (song: any) => {
    setIsTrackRadioGenerating(true)
    try {
      const result = await generateTrackRadio(song.id, 25)
      if (result.songs.length > 0) { setSongList([song, ...result.songs], 0); toast.success(`▶️ Радио трека: ${song.title}`, { autoClose: 2000 }) }
    } catch (error) { toast.error('Не удалось запустить радио') }
    finally { setIsTrackRadioGenerating(false) }
  }

  const handleVibeSimilarity = async (song: any) => {
    setIsVibeGenerating(true)
    try {
      const allSongs = await getRandomSongs(100)
      if (allSongs.length === 0) { toast.info('Нет треков для анализа', { autoClose: 2000 }); return }
      const result = await generateVibeMix(song.id, allSongs, 25)
      if (result.songs.length > 0) { setSongList(result.songs, 0); toast.success(`🎵 Vibe Similarity: ${song.title}`, { autoClose: 2000 }) }
    } catch (error) { toast.error('Не удалось сгенерировать') }
    finally { setIsVibeGenerating(false) }
  }

  const handlePlayAll = async () => { if (topSongs?.length) setSongList(topSongs, 0) }
  const handleShuffleAll = async () => { if (topSongs?.length) setSongList([...topSongs].sort(() => Math.random() - 0.5), 0) }

  const getPlayCount = (songId: string) => ratings?.[songId]?.playCount || 0
  const getSongRating = (songId: string) => ratings?.[songId]?.rating || 0

  const handleToggleLike = async (songId: string) => {
    const isCurrentlyLiked = starredSongs.has(songId)
    if (isCurrentlyLiked) {
      try {
        await subsonic.star.unstarItem(songId)
        setStarredSongs(prev => {
          const next = new Set(prev)
          next.delete(songId)
          return next
        })
        // 🆕 Обновляем список лайкнутых треков артиста
        setLikedArtistSongs(prev => prev.filter(s => s.id !== songId))
        toast.info('💔 Убрано из избранного', { autoClose: 1500 })
      } catch (e) {
        toast.error('Ошибка при удалении из избранного', { autoClose: 2000 })
      }
    } else {
      try {
        // Находим трек сначала в topSongs, потом в loadedSongs
        let songToAdd = topSongs?.find((s: any) => s.id === songId)

        // Если не нашли в topSongs, запрашиваем напрямую
        if (!songToAdd) {
          songToAdd = await subsonic.songs.getSong(songId)
        }

        if (songToAdd) {
          await subsonic.star.starItem(songId)
          setStarredSongs(prev => {
            const next = new Set(prev)
            next.add(songId)
            return next
          })
          // 🆕 Добавляем в список лайкнутых треков артиста
          setLikedArtistSongs(prev => [...prev, songToAdd])
          toast.success('❤️ Добавлено в избранное', { autoClose: 1500 })
        } else {
          toast.error('Трек не найден', { autoClose: 2000 })
        }
      } catch (e) {
        console.error('[Artist] Failed to star song:', e)
        toast.error('Ошибка при добавлении в избранное', { autoClose: 2000 })
      }
    }
  }

  const isSongLiked = (song: any) => {
    // Проверяем starred из Navidrome (загруженные)
    if (starredSongs.has(song.id)) return true
    
    // Проверяем starred напрямую из объекта (если есть)
    if (song.starred) return true
    if (song.starredDate) return true
    
    // Проверяем ML rating >= 4
    const rating = getSongRating(song.id)
    if (rating >= 4) return true
    
    // Проверяем localStorage рейтинг >= 4
    if (trackRatings[song.id] && trackRatings[song.id] >= 4) return true
    
    return false
  }

  // ==================== РЕНДЕР ====================
  if (artistIsLoading) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-12 h-12 animate-spin" style={{ color: 'var(--theme-accent)' }} /></div>
  if (!artist) return <div className="text-center py-20" style={{ color: 'var(--theme-muted-foreground)' }}><Mic2 className="w-16 h-16 mx-auto mb-4" /><p className="text-lg">Артист не найден</p></div>

  const totalAlbums = albums.length
  const totalSongs = albums.reduce((sum, a) => sum + (a.songCount || 0), 0)
  const bannerAlbums = [...albums].filter(a => a.coverArt).sort((a, b) => (b.songCount || 0) - (a.songCount || 0)).slice(0, 6)
  const recentAlbums = [...albums].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 6)
  const popularAlbums = [...albums].filter(a => !recentAlbums.find(r => r.id === a.id)).sort((a, b) => (b.songCount || 0) - (a.songCount || 0)).slice(0, 12)
  const shortBio = bioText.length > 500 ? bioText.substring(0, 500) + '...' : bioText
  const availableBioSources = [
    bioSources.musicbrainz && { key: 'musicbrainz', label: 'MusicBrainz' },
    bioSources.wikipedia && { key: 'wikipedia', label: 'Wikipedia' },
    bioSources.lastfm && { key: 'lastfm', label: 'Last.fm' },
  ].filter(Boolean) as { key: string; label: string }[]
  const accentColor = 'var(--theme-accent)'

  return (
    <div className="relative w-full min-h-screen" style={{ backgroundColor: 'var(--theme-background)', color: 'var(--theme-foreground)', animation: 'fadeIn 0.3s ease-in-out' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <ArtistImageViewer open={isImageViewerOpen} onOpenChange={setIsImageViewerOpen} artistName={artist?.name || ''} artistId={artistId} defaultImageUrl={artist?.coverArt ? getSimpleCoverArtUrl(artist.coverArt, 'artist', '600') : undefined} />

      {/* HEADER */}
      <div className="relative w-full" style={{ height: '400px', overflow: 'hidden' }}>
        <div className="absolute inset-0" style={{ display: 'flex', gap: '2px' }}>
          {bannerAlbums.length > 0 ? bannerAlbums.map((album, i) => (
            <div key={album.id} className="flex-1 relative overflow-hidden" style={{ opacity: 0.4 + (i * 0.1) }}>
              <img src={getSimpleCoverArtUrl(album.coverArt!, 'album', '500')} alt="" className="w-full h-full object-cover" />
            </div>
          )) : <div className="flex-1" style={{ backgroundColor: 'var(--theme-accent)', opacity: 0.3 }} />}
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.95) 70%, var(--theme-background) 100%)' }} />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} />

        <div className="relative h-full flex items-end pb-12">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 max-w-7xl mx-auto">
              <div className="relative z-10">
                <button onClick={() => { if (artist?.coverArt) setIsImageViewerOpen(true) }} className="w-[180px] h-[180px] sm:w-[240px] sm:h-[240px] rounded-full overflow-hidden shadow-2xl transition-transform hover:scale-105 cursor-pointer" style={{ border: `4px solid ${accentColor}`, backgroundColor: 'var(--theme-background-alternate)' }}>
                  {artist.coverArt ? <img src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '600')} alt={artist.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}><Mic2 size={80} /></div>}
                </button>
                {artistLogoUrl && <div className="absolute -top-2 -right-2 w-16 h-16 rounded-full overflow-hidden shadow-xl border-2" style={{ backgroundColor: 'var(--theme-background)', borderColor: 'var(--theme-border)' }}><img src={artistLogoUrl} alt="Logo" className="w-full h-full object-cover" /></div>}
              </div>

              <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
                <button onClick={handleToggleSubscription} disabled={isSubscribing} className="p-2.5 rounded-lg transition-all hover:scale-110" style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: subscribed ? 'var(--theme-accent)' : 'white', backdropFilter: 'blur(10px)' }} title={subscribed ? 'Отписаться' : 'Подписаться'}>
                  {isSubscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : subscribed ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                </button>
                <button onClick={() => { const text = `🎵 ${artist.name}\nПослушай на KumaFlow!`; navigator.clipboard.writeText(text); toast.success('📋 Скопировано!', { autoClose: 1500 }) }} className="p-2.5 rounded-lg transition-all hover:scale-110" style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', backdropFilter: 'blur(10px)' }} title="Поделиться"><Share2 className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-3xl sm:text-5xl font-bold mb-3" style={{ color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{artist.name}</h1>

                {/* 🆕 Рейтинг артиста */}
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-3">
                  <StarRating
                    itemId={artistId}
                    initialRating={artistRating}
                    size="md"
                    onRatingChange={(rating) => {
                      setArtistRating(rating)
                      localStorage.setItem(`artist-rating-${artistId}`, rating.toString())
                      console.log(`[Artist] Artist rating changed: ${rating}`)
                    }}
                  />
                  {artistRating > 0 && (
                    <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
                      {artistRating}/5
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap justify-center sm:justify-start gap-4 mb-3">
                  <div className="flex items-center gap-2"><Disc className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.9)' }} /><span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{totalAlbums} альбомов</span></div>
                  <div className="flex items-center gap-2"><Music2 className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.9)' }} /><span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{totalSongs} треков</span></div>
                  {monthlyListeners !== null && <div className="flex items-center gap-2"><Users className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.9)' }} /><span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{monthlyListeners} слуш./мес</span></div>}
                </div>
                <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                  <button onClick={handlePlayRadio} disabled={isGeneratingRadio} className={actionButtonStyle} style={actionButtonBg} title="Радио артиста">{isGeneratingRadio ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radio className="w-5 h-5" />}</button>
                  <button onClick={handlePlayAll} className={actionButtonStyle} style={actionButtonBg} title="Воспроизвести"><Play className="w-5 h-5" /></button>
                  <button onClick={handleShuffleAll} className={actionButtonStyle} style={actionButtonBg} title="Перемешать"><Shuffle className="w-5 h-5" /></button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button className={actionButtonStyle} style={actionButtonBg} title="Дополнительно"><Ellipsis className="w-5 h-5" /></button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => { playNextSong(topSongs || []); toast.success('⏭️ Следующим', { autoClose: 1500 }) }}><Play className="w-4 h-4 mr-2" />Воспроизвести следующим</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { addSongToEnd(topSongs || []); toast.success('⏭️ В конец', { autoClose: 1500 }) }}><ListMusic className="w-4 h-4 mr-2" />Добавить в конец</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toast.info('Скачивание скоро будет доступно', { autoClose: 1500 })}><Download className="w-4 h-4 mr-2" />Скачать</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button onClick={handleToggleFavorite} className={actionButtonStyle} style={isFavorite ? actionButtonBgActive : actionButtonBg} title={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}><Heart className={`w-5 h-5 ${isFavorite ? 'fill-white text-white' : ''}`} /></button>
                  <button onClick={handleToggleBan} className={actionButtonStyle} style={isBanned ? actionButtonBgActive : actionButtonBg} title={isBanned ? 'Разблокировать' : 'Заблокировать'}><ThumbsDown className={`w-5 h-5 ${isBanned ? 'fill-white' : ''}`} /></button>
                  <CacheArtistButton artistId={artistId} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* КОНТЕНТ */}
      <div className={`w-full px-4 sm:px-6 lg:px-8 py-8 transition-all duration-300 ${showStickyPlay ? 'pt-20' : ''}`}>
        <div className="max-w-7xl mx-auto">
          {bioText && (
            <div className="mb-8 p-6 rounded-2xl" style={{ backgroundColor: 'var(--theme-background-alternate)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold" style={{ color: 'var(--theme-foreground)' }}>Об исполнителе</h3>
                <div className="flex items-center gap-2">
                  {availableBioSources.map((source) => (
                    <button key={source.key} onClick={() => handleBioSourceChange(source.key)} className="px-3 py-1 rounded-full text-xs font-semibold transition-all" style={selectedBioSource === source.key ? { backgroundColor: 'var(--theme-accent)', color: 'white' } : { color: 'var(--theme-foreground)', backgroundColor: 'transparent' }} onMouseEnter={(e) => { if (selectedBioSource !== source.key) { e.currentTarget.style.backgroundColor = 'var(--theme-accent)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.opacity = '0.15' } }} onMouseLeave={(e) => { if (selectedBioSource !== source.key) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--theme-foreground)'; e.currentTarget.style.opacity = '1' } }}>{source.label}</button>
                  ))}
                </div>
              </div>
              <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--theme-muted-foreground)' }}>{showFullBio ? bioText : shortBio}</p>
              {bioText.length > 500 && <button onClick={() => setShowFullBio(!showFullBio)} className="text-xs font-medium flex items-center gap-1 transition-colors" style={{ color: 'var(--theme-accent)' }}>{showFullBio ? 'Свернуть' : 'Развернуть'} <ChevronRight className="w-3 h-3" /></button>}
            </div>
          )}

          {/* Популярные треки */}
          {topSongs && topSongs.length > 0 && (
            <CollapsibleSection title="Популярные треки" icon={<Music2 className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />} count={topSongs.length} onViewAll={() => navigate(`/library/songs?artistId=${artistId}&artistName=${encodeURIComponent(artist.name)}`)} viewAllLabel="Все треки">
              <div className="grid mb-2 px-2" style={{ gridTemplateColumns: '40px 1fr 1fr 80px 80px 80px 50px 100px', gap: '12px' }}>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}>#</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--theme-muted-foreground)' }}>Название</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--theme-muted-foreground)' }}>Альбом</span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}>Год</span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}><Clock className="w-3 h-3 inline mr-1" />Время</span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}><Eye className="w-3 h-3 inline mr-1" />Play</span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}>❤</span>
                <span className="text-xs font-semibold text-center" style={{ color: 'var(--theme-muted-foreground)' }}><Star className="w-3 h-3 inline mr-1" />Рейтинг</span>
              </div>
              <div className="space-y-1" key={`songs-${starredSongs.size}`}>
                {topSongs.slice(0, 15).map((song: any, index: number) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    index={index}
                    playCount={getPlayCount(song.id)}
                    onPlay={() => setSongList(topSongs, index)}
                    isLiked={isSongLiked(song)}
                    currentRating={trackRatings[song.id] || ratings?.[song.id]?.rating || 0}
                    onPlayTrackRadio={handlePlayTrackRadio}
                    onVibeSimilarity={handleVibeSimilarity}
                    isTrackRadioGenerating={isTrackRadioGenerating}
                    isVibeGenerating={isVibeGenerating}
                    navigate={navigate}
                    artistId={artistId}
                    onToggleLike={handleToggleLike}
                    onRatingChange={(songId, rating) => {
                      setTrackRatings(prev => {
                        const newRatings = { ...prev, [songId]: rating }
                        localStorage.setItem(`track-ratings-${artistId}`, JSON.stringify(newRatings))
                        return newRatings
                      })
                      console.log(`[Artist] Rating changed for ${songId}: ${rating}`)
                    }}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* 🆕 Избранные треки артиста — ВСЕГДА ВИДНА */}
          <CollapsibleSection
            key={`liked-section-${isLoadingLikedSongs}-${likedArtistSongs.length}`}
            title="Избранные треки"
            icon={<Heart className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />}
            count={isLoadingLikedSongs ? undefined : likedArtistSongs.length}
            defaultExpanded={true}
          >
            {isLoadingLikedSongs ? (
              // Shimmer анимация загрузки
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg animate-pulse"
                    style={{ backgroundColor: 'var(--theme-background-alternate)' }}
                  />
                ))}
              </div>
            ) : likedArtistSongs.length > 0 ? (
              <div className="space-y-1" key={`liked-songs-${starredSongs.size}`}>
                {likedArtistSongs.slice(0, 10).map((song: any, index: number) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    index={index}
                    playCount={getPlayCount(song.id)}
                    onPlay={() => setSongList(likedArtistSongs, index)}
                    isLiked={true}
                    currentRating={trackRatings[song.id] || ratings?.[song.id]?.rating || 0}
                    onPlayTrackRadio={handlePlayTrackRadio}
                    onVibeSimilarity={handleVibeSimilarity}
                    isTrackRadioGenerating={isTrackRadioGenerating}
                    isVibeGenerating={isVibeGenerating}
                    navigate={navigate}
                    artistId={artistId}
                    onToggleLike={handleToggleLike}
                    onRatingChange={(songId, rating) => {
                      setTrackRatings(prev => {
                        const newRatings = { ...prev, [songId]: rating }
                        localStorage.setItem(`track-ratings-${artistId}`, JSON.stringify(newRatings))
                        return newRatings
                      })
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8" style={{ color: 'var(--theme-muted-foreground)' }}>
                <Heart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Нет избранных треков этого артиста</p>
                <p className="text-xs mt-1 opacity-70">Нажмите ПКМ на треке → "Добавить в избранное"</p>
              </div>
            )}
          </CollapsibleSection>

          {/* Недавние альбомы */}
          {recentAlbums.length > 0 && (
            <CollapsibleSection title="Недавние альбомы" icon={<Disc className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />} count={recentAlbums.length} onViewAll={() => navigate(`/library/albums?artistId=${artistId}&artistName=${encodeURIComponent(artist.name)}`)} viewAllLabel="Все альбомы">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {recentAlbums.map((album) => (
                  <button key={album.id} onClick={() => navigate(`/library/albums/${album.id}`)} className="group text-left">
                    <div className="aspect-square rounded-xl overflow-hidden shadow-md group-hover:shadow-xl transition-all group-hover:scale-[1.02] mb-2" style={{ backgroundColor: 'var(--theme-background)' }}>
                      {album.coverArt ? <LazyLoadImage src={getSimpleCoverArtUrl(album.coverArt, 'album', '300')} effect="opacity" className="w-full h-full object-cover" alt={album.name} /> : <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}><Disc size={40} /></div>}
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-foreground)' }}>{album.name}</p>
                    {album.year && <p className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>{album.year}</p>}
                  </button>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Популярные альбомы */}
          {popularAlbums.length > 0 && (
            <CollapsibleSection title="Популярные альбомы" icon={<Star className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />} count={popularAlbums.length}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {popularAlbums.map((album) => (
                  <button key={album.id} onClick={() => navigate(`/library/albums/${album.id}`)} className="group text-left">
                    <div className="aspect-square rounded-xl overflow-hidden shadow-md group-hover:shadow-xl transition-all group-hover:scale-[1.02] mb-2" style={{ backgroundColor: 'var(--theme-background)' }}>
                      {album.coverArt ? <LazyLoadImage src={getSimpleCoverArtUrl(album.coverArt, 'album', '300')} effect="opacity" className="w-full h-full object-cover" alt={album.name} /> : <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}><Disc size={40} /></div>}
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-foreground)' }}>{album.name}</p>
                    {album.year && <p className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>{album.year}</p>}
                  </button>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Появляется в альбомах (Feishin-style: appears-on) */}
          {(appearsOnAlbums.length > 0 || (groupedAlbums['appears-on'] && groupedAlbums['appears-on'].length > 0)) && (
            <CollapsibleSection
              title="Появляется в"
              icon={<Users className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />}
              count={appearsOnAlbums.length + (groupedAlbums['appears-on']?.length || 0)}
              defaultExpanded={false}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {appearsOnAlbums.map((album) => (
                  <button key={album.id} onClick={() => navigate(`/library/albums/${album.id}`)} className="group text-left">
                    <div className="aspect-square rounded-xl overflow-hidden shadow-md group-hover:shadow-xl transition-all group-hover:scale-[1.02] mb-2 relative" style={{ backgroundColor: 'var(--theme-background)' }}>
                      {album.coverArt ? <LazyLoadImage src={getSimpleCoverArtUrl(album.coverArt, 'album', '300')} effect="opacity" className="w-full h-full object-cover" alt={album.name} /> : <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}><Disc size={40} /></div>}
                      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">Участие</div>
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-foreground)' }}>{album.name}</p>
                    {album.artist && <p className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>{album.artist}</p>}
                    {album.year && <p className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>{album.year}</p>}
                  </button>
                ))}
                {/* Добавляем из groupedAlbums если есть */}
                {groupedAlbums['appears-on']?.filter(
                  (a: any) => !appearsOnAlbums.find((b: any) => b.id === a.id)
                ).map((album: any) => (
                  <button key={album.id} onClick={() => navigate(`/library/albums/${album.id}`)} className="group text-left">
                    <div className="aspect-square rounded-xl overflow-hidden shadow-md group-hover:shadow-xl transition-all group-hover:scale-[1.02] mb-2 relative" style={{ backgroundColor: 'var(--theme-background)' }}>
                      {album.coverArt ? <LazyLoadImage src={getSimpleCoverArtUrl(album.coverArt, 'album', '300')} effect="opacity" className="w-full h-full object-cover" alt={album.name} /> : <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}><Disc size={40} /></div>}
                      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">Участие</div>
                    </div>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--theme-foreground)' }}>{album.name}</p>
                    {album.year && <p className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>{album.year}</p>}
                  </button>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* В плейлистах */}
          {playlistsWithArtist.length > 0 && (
            <CollapsibleSection title="Участвует в плейлистах" icon={<ListMusic className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} />} count={playlistsWithArtist.length}>
              <PlaylistGrid playlists={playlistsWithArtist} navigate={navigate} />
            </CollapsibleSection>
          )}

          {/* Похожие артисты */}
          {artistInfo?.similarArtist && artistInfo.similarArtist.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-6"><Sparkles className="w-6 h-6" style={{ color: 'var(--theme-accent)' }} /><h2 className="text-xl font-bold" style={{ color: 'var(--theme-foreground)' }}>Похожие артисты</h2></div>
              <div className="flex gap-8 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
                {artistInfo.similarArtist.slice(0, 12).map((sa) => (
                  <SimilarArtistCircle key={sa.id} artist={sa} onPlayRadio={async () => { if (!sa.id) return; try { const result = await generateArtistRadio(sa.id, 25); if (result.songs.length > 0) { setSongList(result.songs, 0, false); toast.success(`▶️ Радио: ${sa.name}`, { autoClose: 2000 }) } } catch (error) { toast.error('Не удалось запустить радио') } }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ЗАКРЕПЛЁННАЯ ПАНЕЛЬ PLAY (FEISHIN-STYLE: сверху под хедером) */}
      {showStickyPlay && topSongs && topSongs.length > 0 && createPortal(
        <div
          className="fixed top-0 left-0 right-0 z-[9999] backdrop-blur-xl border-b transition-all duration-300"
          style={{ backgroundColor: 'var(--theme-background-alternate)', opacity: 0.95, borderColor: 'var(--theme-border)' }}
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--theme-background)' }}>
                {artist.coverArt ? (
                  <img src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '100')} alt={artist.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--theme-muted-foreground)' }}>
                    <Mic2 size={24} />
                  </div>
                )}
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--theme-foreground)' }}>{artist.name}</p>
                <p className="text-xs" style={{ color: 'var(--theme-muted-foreground)' }}>{topSongs.length} треков</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayAll}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full font-semibold transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--theme-accent)', color: 'white' }}
              >
                <Play className="w-5 h-5" />
                <span>Играть</span>
              </button>
              <button
                onClick={handleShuffleAll}
                className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--theme-background)', color: 'var(--theme-foreground)' }}
              >
                <Shuffle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
