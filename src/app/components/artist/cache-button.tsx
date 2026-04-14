/**
 * Кнопка "Сохранить артиста в кеш"
 */

import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import { cacheService } from '@/service/cache-service'

interface CacheArtistButtonProps {
  artistId: string
  artistName: string
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  showLabel?: boolean
}

export function CacheArtistButton({
  artistId,
  artistName,
  variant = 'ghost',
  size = 'icon',
  showLabel = false,
}: CacheArtistButtonProps) {
  const [isCaching, setIsCaching] = useState(false)
  const [isCached, setIsCached] = useState(false)

  const handleCache = async () => {
    if (isCaching || isCached) return

    setIsCaching(true)

    try {
      const cached = await cacheService.cacheArtists([artistId])
      
      if (cached > 0) {
        setIsCached(true)
        toast.success(`✅ Артист "${artistName}" сохранён в кеш`, {
          autoClose: 2000,
        })
        
        // Сбрасываем флаг через 5 секунд
        setTimeout(() => setIsCached(false), 5000)
      } else {
        toast.warn('Артист уже в кеше', {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('[CacheArtistButton] Failed to cache artist:', error)
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
      title={isCached ? 'В кеше' : 'Сохранить в кеш'}
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
