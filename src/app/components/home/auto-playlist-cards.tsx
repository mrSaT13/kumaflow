/**
 * Auto Playlist Cards - Карточки ML плейлистов на главной
 * 
 * ИЗМЕНЕНИЕ (14.04.2026): Реализовано заново
 * Было: return null (отключено)
 * Стало: Показывает карточки ML/For You плейлистов на главной странице
 * 
 * Показывает:
 * - Daily Mix
 * - Discover Weekly  
 * - My Wave
 * - ML Recommendations
 * - Holiday плейлисты (если активен праздник)
 */

import { useState, useEffect } from 'react'
import { Play, Clock, Sparkles, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { useMLPlaylistsStateActions } from '@/store/ml-playlists-state.store'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { getActiveHolidays } from '@/service/holidays'
import { getAllHolidaysWithCustoms } from '@/service/ics-parser'  // 🆕
import { getAllGeneratedPlaylists } from '@/store/generated-playlists.store'

interface PlaylistCard {
  id: string
  name: string
  description: string
  songs: any[]
  type: string
  gradient: string
  icon: string
  trackCount: number
  lastUpdated?: string
}

export function AutoPlaylistCards() {
  const [playlists, setPlaylists] = useState<PlaylistCard[]>([])
  const [loading, setLoading] = useState(false)
  const { getPlaylist } = useMLPlaylistsStateActions()
  const { setSongList } = usePlayerActions()

  useEffect(() => {
    loadPlaylists()
    
    // 🆕 Слушаем событие генерации праздничного плейлиста
    const handleHolidayGenerated = () => {
      console.log('[AutoPlaylistCards] Holiday playlist generated, reloading...')
      loadPlaylists()
    }
    
    window.addEventListener('holiday-playlist-generated', handleHolidayGenerated)
    
    return () => {
      window.removeEventListener('holiday-playlist-generated', handleHolidayGenerated)
    }
  }, [])

  const loadPlaylists = async () => {
    setLoading(true)

    try {
      const playlistCards: PlaylistCard[] = []

      // 1. Загружаем основные ML плейлисты
      const mlPlaylists = [
        { id: 'daily-mix', icon: '☀️', gradient: 'from-orange-500 to-pink-500' },
        { id: 'discover-weekly', icon: '🔍', gradient: 'from-blue-500 to-purple-500' },
        { id: 'my-wave', icon: '🌊', gradient: 'from-cyan-500 to-blue-500' },
        { id: 'ml-recommendations', icon: '🤖', gradient: 'from-purple-500 to-indigo-500' },
      ]

      for (const ml of mlPlaylists) {
        const playlist = getPlaylist(ml.id)
        if (playlist && playlist.songs && playlist.songs.length > 0) {
          playlistCards.push({
            id: ml.id,
            name: playlist.name || ml.id,
            description: playlist.description || '',
            songs: playlist.songs,
            type: playlist.type || ml.id,
            gradient: ml.gradient,
            icon: ml.icon,
            trackCount: playlist.songs.length,
            lastUpdated: playlist.lastUpdated,
          })
        }
      }

      // 2. Проверяем праздники (active + upcoming 7 дней)
      const allPlaylists = await getAllGeneratedPlaylists()
      
      // 🆕 Получаем ВСЕ праздники (дефолтные + пользовательские)
      const allHolidays = getAllHolidaysWithCustoms()
      const { isHolidayActive } = await import('@/service/holidays')
      
      // Фильтруем: активные сегодня ИЛИ предстоящие в ближайшие 7 дней
      const today = new Date()
      const relevantHolidays = allHolidays.filter(h => {
        if (h.isEnabled === false) return false
        if (isHolidayActive(h)) return true
        
        // Проверяем upcoming
        const [month, day] = h.startDate.split('-').map(Number)
        const holidayDate = new Date(today.getFullYear(), month - 1, day)
        const daysUntil = Math.ceil((holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntil >= 0 && daysUntil <= 7
      })
      
      console.log(`[AutoPlaylistCards] Relevant holidays: ${relevantHolidays.length}`, relevantHolidays.map(h => h.name))
      console.log(`[AutoPlaylistCards] Generated playlists: ${allPlaylists.length}`, allPlaylists.map(p => ({ id: p.id, name: p.name, holidayId: p.metadata?.holidayId, type: p.type })))
      
      for (const holiday of relevantHolidays) {
        // 🆕 Ищем плейлист по holidayId в metadata
        const holidayPlaylist = allPlaylists.find(p => 
          p.metadata?.holidayId === holiday.id
        )

        console.log(`[AutoPlaylistCards] Looking for ${holiday.name} (${holiday.id}): found=${!!holidayPlaylist}`)

        if (holidayPlaylist) {
          playlistCards.push({
            id: `holiday-${holiday.id}`,
            name: `${holiday.icon} ${holidayPlaylist.name}`,
            description: holidayPlaylist.description,
            songs: holidayPlaylist.songs,
            type: 'holiday',
            gradient: 'from-red-500 to-yellow-500',
            icon: holiday.icon,
            trackCount: holidayPlaylist.songs.length,
            lastUpdated: new Date(holidayPlaylist.createdAt).toISOString(),
          })
        }
      }

      setPlaylists(playlistCards)
      console.log(`[AutoPlaylistCards] Loaded ${playlistCards.length} playlists`)
    } catch (error) {
      console.error('[AutoPlaylistCards] Failed to load:', error)
    } finally {
      setLoading(false)
    }
  }

  const playPlaylist = (playlist: PlaylistCard) => {
    setSongList(playlist.songs, 0)
    toast.success(`▶️ Запущено: ${playlist.name}`, { autoClose: 2000 })
  }

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
    if (minutes < 60) return `${minutes}м назад`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}ч назад`
    const days = Math.floor(hours / 24)
    return `${days}д назад`
  }

  if (loading) {
    return (
      <div className="px-8 py-6">
        <div className="flex items-center gap-3 text-muted-foreground mb-4">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span>Загрузка ML плейлистов...</span>
        </div>
      </div>
    )
  }

  if (playlists.length === 0) {
    return null
  }

  return (
    <div className="px-8 py-6">
      {/* Заголовок секции */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-purple-500" />
          ML Рекомендации
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadPlaylists}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      {/* Карточки плейлистов */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {playlists.map((playlist) => (
          <Card
            key={playlist.id}
            className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group hover:scale-105"
            onClick={() => playPlaylist(playlist)}
          >
            <CardContent className="p-0">
              {/* Header с emoji и градиентом */}
              <div className={`p-6 bg-gradient-to-br ${playlist.gradient} text-white text-center`}>
                <div className="text-5xl mb-2">{playlist.icon}</div>
                <h3 className="font-bold text-lg">{playlist.name}</h3>
              </div>

              {/* Контент */}
              <div className="p-4 space-y-3">
                {playlist.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {playlist.description}
                  </p>
                )}

                {/* Мета информация */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Play className="w-3 h-3" />
                    <span>{playlist.trackCount} треков</span>
                  </div>
                  {playlist.lastUpdated && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(playlist.lastUpdated)}</span>
                    </div>
                  )}
                </div>

                {/* Кнопка Play при наведении */}
                <Button
                  className="w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  onClick={(e) => {
                    e.stopPropagation()
                    playPlaylist(playlist)
                  }}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Запустить
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
