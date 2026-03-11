import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { getMusicMap, clearMapCache, type MusicMapData } from '@/service/music-map'
import { usePlayerActions } from '@/store/player.store'
import { RefreshCw, Music } from 'lucide-react'

export function MusicMapCard() {
  const [mapData, setMapData] = useState<MusicMapData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState<{x: number, y: number, id: string} | null>(null)
  
  const { setSongList } = usePlayerActions()

  const loadMap = async () => {
    setIsLoading(true)
    try {
      const map = await getMusicMap()
      setMapData(map)
    } catch (error) {
      console.error('[MusicMap] Error loading:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadMap()
  }, [])

  const handleRefresh = () => {
    clearMapCache()
    loadMap()
  }

  const handlePointClick = async (point: typeof mapData.points[0]) => {
    try {
      const { subsonic } = await import('@/service/subsonic')
      const song = await subsonic.songs.getSong(point.id)
      
      if (song) {
        setSongList([song], 0)
      }
    } catch (error) {
      console.error('[MusicMap] Error loading song:', error)
    }
  }

  // Группируем по жанрам для цветов
  const genreColors: Record<string, string> = {
    'rock': '#ef4444',
    'pop': '#f97316',
    'electronic': '#eab308',
    'dance': '#eab308',
    'hip-hop': '#22c55e',
    'rap': '#22c55e',
    'jazz': '#06b6d4',
    'classical': '#3b82f6',
    'metal': '#8b5cf6',
    'punk': '#8b5cf6',
    'folk': '#d946ef',
    'acoustic': '#d946ef',
    'country': '#14b8a6',
    'blues': '#0891b2',
    'reggae': '#16a34a',
    'soul': '#f43f5e',
    'funk': '#f43f5e',
    'ambient': '#6366f1',
    'unknown': '#9ca3af',
  }

  const getGenreColor = (genre?: string) => {
    if (!genre) return genreColors.unknown
    
    const normalizedGenre = genre.toLowerCase().trim()
    
    // Точное совпадение
    if (genreColors[normalizedGenre]) return genreColors[normalizedGenre]
    
    // Частичное совпадение
    for (const [key, color] of Object.entries(genreColors)) {
      if (key !== 'unknown' && normalizedGenre.includes(key)) {
        return color
      }
    }
    
    // Если не нашли - возвращаем серый
    return genreColors.unknown
  }

  return (
    <Card className="bg-gradient-to-br from-indigo-900/50 to-purple-900/50 border-indigo-500/30">
      <CardHeader>
        <CardTitle className="text-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🗺️</span>
            Карта музыки
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !mapData && (
          <div className="h-64 flex items-center justify-center">
            <div className="text-center space-y-2">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400" />
              <div className="text-sm text-muted-foreground">
                Построение карты...
              </div>
            </div>
          </div>
        )}

        {!isLoading && mapData && (
          <div className="space-y-3">
            {/* Визуализация - компактная */}
            <div 
              className="relative w-full aspect-video bg-background/50 rounded-lg overflow-hidden mx-auto"
              style={{ maxHeight: '200px' }}
            >
              {/* Точки треков */}
              {mapData.points.map((point) => (
                <button
                  key={point.id}
                  onClick={() => handlePointClick(point)}
                  onMouseEnter={() => setHoveredPoint({ x: point.x, y: point.y, id: point.id })}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className="absolute w-2 h-2 rounded-full transition-transform hover:scale-150"
                  style={{
                    left: `${point.x}%`,
                    top: `${point.y}%`,
                    backgroundColor: getGenreColor(point.genre),
                    transform: 'translate(-50%, -50%)',
                  }}
                  title={point.genre || 'Unknown'}
                />
              ))}

              {/* Hover подсказка */}
              {hoveredPoint && (
                <div
                  className="absolute pointer-events-none bg-card border border-border rounded px-2 py-1 text-xs shadow-lg z-10"
                  style={{
                    left: `${hoveredPoint.x}%`,
                    top: `${hoveredPoint.y - 5}%`,
                    transform: 'translate(-50%, -100%)',
                  }}
                >
                  <Music className="w-3 h-3 inline mr-1" />
                  Трек
                </div>
              )}
            </div>

            {/* Статистика */}
            <div className="text-xs text-muted-foreground text-center">
              🎵 {mapData.totalTracks} треков • 
              {new Date(mapData.timestamp).toLocaleDateString()}
            </div>
          </div>
        )}

        {!isLoading && !mapData && (
          <div className="h-64 flex items-center justify-center text-center">
            <div className="space-y-2">
              <Music className="w-8 h-8 mx-auto text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                Недостаточно данных для карты
              </div>
              <div className="text-xs">
                Нужно минимум 10 треков с audio features
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
