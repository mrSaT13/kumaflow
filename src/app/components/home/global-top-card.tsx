/**
 * Карточка "Что слушают другие" (Global Top Tracks)
 * 
 * Отображает топ треков со всего сервера Navidrome
 * С интеграцией Last.fm если Navidrome не поддерживает
 */

import { useQuery } from '@tanstack/react-query'
import { Headphones, TrendingUp, Music2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { getCachedGlobalTopTracks, GlobalTrack } from '@/service/global-top-tracks'
import { usePlayerActions } from '@/store/player.store'
import { subsonic } from '@/service/subsonic'

export function GlobalTopCard() {
  const { t } = useTranslation()
  const { setSongList, play } = usePlayerActions()

  // Загружаем глобальный топ
  const { data, isLoading, error } = useQuery({
    queryKey: ['global-top-tracks'],
    queryFn: () => getCachedGlobalTopTracks(20),
    staleTime: 1000 * 60 * 30, // 30 минут
    retry: 2,
  })

  const handlePlayAll = async () => {
    if (!data?.tracks?.length) return

    try {
      // Получаем полные данные треков из Navidrome
      const songs = data.tracks
        .filter(t => t.song.isLocal) // Только локальные треки
        .map(t => t.song)

      if (songs.length === 0) {
        toast.info('Треки недоступны в вашей библиотеке')
        return
      }

      setSongList(songs, 0)
      play()
      toast.success(`▶️ Запущено: Что слушают другие (${songs.length} треков)`)
    } catch (error) {
      console.error('[GlobalTop] Error playing:', error)
      toast.error('Ошибка при воспроизведении')
    }
  }

  const handlePlayTrack = async (track: GlobalTrack) => {
    if (!track.song.isLocal) {
      toast.info('Трек недоступен в вашей библиотеке')
      return
    }

    try {
      setSongList([track.song], 0)
      play()
      toast.success(`▶️ ${track.song.artist} - ${track.song.title}`)
    } catch (error) {
      console.error('[GlobalTop] Error playing track:', error)
      toast.error('Ошибка при воспроизведении')
    }
  }

  if (isLoading) {
    return (
      <Card className="gradient-global-top">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 animate-spin" />
            Загрузка...
          </CardTitle>
        </CardHeader>
      </Card>
    )
  }

  if (error || !data?.tracks?.length) {
    return null // Скрываем карточку если ошибка
  }

  return (
    <Card className="gradient-global-top hover:shadow-lg transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Headphones className="h-5 w-5" />
              🔥 Что слушают другие
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Топ {data.tracks.length} треков {data.source === 'navidrome' ? 'сервера' : 'Last.fm'}
              </span>
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePlayAll}
            className="h-8 px-3"
          >
            ▶️ Играть всё
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <ScrollArea className="h-[180px] pr-4">
          <div className="space-y-2">
            {data.tracks.slice(0, 10).map((track, index) => (
              <div
                key={track.song.id}
                className="group flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handlePlayTrack(track)}
              >
                {/* Позиция в чарте */}
                <div className="w-6 text-center">
                  {track.trend === 'up' && (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  )}
                  {track.trend === 'down' && (
                    <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />
                  )}
                  {track.trend === 'new' && (
                    <span className="text-xs font-bold text-blue-500">NEW</span>
                  )}
                  {!track.trend && (
                    <span className="text-sm font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Обложка */}
                {track.song.coverArtUrl ? (
                  <img
                    src={track.song.coverArtUrl}
                    alt={track.song.album}
                    className="w-10 h-10 rounded object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                    <Music2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

                {/* Информация */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {track.song.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {track.song.artist}
                  </p>
                </div>

                {/* Play count */}
                <div className="text-xs text-muted-foreground">
                  {formatPlayCount(track.playCount)}
                </div>

                {/* Play button (hover) */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlayTrack(track)
                  }}
                >
                  ▶️
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Источник данных */}
        <div className="mt-3 text-xs text-muted-foreground text-center">
          {data.source === 'navidrome' 
            ? '📊 Статистика вашего Navidrome сервера'
            : '🌍 Глобальный чарт Last.fm'}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Форматирование количества прослушиваний
 */
function formatPlayCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return count.toString()
}

/**
 * Иконка Globe
 */
function Globe({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" x2="22" y1="12" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
