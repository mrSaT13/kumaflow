/**
 * Discoveries Page - Страница открытий
 * 
 * Показывает:
 * - Праздничные плейлисты
 * - Новые релизы
 * - ML рекомендации
 */

import { useState, useEffect } from 'react'
import { Play, Calendar, Sparkles, Music } from 'lucide-react'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { getAllHolidaysWithCustoms } from '@/service/ics-parser'
import { getAllGeneratedPlaylists } from '@/store/generated-playlists.store'
import { getActiveHolidays } from '@/service/holidays'
import type { Holiday } from '@/service/holidays'

export default function DiscoveriesPage() {
  const [holidayPlaylists, setHolidayPlaylists] = useState<Array<{
    holiday: Holiday
    playlist: any
  }>>([])
  const [loading, setLoading] = useState(true)
  const { setSongList } = usePlayerActions()

  useEffect(() => {
    loadDiscoveries()
    
    // 🆕 Слушаем событие генерации праздничного плейлиста
    const handleHolidayGenerated = () => {
      console.log('[Discoveries] Holiday playlist generated, reloading...')
      loadDiscoveries()
    }
    
    window.addEventListener('holiday-playlist-generated', handleHolidayGenerated)
    
    return () => {
      window.removeEventListener('holiday-playlist-generated', handleHolidayGenerated)
    }
  }, [])

  const loadDiscoveries = async () => {
    setLoading(true)

    try {
      // 🆕 Получаем сгенерированные плейлисты (async)
      const generatedPlaylists = await getAllGeneratedPlaylists()
      
      const allHolidays = getAllHolidaysWithCustoms()
      const { isHolidayActive } = await import('@/service/holidays')
      
      const today = new Date()
      const relevantHolidays = allHolidays.filter(h => {
        if (h.isEnabled === false) return false
        if (isHolidayActive(h)) return true
        
        const [month, day] = h.startDate.split('-').map(Number)
        const holidayDate = new Date(today.getFullYear(), month - 1, day)
        const daysUntil = Math.ceil((holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntil >= 0 && daysUntil <= 7
      })
      
      // 4. Находим плейлисты для праздников
      const holidayMatches: Array<{ holiday: Holiday; playlist: any }> = []
      
      for (const holiday of relevantHolidays) {
        if (holiday.isEnabled === false) continue
        
        // Ищем плейлист для этого праздника
        const matchingPlaylist = generatedPlaylists.find(p => 
          p.metadata?.holidayId === holiday.id ||
          (p.metadata?.genre && holiday.genres.some(g => 
            p.metadata.genre?.toLowerCase().includes(g.toLowerCase())
          ))
        )
        
        if (matchingPlaylist) {
          holidayMatches.push({
            holiday,
            playlist: matchingPlaylist,
          })
        }
      }
      
      setHolidayPlaylists(holidayMatches)
      console.log(`[Discoveries] Found ${holidayMatches.length} holiday playlists`)
    } catch (error) {
      console.error('[Discoveries] Failed to load:', error)
    } finally {
      setLoading(false)
    }
  }

  const playPlaylist = (playlist: any) => {
    if (playlist.songs && playlist.songs.length > 0) {
      setSongList(playlist.songs, 0)
      toast.success(`▶️ Запущено: ${playlist.name}`, { autoClose: 2000 })
    }
  }

  const formatTimeAgo = (timestamp: number) => {
    const minutes = Math.floor((Date.now() - timestamp) / 60000)
    if (minutes < 60) return `${minutes}м назад`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}ч назад`
    const days = Math.floor(hours / 24)
    return `${days}д назад`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Загрузка открытий...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Заголовок */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-2">
          <Sparkles className="w-8 h-8 text-purple-500" />
          Открытия
        </h1>
        <p className="text-muted-foreground">
          Праздничные плейлисты и новые рекомендации
        </p>
      </div>

      {/* Праздничные плейлисты */}
      {holidayPlaylists.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
            <Calendar className="w-6 h-6 text-red-500" />
            Праздничные плейлисты
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {holidayPlaylists.map(({ holiday, playlist }) => (
              <Card
                key={playlist.id}
                className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group hover:scale-105"
                onClick={() => playPlaylist(playlist)}
              >
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="p-6 bg-gradient-to-br from-red-500 to-yellow-500 text-white text-center">
                    <div className="text-5xl mb-2">{holiday.icon}</div>
                    <h3 className="font-bold text-lg">{playlist.name}</h3>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {playlist.description}
                    </p>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Play className="w-3 h-3" />
                        <span>{playlist.songs.length} треков</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatTimeAgo(playlist.createdAt)}</span>
                      </div>
                    </div>

                    {/* Play button */}
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
      )}

      {/* Пустое состояние */}
      {holidayPlaylists.length === 0 && (
        <div className="text-center py-20">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-medium mb-2">Пока нет праздничных плейлистов</h3>
          <p className="text-muted-foreground">
            Добавьте праздник в настройках и плейлист сгенерируется автоматически
          </p>
        </div>
      )}
    </div>
  )
}
