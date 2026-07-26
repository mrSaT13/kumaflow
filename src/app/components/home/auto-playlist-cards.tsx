/**
 * Auto Playlist Cards — компактная сетка ML плейлистов на главной (старый дизайн)
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Sparkles, RefreshCw, Zap, Star, Activity, Disc } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { useMLPlaylistsStateActions } from '@/store/ml-playlists-state.store'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { getAllHolidaysWithCustoms } from '@/service/ics-parser'
import { getAllGeneratedPlaylists } from '@/store/generated-playlists.store'

interface PlaylistCard {
  id: string
  name: string
  description: string
  songs: any[]
  type: string
  gradient: string
  icon: React.ReactNode
  route: string
  trackCount: number
}

const CORE_PLAYLISTS = [
  {
    id: 'daily-mix',
    fallbackName: 'Дейли Микс',
    gradient: 'from-orange-500 to-pink-500',
    icon: <Zap className="size-6" />,
    route: '/ml/playlist/daily-mix',
  },
  {
    id: 'discover-weekly',
    fallbackName: 'Открытия недели',
    gradient: 'from-blue-500 to-purple-500',
    icon: <Star className="size-6" />,
    route: '/ml/playlist/discover-weekly',
  },
  {
    id: 'my-wave',
    fallbackName: 'Моя Волна',
    gradient: 'from-cyan-500 to-blue-500',
    icon: <Activity className="size-6" />,
    route: '/ml/playlist/my-wave',
  },
  {
    id: 'mood',
    fallbackName: 'Муд Микс',
    gradient: 'from-violet-500 to-fuchsia-600',
    icon: <Disc className="size-6" />,
    route: '/ml/playlist/mood',
  },
] as const

function CompactMLCard({
  title,
  gradient,
  icon,
  onOpen,
  onPlay,
}: {
  title: string
  gradient: string
  icon: React.ReactNode
  onOpen: () => void
  onPlay: () => void
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} text-white group`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-[88px] w-full flex-col items-center justify-center gap-1 p-2 text-center sm:h-[96px]"
      >
        <div className="opacity-90">{icon}</div>
        <span className="w-full text-[10px] font-semibold leading-tight line-clamp-2 sm:text-[11px]">
          {title}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onPlay()
        }}
        className="absolute bottom-1 right-1 rounded-full bg-white/30 p-1.5 backdrop-blur-sm"
        aria-label={`Слушать ${title}`}
      >
        <Play className="size-3 fill-white" />
      </button>
    </div>
  )
}

export function AutoPlaylistCards() {
  const navigate = useNavigate()
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([])
  const [holidayPlaylists, setHolidayPlaylists] = useState<PlaylistCard[]>([])
  const [loading, setLoading] = useState(false)
  const { getPlaylist } = useMLPlaylistsStateActions()
  const { setSongList } = usePlayerActions()

  useEffect(() => {
    loadPlaylists()

    const handleHolidayGenerated = () => loadPlaylists()
    window.addEventListener('holiday-playlist-generated', handleHolidayGenerated)
    return () => window.removeEventListener('holiday-playlist-generated', handleHolidayGenerated)
  }, [])

  const loadPlaylists = async () => {
    setLoading(true)

    try {
      const coreCards: PlaylistCard[] = []

      for (const core of CORE_PLAYLISTS) {
        const playlist = getPlaylist(core.id)
        coreCards.push({
          id: core.id,
          name: playlist?.name || core.fallbackName,
          description: playlist?.description || '',
          songs: playlist?.songs || [],
          type: core.id,
          gradient: core.gradient,
          icon: core.icon,
          route: core.route,
          trackCount: playlist?.songs?.length || 0,
        })
      }

      const holidays: PlaylistCard[] = []
      const allPlaylists = await getAllGeneratedPlaylists()
      const allHolidays = getAllHolidaysWithCustoms()
      const { isHolidayActive } = await import('@/service/holidays')
      const today = new Date()

      const relevantHolidays = allHolidays.filter((h) => {
        if (h.isEnabled === false) return false
        if (isHolidayActive(h)) return true
        const [month, day] = h.startDate.split('-').map(Number)
        const holidayDate = new Date(today.getFullYear(), month - 1, day)
        const daysUntil = Math.ceil(
          (holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        )
        return daysUntil >= 0 && daysUntil <= 7
      })

      for (const holiday of relevantHolidays) {
        const holidayPlaylist = allPlaylists.find(
          (p) => p.metadata?.holidayId === holiday.id,
        )
        if (!holidayPlaylist) continue

        holidays.push({
          id: `holiday-${holiday.id}`,
          name: holiday.name,
          description: holidayPlaylist.description,
          songs: holidayPlaylist.songs,
          type: 'holiday',
          gradient: 'from-red-500 to-yellow-500',
          icon: <span className="text-xl leading-none">{holiday.icon}</span>,
          route: `/ml/playlist/${holidayPlaylist.id}`,
          trackCount: holidayPlaylist.songs.length,
        })
      }

      setPlaylists(coreCards)
      setHolidayPlaylists(holidays)
    } catch (error) {
      console.error('[AutoPlaylistCards] Failed to load:', error)
    } finally {
      setLoading(false)
    }
  }

  const playPlaylist = (playlist: PlaylistCard) => {
    if (!playlist.songs.length) {
      toast.warning('Сначала сгенерируйте плейлист', { autoClose: 2500 })
      navigate(playlist.route)
      return
    }
    setSongList(playlist.songs, 0)
    toast.success(`▶️ ${playlist.name}`, { autoClose: 2000 })
  }

  if (loading && playlists.length === 0) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="size-4 animate-pulse" />
          Загрузка ML плейлистов...
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">ML Рекомендации</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => navigate('/ml/for-you')}
          >
            Все
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={loadPlaylists}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {playlists.map((playlist) => (
          <CompactMLCard
            key={playlist.id}
            title={playlist.name}
            gradient={playlist.gradient}
            icon={playlist.icon}
            onOpen={() => navigate(playlist.route)}
            onPlay={() => playPlaylist(playlist)}
          />
        ))}
      </div>

      {holidayPlaylists.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {holidayPlaylists.map((playlist) => (
            <CompactMLCard
              key={playlist.id}
              title={playlist.name}
              gradient={playlist.gradient}
              icon={playlist.icon}
              onOpen={() => navigate(playlist.route)}
              onPlay={() => playPlaylist(playlist)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
