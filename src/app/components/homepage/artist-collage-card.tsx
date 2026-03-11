/**
 * Artist Collage Card - Карточка артиста с коллажем из обложек альбомов
 * 
 * Показывает 4-6 обложек альбомов артиста в виде сетки
 */

import { useState, useEffect } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent } from '@/app/components/ui/card'
import { subsonic } from '@/service/subsonic'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { cn } from '@/lib/utils'
import { getSimpleCoverArtUrl } from '@/api/httpClient'

interface ArtistCollageCardProps {
  artistId: string
  artistName: string
  onCoverClick?: () => void
}

export function ArtistCollageCard({
  artistId,
  artistName,
  onCoverClick,
}: ArtistCollageCardProps) {
  const { setSongList } = usePlayerActions()
  const [albumCovers, setAlbumCovers] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [totalAlbums, setTotalAlbums] = useState<number>(0)

  // Загрузка обложек альбомов артиста
  useEffect(() => {
    const loadAlbums = async () => {
      try {
        console.log('[ArtistCollage] Loading albums for artist:', artistId, artistName)
        const artistInfo = await subsonic.artists.getOne(artistId)

        console.log('[ArtistCollage] Artist info:', artistInfo)
        console.log('[ArtistCollage] Albums count:', artistInfo?.album?.length)
        console.log('[ArtistCollage] First album raw:', artistInfo?.album?.[0])

        if (artistInfo?.album) {
          // Сохраняем ВСЕ альбомы для корректного счётчика
          const totalAlbums = artistInfo.album.length
          
          // Берем первые 6 для коллажа
          const albums = artistInfo.album.slice(0, 6)
          const covers: string[] = []
          
          for (const album of albums) {
            console.log('[ArtistCollage] Processing album:', {
              id: album.id,
              name: album.name,
              coverArt: album.coverArt,
              artistImageUrl: album.artistImageUrl,
            })
            
            // Пытаемся получить URL обложки разными способами
            let coverUrl: string | undefined = undefined
            
            // Способ 1: через album.coverArt (основной)
            // Используем getSimpleCoverArtUrl для правильного URL с токеном
            if (album.coverArt) {
              coverUrl = getSimpleCoverArtUrl(album.coverArt, 'album', '300')
              console.log('[ArtistCollage] Using coverArt ID:', album.coverArt, '→ URL:', coverUrl)
            }
            // Способ 2: через album.id (альтернативный)
            else if (album.id) {
              coverUrl = getSimpleCoverArtUrl(album.id, 'album', '300')
              console.log('[ArtistCollage] Using album ID:', album.id, '→ URL:', coverUrl)
            }
            // Способ 3: через artistImageUrl (fallback)
            else if (album.artistImageUrl) {
              coverUrl = album.artistImageUrl
              console.log('[ArtistCollage] Using artistImageUrl:', coverUrl)
            }
            else {
              console.warn('[ArtistCollage] No cover found for album:', album.name)
            }
            
            if (coverUrl) {
              covers.push(coverUrl)
            }
          }

          console.log('[ArtistCollage] Final covers:', covers.length, covers)
          console.log('[ArtistCollage] Total albums:', totalAlbums)
          
          setAlbumCovers(covers)
          setTotalAlbums(totalAlbums)
        } else {
          console.warn('[ArtistCollage] No albums found for artist:', artistName)
        }
      } catch (error) {
        console.error('[ArtistCollage] Error loading albums:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadAlbums()
  }, [artistId, artistName])

  const handlePlayArtist = async () => {
    setIsPlaying(true)
    try {
      console.log('[ArtistCollage] Playing artist radio:', artistId, artistName)
      
      // Запускаем радио артиста через ML (похожие артисты + vibe similarity)
      const { generateArtistRadio } = await import('@/service/ml-wave-service')
      const result = await generateArtistRadio(artistId, 25)

      if (result.songs.length > 0) {
        console.log('[ArtistCollage] Starting radio:', result.songs.length, 'tracks')
        setSongList(result.songs, 0)
        toast(`▶️ Радио: ${artistName}`, { type: 'default' })
      } else {
        console.warn('[ArtistCollage] No songs found for artist radio')
        toast('❌ Не удалось запустить радио', { type: 'error' })
      }
    } catch (error) {
      console.error('[ArtistCollage] Error playing artist radio:', error)
      toast('❌ Ошибка при воспроизведении', { type: 'error' })
    } finally {
      setIsPlaying(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="aspect-square bg-muted flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden group hover:shadow-lg transition-all">
      <CardContent className="p-0 relative">
        {/* Коллаж из обложек */}
        <div 
          className={cn(
            "aspect-square grid gap-0.5",
            albumCovers.length >= 4 ? "grid-cols-2" : "grid-cols-1"
          )}
        >
          {albumCovers.map((coverUrl, index) => (
            <div
              key={index}
              className="relative overflow-hidden bg-muted"
            >
              <img
                src={coverUrl}
                alt={`${artistName} album ${index + 1}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          ))}
          
          {/* Если нет обложек - заглушка */}
          {albumCovers.length === 0 && (
            <div className="col-span-2 row-span-2 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-4xl font-bold text-white/50">
                {artistName.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Градиент поверх коллажа */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Кнопка Play */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            onClick={handlePlayArtist}
            disabled={isPlaying}
            size="icon"
            className="h-14 w-14 rounded-full shadow-lg"
          >
            {isPlaying ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Play className="h-6 w-6 fill-current" />
            )}
          </Button>
        </div>

        {/* Название артиста */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
          <h3 className="text-white font-semibold text-sm truncate">
            {artistName}
          </h3>
          <p className="text-white/70 text-xs">
            {totalAlbums > 0 ? totalAlbums : albumCovers.length} альбомов
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
