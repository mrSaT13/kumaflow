/**
 * Кнопка "Сохранить трек в кеш"
 */

import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import { cacheService } from '@/service/cache-service'
import type { ISong } from '@/types/responses/song'

interface CacheTrackButtonProps {
  song: ISong
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  showLabel?: boolean
}

export function CacheTrackButton({
  song,
  variant = 'ghost',
  size = 'icon',
  showLabel = false,
}: CacheTrackButtonProps) {
  const [isCaching, setIsCaching] = useState(false)
  const [isCached, setIsCached] = useState(false)

  const handleCache = async () => {
    if (isCaching || isCached) return

    setIsCaching(true)

    try {
      const cached = await cacheService.cacheTracks([song.id])
      
      if (cached > 0) {
        setIsCached(true)
        toast.success(`✅ Трек "${song.title}" сохранён в кеш`, {
          autoClose: 2000,
        })
        
        // Сбрасываем флаг через 5 секунд
        setTimeout(() => setIsCached(false), 5000)
      } else {
        toast.warn('Трек уже в кеше', {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('[CacheTrackButton] Failed to cache track:', error)
      toast.error('Ошибка сохранения в кеш', {
        autoClose: 3000,
      })
    } finally {
      setIsCaching(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCache}
      disabled={isCaching || isCached}
      title={isCached ? 'Уже в кеше' : 'Сохранить в кеш'}
      className={isCached ? 'text-green-500' : ''}
    >
      {showLabel && (
        <span className="mr-2 text-sm">
          {isCached ? 'В кеше' : 'Сохранить в кеш'}
        </span>
      )}
      <Download className={`w-4 h-4 ${isCaching ? 'animate-pulse' : ''}`} />
    </Button>
  )
}
