/**
 * Карточка "Новинки подписок" на главной
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Music, Radio, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { generateNewReleasesPlaylist } from '@/service/new-releases-service'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { useArtistSubscriptions } from '@/store/artist-subscriptions.store'

export function NewReleasesCard() {
  const { t } = useTranslation()
  const { setSongList } = usePlayerActions()
  const { subscriptions } = useArtistSubscriptions()
  const [isLoading, setIsLoading] = useState(false)
  
  const handlePlayNewReleases = async () => {
    setIsLoading(true)
    
    try {
      const playlist = await generateNewReleasesPlaylist(25)
      
      if (playlist.songs.length > 0) {
        setSongList(playlist.songs, 0)
        toast.success(`▶️ Новинки подписок: ${playlist.songs.length} треков`, {
          type: 'success',
        })
      } else {
        toast.info('Нет новых треков у подписанных артистов', {
          type: 'info',
        })
      }
    } catch (error) {
      console.error('[NewReleasesCard] Error:', error)
      toast.error('Ошибка при загрузке новинок', {
        type: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }
  
  // Если нет подписок - не показываем карточку
  if (!subscriptions || subscriptions.length === 0) {
    return null
  }
  
  return (
    <Card className="group relative overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 hover:from-purple-500/30 hover:to-pink-500/30 transition-all border-purple-500/20 hover:border-purple-500/40">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          {/* Иконка */}
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg group-hover:shadow-purple-500/50 transition-shadow">
              <Music className="w-8 h-8 text-white" />
            </div>
            {/* Бейдж с количеством артистов */}
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-xs text-white font-bold shadow-md">
              {subscriptions.length}
            </div>
          </div>
          
          {/* Текст */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-foreground truncate">
              Новинки подписок
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              Новые треки от {subscriptions.length} артист{subscriptions.length === 1 ? 'а' : subscriptions.length < 5 ? 'ов' : 'ов'}
            </p>
          </div>
          
          {/* Кнопка */}
          <Button
            size="lg"
            onClick={handlePlayNewReleases}
            disabled={isLoading}
            className="rounded-full w-12 h-12 p-0 bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-lg group-hover:shadow-purple-500/50 transition-all"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Radio className="w-5 h-5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
