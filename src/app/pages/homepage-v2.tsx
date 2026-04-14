/**
 * New Homepage v3.0 — Финальная версия с исправлениями
 * - Адаптивный фон под тему
 * - Все кнопки работают
 * - Радио артистов
 * - Настройки Моей волны
 * - ML рекомендации вместо "AI-сет"
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useML, useMLStore } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { useMLPlaylists } from '@/store/ml-playlists.store'
import { useMLPlaylistsStateActions } from '@/store/ml-playlists-state.store'
import { generateMyWavePlaylist } from '@/service/ml-wave-service'
import { generateCSSGradient } from '@/utils/genreColors'
import { getGenres, getSongsByGenre, getRandomSongs, getStarredArtists } from '@/service/subsonic-api'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { toast } from 'react-toastify'
import { useQuery } from '@tanstack/react-query'
import {
  Play,
  BarChart3,
  Settings,
  Sparkles,
  TrendingUp,
  Heart,
  Zap,
  Disc,
  Mic2,
  ChevronRight,
  ChevronLeft,
  Activity,
  History,
  Star,
  Calendar,
  Music2,
} from 'lucide-react'
import { useThemeStore } from '@/store/theme.store'
import { Theme } from '@/types/themeContext'
import { myWaveDiscoveryTracker } from '@/service/mywave-discoveries'
import { useAppStore } from '@/store/app.store'

// ==================== ХУКИ ====================

function useThemeClasses() {
  const theme = useThemeStore((state) => state.theme)
  const isDark = theme === Theme.Dark

  return {
    isDark,
    // ✅ Исправлен градиент — теперь работает
    bg: isDark ? 'bg-[#121212]' : 'bg-gradient-to-b from-violet-50/50 via-white to-[#F8F9FA]',
    bgGradient: isDark
      ? 'bg-gradient-to-b from-violet-950/30 via-[#121212] to-[#121212]'
      : 'bg-gradient-to-b from-violet-50 via-white to-[#F8F9FA]',
    cardBg: isDark ? 'bg-[#1E1E1E] border-[#2A2A2A]' : 'bg-white border-gray-100',
    cardHover: isDark ? 'hover:bg-[#252525]' : 'hover:bg-gray-50',
    text: {
      primary: isDark ? 'text-white' : 'text-gray-900',
      secondary: isDark ? 'text-gray-400' : 'text-gray-500',
      muted: isDark ? 'text-gray-500' : 'text-gray-400',
    },
    link: isDark ? 'text-violet-400 hover:text-violet-300' : 'text-violet-600 hover:text-violet-700',
    borderDashed: isDark ? 'border-gray-700' : 'border-gray-200',
  }
}

// ==================== КОМПОНЕНТЫ ====================

const CARD_GRADIENTS = {
  myWave: 'from-violet-600 via-purple-500 to-fuchsia-500',
  forYou: 'from-orange-500 to-red-500',
  trends: 'from-blue-500 to-cyan-500',
  favorites: 'from-pink-500 to-rose-500',
  history: 'from-indigo-500 to-purple-500',
  ml: 'from-violet-500 to-indigo-600',
  workout: 'from-emerald-500 to-teal-500',
  relax: 'from-cyan-400 to-blue-500',
  work: 'from-amber-500 to-orange-500',
}

const GRADIENT_ANIMATION = `
  @keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 10px rgba(139, 92, 246, 0.2); }
    50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.4); }
  }
`

interface GenreButtonProps {
  genre: string
  songCount: number
  onClick: () => void
  isGenerating: boolean
}

function GenreButton({ genre, songCount, onClick, isGenerating }: GenreButtonProps) {
  const gradientIndex = genre.length % 8
  const gradients = [
    'from-red-500 via-red-400 to-orange-400',
    'from-pink-500 via-purple-500 to-indigo-500',
    'from-blue-500 via-cyan-500 to-teal-500',
    'from-emerald-500 via-green-500 to-lime-500',
    'from-amber-500 via-orange-500 to-red-500',
    'from-purple-500 via-violet-500 to-purple-600',
    'from-slate-500 via-gray-500 to-zinc-600',
    'from-cyan-500 via-blue-500 to-indigo-600',
  ]

  return (
    <button
      onClick={onClick}
      disabled={isGenerating}
      className="relative rounded-xl overflow-hidden aspect-square shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.05] disabled:opacity-50 disabled:cursor-not-allowed group"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradients[gradientIndex]} transition-transform duration-300 group-hover:scale-110`} />
      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors" />
      <div className="relative p-3 flex flex-col items-center justify-center h-full text-white">
        <span className="text-sm font-bold text-center line-clamp-2 drop-shadow-sm">{genre}</span>
        {songCount > 0 && <span className="text-xs opacity-80 mt-1">{songCount}+</span>}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-all duration-300">
        <Play className="w-8 h-8 text-white drop-shadow-lg fill-white" />
      </div>
    </button>
  )
}

interface QuickAccessCardProps {
  icon: React.ReactNode
  label: string
  subtitle?: string
  route: string
  gradient: string
}

function QuickAccessCard({ icon, label, subtitle, route, gradient }: QuickAccessCardProps) {
  const navigate = useNavigate()
  const t = useThemeClasses()

  return (
    <button
      onClick={() => navigate(route)}
      className={`relative flex items-center gap-4 p-5 rounded-2xl ${t.cardBg} border shadow-sm hover:shadow-xl transition-all duration-300 hover:scale-[1.02] text-left group overflow-hidden ${t.cardHover}`}
    >
      <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} text-white group-hover:scale-110 transition-transform duration-300 shadow-md`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`font-semibold block truncate ${t.text.primary}`}>{label}</span>
        {subtitle && <span className={`text-xs mt-0.5 block ${t.text.secondary}`}>{subtitle}</span>}
      </div>
      <ChevronRight className={`w-5 h-5 group-hover:translate-x-1 transition-all ${t.text.muted}`} />
    </button>
  )
}

interface MLPlaylistCardProps {
  title: string
  description: string
  gradient: string
  icon: React.ReactNode
  tags?: string[]
  onClick: () => void
  onPlay?: () => void  // Опциональная кнопка Play
}

function MLPlaylistCard({ title, description, gradient, icon, tags, onClick, onPlay }: MLPlaylistCardProps) {
  return (
    <div className={`relative rounded-2xl overflow-hidden aspect-square bg-gradient-to-br ${gradient} text-white text-left group`}>
      {/* Основная карточка - клик для открытия */}
      <button
        onClick={onClick}
        className="absolute inset-0 p-5 hover:shadow-2xl transition-all duration-300"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-8 translate-x-8 group-hover:scale-150 transition-transform duration-500" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full blur-xl translate-y-6 -translate-x-6" />
        <div className="relative z-10 mb-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300">
          {icon}
        </div>
        <div className="relative z-10">
          <h3 className="font-bold text-lg mb-1 group-hover:text-xl transition-all duration-300">{title}</h3>
          <p className="text-sm opacity-90 line-clamp-2">{description}</p>
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {tags.slice(0, 2).map((tag, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* Кнопка Play - отдельная */}
      {onPlay && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPlay()
          }}
          className="absolute bottom-4 right-4 z-20 p-3 rounded-full bg-white/30 backdrop-blur-sm opacity-0 group-hover:opacity-100 hover:bg-white/50 transition-all duration-300 translate-y-2 group-hover:translate-y-0"
        >
          <Play className="w-5 h-5 fill-white" />
        </button>
      )}
    </div>
  )
}

/**
 * 🆕 ViralArtistsSection — артисты из истории с лайками
 * Показывает артистов которых пользователь недавно лайкал
 */
function ViralArtistsSection({ onArtistClick }: { onArtistClick: (artistId: string, artistName: string) => void }) {
  const { ratings } = useMLStore()
  const [viralArtists, setViralArtists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const themeClasses = useThemeClasses()

  useEffect(() => {
    let cancelled = false

    const loadViralArtists = async () => {
      // Берём треки с лайками из ratings
      const likedRatings = Object.entries(ratings)
        .filter(([_, rating]) => rating.like === true && rating.songInfo?.artistId)
        .sort((a, b) => new Date(b[1].lastPlayed || 0).getTime() - new Date(a[1].lastPlayed || 0).getTime())
        .slice(0, 15)  // Топ-15 лайкнутых треков

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
            coverArt: artistCoverMap.get(artistId),  // Добавляем coverArt
            likedCount: 0,
            lastLiked: rating.lastPlayed,
          })
        }
        const artist = artistMap.get(artistId)
        artist.likedCount++
      }

      const artists = Array.from(artistMap.values())
        .sort((a, b) => b.likedCount - a.likedCount)
        .slice(0, 12)  // Топ-12 артистов по лайкам

      if (!cancelled) {
        console.log('[ViralArtists] Found', artists.length, 'artists from liked history')
        setViralArtists(artists)
        setLoading(false)
      }
    }

    loadViralArtists()
    return () => { cancelled = true }
  }, [ratings])

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[140px] flex flex-col items-center">
            <div className="w-[120px] h-[120px] rounded-full bg-gray-200 animate-pulse" />
            <div className="mt-3 w-20 h-3 rounded-full bg-gray-200" />
          </div>
        ))}
      </div>
    )
  }

  if (viralArtists.length === 0) {
    return (
      <div className={`text-center py-8 rounded-2xl border border-dashed ${themeClasses.cardBg} ${themeClasses.borderDashed}`}>
        <Mic2 className={`w-10 h-10 mx-auto mb-2 ${themeClasses.text.muted}`} />
        <p className={`text-sm ${themeClasses.text.secondary}`}>
          Лайкайте треки — здесь появятся артисты из вашей истории
        </p>
      </div>
    )
  }

  return (
    <ScrollContainer>
      {viralArtists.map((artist: any) => (
        <ArtistCircle
          key={artist.id}
          artist={artist}
          onClick={() => onArtistClick(artist.id, artist.name)}
        />
      ))}
    </ScrollContainer>
  )
}

/**
 * 🆕 InStyleArtistsSection — все лайкнутые артисты, рандомно при каждом запуске
 */
function InStyleArtistsSection({ 
  artists, 
  isLoading, 
  onArtistClick 
}: { 
  artists: any[]
  isLoading: boolean
  onArtistClick: (artistId: string, artistName: string) => void
}) {
  const [randomizedArtists, setRandomizedArtists] = useState<any[]>([])
  const themeClasses = useThemeClasses()

  // Рандомизируем артисты при каждом монтировании
  useEffect(() => {
    if (artists.length === 0) return
    
    // Перемешиваем массив
    const shuffled = [...artists].sort(() => Math.random() - 0.5)
    setRandomizedArtists(shuffled.slice(0, 15))  // Показываем до 15
  }, [artists])

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[140px] flex flex-col items-center">
            <div className="w-[120px] h-[120px] rounded-full bg-gray-200 animate-pulse" />
            <div className="mt-3 w-20 h-3 rounded-full bg-gray-200" />
          </div>
        ))}
      </div>
    )
  }

  if (randomizedArtists.length === 0) {
    return (
      <div className={`text-center py-8 rounded-2xl border border-dashed ${themeClasses.cardBg} ${themeClasses.borderDashed}`}>
        <Mic2 className={`w-10 h-10 mx-auto mb-2 ${themeClasses.text.muted}`} />
        <p className={`text-sm ${themeClasses.text.secondary}`}>
          Лайкайте треки — здесь появятся любимые артисты
        </p>
      </div>
    )
  }

  return (
    <ScrollContainer>
      {randomizedArtists.map((artist: any) => (
        <ArtistCircle
          key={artist.id}
          artist={artist}
          onClick={() => onArtistClick(artist.id, artist.name)}
        />
      ))}
    </ScrollContainer>
  )
}

interface ArtistCircleProps {
  artist: { id: string; name: string; coverArt?: string; artistImageUrl?: string }
  onClick: () => void
  discoveryInfo?: any
}

function ArtistCircle({ artist, onClick, discoveryInfo }: ArtistCircleProps) {
  // Формируем URL обложки через getSimpleCoverArtUrl
  const coverUrl = artist.coverArt
    ? getSimpleCoverArtUrl(artist.coverArt, 'artist', '300')
    : artist.artistImageUrl

  return (
    <div className="flex-shrink-0 w-[210px] group flex flex-col items-center relative">
      {/* Круглая картинка - клик для радио */}
      <button onClick={onClick} className="w-[200px] h-[200px] rounded-full overflow-hidden shadow-md group-hover:shadow-xl transition-all hover:scale-105 bg-gradient-to-br from-gray-300 to-gray-400 relative">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={artist.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              console.log('[ArtistCircle] Image error for:', artist.name, 'URL:', coverUrl)
              target.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <Mic2 size={32} />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="w-8 h-8 text-white fill-white" />
        </div>
      </button>
      
      {/* Имя артиста - кликабельная ссылка */}
      <div className="mt-3 text-center w-[170px]">
        <Link
          to={`/library/artists/${artist.id}`}
          className="text-sm font-semibold truncate w-full px-1 block transition-colors cursor-pointer"
          style={{ color: 'var(--theme-accent)' }}
          title={artist.name}
          onClick={(e) => e.stopPropagation()}  // Не вызывать радио при клике на имя
        >
          {artist.name}
        </Link>
        {discoveryInfo && (
          <div className="text-[10px] text-gray-500 mt-0.5 truncate px-1">
            {myWaveDiscoveryTracker.formatDiscoveryDate(discoveryInfo.discoveredAt)}
          </div>
        )}
      </div>
    </div>
  )
}

interface SectionHeaderProps {
  title: string
  action?: string
  onAction?: () => void
}

function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4 px-1">
      <h2 className="text-xl font-bold" style={{ color: 'var(--theme-foreground)' }}>{title}</h2>
      {action && (
        <button 
          onClick={onAction} 
          className="text-sm font-medium flex items-center gap-1 transition-colors"
          style={{ color: 'var(--theme-accent)' }}
        >
          {action} <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

function ScrollContainer({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll)
    return () => el.removeEventListener('scroll', checkScroll)
  }, [children, checkScroll])

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const scrollAmount = 300
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }, [])

  return (
    <div className="relative">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
      )}

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto pb-4 gap-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-700" />
        </button>
      )}
    </div>
  )
}

// ==================== ГЛАВНЫЙ КОМПОНЕНТ ====================

export default function NewHomepage() {
  const navigate = useNavigate()
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [myWaveArtists, setMyWaveArtists] = useState<any[]>([])
  const { getProfile, ratings } = useML()
  const { setSongList } = usePlayerActions()
  // Берём названия из сохранённых плейлистов (если есть)
  const { getPlaylist } = useMLPlaylistsStateActions()
  const dailyMixPL = getPlaylist('daily-mix')
  const discoverPL = getPlaylist('discover-weekly')
  const myWavePL = getPlaylist('my-wave')
  const moodMixPL = getPlaylist('mood')
  const timeMixPL = getPlaylist('time-of-day')

  // Функция воспроизведения ML плейлиста
  const handlePlayMLPlaylist = async (type: string) => {
    if (isGenerating) return
    setIsGenerating(type)

    try {
      const playlist = getPlaylist(type)
      
      if (!playlist || !playlist.songs || playlist.songs.length === 0) {
        toast.warning('Сначала сгенерируйте плейлист!', { type: 'warning' })
        setIsGenerating(null)
        return
      }

      setSongList(playlist.songs, 0)
      toast.success(`▶️ ${playlist.name}`, { type: 'success', autoClose: 2000 })
    } catch (error) {
      console.error(`Ошибка воспроизведения ${type}:`, error)
      toast.error('Ошибка воспроизведения')
    } finally {
      setIsGenerating(null)
    }
  }

  const { settings: playlistSettings } = useMLPlaylists()
  const themeClasses = useThemeClasses()

  const profile = getProfile()
  const topGenres = Object.entries(profile.preferredGenres || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre]) => genre)
  const myWaveGradient = generateCSSGradient(topGenres, profile.preferredGenres || {})

  // Приветствие по времени суток + имя пользователя
  const hour = new Date().getHours()
  let timeGreeting = 'Доброй ночи'
  if (hour >= 5 && hour < 12) timeGreeting = 'Доброе утро'
  else if (hour >= 12 && hour < 18) timeGreeting = 'Добрый день'
  else if (hour >= 18 && hour < 23) timeGreeting = 'Добрый вечер'

  // Получаем имя пользователя из app store
  const appState = useAppStore.getState()
  const userName = appState.data?.username || ''
  const displayName = userName ? userName.charAt(0).toUpperCase() + userName.slice(1) : ''

  // ✅ Исправлено: likedSongs = локальные + Navidrome starred
  const localLikedCount = profile.likedSongs?.length || 0

  // Загружаем лайкнутые треки из Navidrome
  const { data: navidromeStarredSongs = [] } = useQuery({
    queryKey: ['starred-songs-count'],
    queryFn: async () => {
      const { getStarredSongs } = await import('@/service/subsonic-api')
      return await getStarredSongs()
    },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  })

  const navidromeLikedCount = navidromeStarredSongs.length || 0
  // Общее количество: локальные + Navidrome (без дублей — используем Set по ID)
  const localLikedIds = new Set(profile.likedSongs || [])
  const navidromeLikedIds = new Set(navidromeStarredSongs.map(s => s.id))
  const allLikedIds = new Set([...localLikedIds, ...navidromeLikedIds])
  const likedCount = allLikedIds.size

  const { data: allGenres = [] } = useQuery({
    queryKey: ['genres-all'],
    queryFn: getGenres,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  })

  // Загружаем лайкнутых артистов (основной источник)
  const { data: starredArtists = [] } = useQuery({
    queryKey: ['starred-artists'],
    queryFn: getStarredArtists,
    staleTime: 1000 * 60 * 30,
  })

  // Fallback: случайные артисты из треков
  const { data: randomSongs = [] } = useQuery({
    queryKey: ['random-songs-for-artists'],
    queryFn: () => getRandomSongs(100),
    enabled: starredArtists.length === 0,
    staleTime: 1000 * 60 * 30,
  })

  // Вычисляем уникальных артистов
  const [artistsToUse, setArtistsToUse] = useState<any[]>([])
  const [artistsLoading, setArtistsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const extractArtists = async () => {
      // Приоритет 1: лайкнутые артисты
      if (starredArtists && starredArtists.length > 0) {
        if (!cancelled) {
          const artists = starredArtists.map(a => ({
            id: a.id,
            name: a.name,
            coverArt: a.coverArt,
            artistImageUrl: a.artistImageUrl,
            isStarred: true,
          }))
          console.log('[Homepage] Using', artists.length, 'starred artists')
          setArtistsToUse(artists)
          setArtistsLoading(false)
        }
        return
      }

      // Приоритет 2: артисты из случайных треков
      if (randomSongs && randomSongs.length > 0) {
        const artistMap = new Map()
        for (const song of randomSongs) {
          const artistId = song.artistId || song.artist
          if (artistId && !artistMap.has(artistId)) {
            artistMap.set(artistId, {
              id: artistId,
              name: song.artist || 'Unknown',
              coverArt: song.coverArt,
              isStarred: false,
            })
          }
        }
        const artists = Array.from(artistMap.values())
        if (!cancelled) {
          console.log('[Homepage] Using', artists.length, 'artists from random songs')
          setArtistsToUse(artists)
          setArtistsLoading(false)
        }
        return
      }

      if (!cancelled) {
        setArtistsLoading(false)
      }
    }

    extractArtists()
    return () => { cancelled = true }
  }, [starredArtists, randomSongs])

  // Загружаем артистов из Моей волны при монтировании
  useEffect(() => {
    const discoveries = myWaveDiscoveryTracker.getQualifiedArtists()
    
    // Маппим на формат ArtistCircle
    const artistData = discoveries.map(d => ({
      id: d.artistId,
      name: d.artistName,
      coverArt: d.artistImageUrl,
      artistImageUrl: d.artistImageUrl,
      discoveryInfo: d,
    }))
    
    setMyWaveArtists(artistData)
  }, [])

  const trackCount = playlistSettings.maxTracks || 25

  const handleMyWavePlay = async () => {
    if (isGenerating) return
    setIsGenerating('mywave')

    try {
      const likedSongIds = profile.likedSongs || []
      const playlist = await generateMyWavePlaylist(likedSongIds, ratings, trackCount, true)

      if (playlist.songs.length > 0) {
        setSongList(playlist.songs, 0)
        toast.success('Моя волна запущена!', { type: 'success' })
      }
    } catch (error) {
      console.error('Ошибка генерации "Моя волна":', error)
      toast.error('Ошибка генерации плейлиста')
    } finally {
      setIsGenerating(null)
    }
  }

  const handleGenreClick = async (genreName: string) => {
    if (isGenerating) return
    setIsGenerating(genreName)

    try {
      const songs = await getSongsByGenre(genreName, 50)
      if (songs.length === 0) {
        toast.error(`Нет треков в жанре "${genreName}"`)
        return
      }
      
      setSongList(songs as any, 0)
      toast.success(`${genreName} — ${songs.length} треков`, { type: 'success', autoClose: 2000 })
    } catch (error) {
      console.error('Failed to generate genre playlist:', error)
      toast.error(`Ошибка: ${genreName}`)
    } finally {
      setIsGenerating(null)
    }
  }

  const handleArtistRadio = async (artistId: string, artistName: string) => {
    if (isGenerating) return
    setIsGenerating(artistId)

    try {
      const { generateArtistRadio } = await import('@/service/ml-wave-service')
      const result = await generateArtistRadio(artistId, 30)

      if (result.songs.length > 0) {
        setSongList(result.songs as any, 0)
        toast.success(`▶️ В стиле ${artistName}: ${result.songs.length} треков`, { type: 'success', autoClose: 3000 })
      } else {
        toast.info(`Нет треков для артиста ${artistName}`, { autoClose: 2000 })
      }
    } catch (error) {
      console.error('Failed to generate artist radio:', error)
      toast.error(`Ошибка генерации радио: ${artistName}`)
    } finally {
      setIsGenerating(null)
    }
  }

  // ==================== РЕНДЕР ====================

  return (
    <div 
      className="w-full min-h-screen pb-24"
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
      <style>{GRADIENT_ANIMATION}</style>

      {/* Hero секция */}
      <div 
        className="relative w-full pb-8"
        style={{ backgroundColor: 'var(--theme-background-alternate)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm mb-1" style={{ color: 'var(--theme-muted-foreground)' }}>
                {timeGreeting}{displayName ? `, ${displayName}` : ''}
              </p>
              <h1 className="text-3xl font-bold" style={{ color: 'var(--theme-foreground)' }}>Главная</h1>
            </div>
            <button onClick={() => navigate('/search')} className="p-2.5 rounded-full transition-colors"
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-background-alternate)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <svg className="w-5 h-5" style={{ color: 'var(--theme-muted-foreground)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>

          {/* Карточка "Моя волна" */}
          <div
            className="relative rounded-3xl overflow-hidden shadow-xl"
            style={{
              background: myWaveGradient,
              backgroundSize: '200% 200%',
              animation: 'gradientShift 15s ease infinite'
            }}
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-20 -left-20 w-80 h-80 bg-white/20 rounded-full blur-3xl" />
              <div className="absolute top-1/2 -right-20 w-96 h-96 bg-white/15 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 p-8 sm:p-10 flex flex-col sm:flex-row items-center sm:items-start gap-8">
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-2xl"
                style={{ animation: 'pulse-glow 3s ease-in-out infinite' }}>
                <Activity className="w-14 h-14 sm:w-16 sm:h-16 text-white" />
              </div>

              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">Моя волна</h2>
                <p className="text-white/90 mb-6 max-w-lg text-base sm:text-lg">
                  Персональная музыкальная лента, адаптированная под ваши предпочтения
                </p>

                <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                  <button
                    onClick={handleMyWavePlay}
                    disabled={!!isGenerating}
                    className="px-5 py-3.5 rounded-xl font-semibold bg-white text-gray-900 hover:bg-gray-50 active:scale-95 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center relative group"
                    title="Запустить Мою волну"
                  >
                    {isGenerating === 'mywave' ? (
                      <div className="w-5 h-5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
                    ) : (
                      <Play className="w-5 h-5 fill-gray-900" />
                    )}
                  </button>

                  <button
                    onClick={() => navigate('/settings/ml')}
                    className="p-3.5 rounded-xl font-medium bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors flex items-center justify-center group relative"
                    title="Настройки Моей волны"
                  >
                    <Settings className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => navigate('/ml/stats')}
                    className="p-3.5 rounded-xl font-medium bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm transition-colors flex items-center justify-center group relative"
                    title="Статистика прослушиваний"
                  >
                    <BarChart3 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Основной контент */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-10">

        {/* Быстрый доступ */}
        <div>
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--theme-foreground)' }}>Быстрый доступ</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <QuickAccessCard
              icon={<Sparkles className="w-6 h-6" />}
              label="Для вас"
              subtitle="Персональные рекомендации"
              route="/ml/for-you"
              gradient={CARD_GRADIENTS.forYou}
            />
            <QuickAccessCard
              icon={<TrendingUp className="w-6 h-6" />}
              label="Тренды"
              subtitle="Популярное сейчас"
              route="/ml/discover"
              gradient={CARD_GRADIENTS.trends}
            />
            <QuickAccessCard
              icon={<Heart className="w-6 h-6" />}
              label="Любимое"
              subtitle={`${likedCount} треков`}
              route="/library/favorites"
              gradient={CARD_GRADIENTS.favorites}
            />
            <QuickAccessCard
              icon={<History className="w-6 h-6" />}
              label="История"
              subtitle="Недавно прослушанные"
              route="/history"
              gradient={CARD_GRADIENTS.history}
            />
          </div>
        </div>

        {/* ML Рекомендации (вместо "Свели в AI-сет") */}
        <div>
          <SectionHeader title="ML Рекомендации" action="Все" onAction={() => navigate('/ml/for-you')} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MLPlaylistCard
              title={dailyMixPL?.name || "Дейли Микс"}
              description={dailyMixPL?.description || "Обновляется каждый день на основе ваших вкусов"}
              gradient={CARD_GRADIENTS.ml}
              icon={<Zap className="w-10 h-10" />}
              tags={topGenres.slice(0, 2)}
              onClick={() => navigate('/ml/playlist/daily-mix')}
              onPlay={() => handlePlayMLPlaylist('daily-mix')}
            />
            <MLPlaylistCard
              title={discoverPL?.name || "Открытия недели"}
              description={discoverPL?.description || "Новая музыка каждую неделю"}
              gradient={CARD_GRADIENTS.workout}
              icon={<Star className="w-10 h-10" />}
              tags={['новинки', 'открытия']}
              onClick={() => navigate('/ml/playlist/discover-weekly')}
              onPlay={() => handlePlayMLPlaylist('discover-weekly')}
            />
            <MLPlaylistCard
              title={myWavePL?.name || "Моя Волна"}
              description={myWavePL?.description || "Персональная музыкальная лента"}
              gradient={CARD_GRADIENTS.myWave}
              icon={<Activity className="w-10 h-10" />}
              tags={['персональное', 'волна']}
              onClick={() => navigate('/ml/playlist/my-wave')}
              onPlay={() => handlePlayMLPlaylist('my-wave')}
            />
            <MLPlaylistCard
              title={moodMixPL?.name || "Муд Микс"}
              description={moodMixPL?.description || "Подборка под ваше настроение"}
              gradient={CARD_GRADIENTS.relax}
              icon={<Disc className="w-10 h-10" />}
              tags={['настроение', 'vibe']}
              onClick={() => navigate('/ml/playlist/mood')}
              onPlay={() => handlePlayMLPlaylist('mood')}
            />
            <MLPlaylistCard
              title={timeMixPL?.name || "Время Микс"}
              description={timeMixPL?.description || "Музыка для времени суток"}
              gradient={CARD_GRADIENTS.work}
              icon={<Calendar className="w-10 h-10" />}
              tags={['время', 'контекст']}
              onClick={() => navigate('/ml/playlist/time-of-day')}
              onPlay={() => handlePlayMLPlaylist('time-of-day')}
            />
          </div>
        </div>

        {/* Встречали в Моей волне (артисты из истории с лайками) */}
        <div>
          <SectionHeader title="Встречали в Моей волне" action="Все" onAction={() => navigate('/ml/my-wave-encounters')} />
          <ViralArtistsSection onArtistClick={handleArtistRadio} />
        </div>

        {/* В стиле (все лайкнутые артисты, рандомно при каждом запуске) */}
        <div>
          <SectionHeader title="В стиле" action="Все" onAction={() => navigate('/ml/in-style-artists')} />
          <InStyleArtistsSection 
            artists={artistsToUse} 
            isLoading={artistsLoading} 
            onArtistClick={handleArtistRadio}
          />
        </div>

        {/* Жанры */}
        <div>
          <SectionHeader title="Жанры" action="Все" onAction={() => navigate('/genres')} />
          {allGenres.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {allGenres
                .filter((g: any) => g.songCount && g.songCount > 0)
                .sort((a: any, b: any) => (b.songCount || 0) - (a.songCount || 0))
                .slice(0, 16)
                .map((genre: any) => (
                  <GenreButton
                    key={genre.value}
                    genre={genre.value}
                    songCount={genre.songCount}
                    onClick={() => handleGenreClick(genre.value)}
                    isGenerating={isGenerating === genre.value}
                  />
                ))}
            </div>
          ) : (
            <div className={`text-center py-12 rounded-2xl border border-dashed ${themeClasses.cardBg} ${themeClasses.borderDashed}`}>
              <Music2 className={`w-12 h-12 mx-auto mb-3 ${themeClasses.text.muted}`} />
              <p className={`font-medium ${themeClasses.text.secondary}`}>Загрузка жанров...</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
