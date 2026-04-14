/**
 * AppearsInCompilations - показывает сборники/плейлисты где участвует артист
 * Ищет альбомы-компиляции, сборники, OST где есть треки этого артиста
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { subsonic } from '@/service/subsonic'
import type { ISong } from '@/types/responses/song'
import { ROUTES } from '@/routes/routesList'
import { Card, CardContent } from '@/app/components/ui/card'
import { AspectRatio } from '@/app/components/ui/aspect-ratio'
import { ImageWithFallback } from '@/app/components/ui/image-with-fallback'
import { Skeleton } from '@/app/components/ui/skeleton'
import { Music, Disc } from 'lucide-react'

interface AppearsInCompilationsProps {
  artistId: string
  artistName: string
}

interface FoundAlbum {
  id: string
  name: string
  coverArt: string
  artist: string
  year?: string
  songCount: number
  type: 'compilation' | 'soundtrack' | 'various' | 'playlist'
}

// Ключевые слова для определения типа альбома
const COMPILATION_KEYWORDS = [
  'compilation', 'сборник', 'various artists', 'various', 'va -',
  'greatest hits', 'best of', 'хиты', 'легенды', 'коллекция',
  'anthology', 'антология', 'essentials'
]

const SOUNDTRACK_KEYWORDS = [
  'ost', 'soundtrack', 'саундтрек', 'кино', 'фильм', 'movie',
  'игра', 'game', 'сериал', 'tv series'
]

export function AppearsInCompilations({ artistId, artistName }: AppearsInCompilationsProps) {
  const navigate = useNavigate()
  const [albums, setAlbums] = useState<FoundAlbum[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 1. Ищем треки артиста в библиотеке и находим сборники
  useEffect(() => {
    const fetchCompilations = async () => {
      setIsLoading(true)
      const foundAlbumsMap = new Map<string, FoundAlbum>()

      try {
        // Способ 1: Ищем через search3 по имени артиста
        const searchResult = await subsonic.search2({
          query: artistName,
          albumCount: 50,
          songCount: 0,
          artistCount: 0,
        })

        if (searchResult?.album) {
          for (const album of searchResult.album) {
            // Проверяем является ли альбом сборником/саундтреком
            const albumName = (album.name || '').toLowerCase()
            const albumGenre = (album.genre || '').toLowerCase()

            const isCompilation = COMPILATION_KEYWORDS.some(kw =>
              albumName.includes(kw) || albumGenre.includes(kw)
            )
            const isSoundtrack = SOUNDTRACK_KEYWORDS.some(kw =>
              albumName.includes(kw) || albumGenre.includes(kw)
            )

            // Проверяем участвует ли артист (имя артиста в альбоме отличается от имени albumArtist)
            const hasVariousArtists = albumName.includes('various') || albumName.includes('сборник')

            if (isCompilation || isSoundtrack || hasVariousArtists) {
              const albumType: FoundAlbum['type'] = isSoundtrack ? 'soundtrack' :
                hasVariousArtists ? 'various' : 'compilation'

              foundAlbumsMap.set(album.id, {
                id: album.id,
                name: album.name,
                coverArt: album.coverArt || '',
                artist: album.artist || 'Various Artists',
                year: album.year?.toString(),
                songCount: album.songCount || 0,
                type: albumType,
              })
            }
          }
        }

        // Способ 2: Берём треки артиста и смотрим их альбомы
        const artist = await subsonic.artists.getOne(artistId).catch(() => null)
        if (artist?.album) {
          for (const album of artist.album) {
            const albumName = (album.name || '').toLowerCase()
            const albumGenre = (album.genre || '').toLowerCase()

            const isCompilation = COMPILATION_KEYWORDS.some(kw =>
              albumName.includes(kw) || albumGenre.includes(kw)
            )
            const isSoundtrack = SOUNDTRACK_KEYWORDS.some(kw =>
              albumName.includes(kw) || albumGenre.includes(kw)
            )

            if (isCompilation || isSoundtrack) {
              const albumType: FoundAlbum['type'] = isSoundtrack ? 'soundtrack' : 'compilation'

              if (!foundAlbumsMap.has(album.id)) {
                foundAlbumsMap.set(album.id, {
                  id: album.id,
                  name: album.name,
                  coverArt: album.coverArt || '',
                  artist: album.artist || 'Various Artists',
                  year: album.year?.toString(),
                  songCount: album.songCount || 0,
                  type: albumType,
                })
              }
            }
          }
        }

        // Берем первые 10 уникальных альбомов
        const result = Array.from(foundAlbumsMap.values()).slice(0, 10)
        setAlbums(result)
      } catch (error) {
        console.error('[AppearsInCompilations] Error fetching:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchCompilations()
  }, [artistId, artistName])

  if (albums.length === 0 && !isLoading) return null

  return (
    <div className="mt-8 mb-4">
      <h2 className="text-2xl font-bold mb-4 px-4 flex items-center gap-2">
        <Disc className="w-6 h-6" />
        Участвует в сборниках
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 px-4">
        {isLoading ? (
          // Скелетоны загрузки
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-square w-full rounded-md" />
              <Skeleton className="h-4 w-3/4 mx-auto" />
            </div>
          ))
        ) : (
          albums.map(album => (
            <Card
              key={album.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors group overflow-hidden bg-transparent border-0"
              onClick={() => navigate(ROUTES.ALBUM.PAGE(album.id))}
            >
              <CardContent className="p-0">
                <AspectRatio ratio={1} className="bg-muted rounded-md overflow-hidden mb-2 relative">
                  <ImageWithFallback
                    src={album.coverArt}
                    alt={album.name}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                    fallback={<div className="w-full h-full flex items-center justify-center text-muted-foreground"><Music size={40} /></div>}
                  />
                  {/* Бейдж типа */}
                  <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    {album.type === 'soundtrack' ? 'OST' :
                     album.type === 'various' ? 'VA' : 'Сборник'}
                  </div>
                </AspectRatio>
                <div className="text-center text-sm font-medium truncate px-1" title={album.name}>
                  {album.name}
                </div>
                {album.year && (
                  <div className="text-center text-xs text-muted-foreground">
                    {album.year}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
