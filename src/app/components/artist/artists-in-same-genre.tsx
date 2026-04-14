/**
 * ArtistsInSameGenre - список исполнителей в том же жанре
 * Показывает других артистов, у которых есть треки в тех же жанрах,
 * что и у текущего артиста.
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRandomSongs, getSongsByGenre } from '@/service/subsonic-api'
import type { ISong } from '@/types/responses/song'
import { ROUTES } from '@/routes/routesList'
import { Card, CardContent } from '@/app/components/ui/card'
import { AspectRatio } from '@/app/components/ui/aspect-ratio'
import { ImageWithFallback } from '@/app/components/ui/image-with-fallback'
import { Skeleton } from '@/app/components/ui/skeleton'
import { User } from 'lucide-react'

interface ArtistsInSameGenreProps {
  topSongs: ISong[]
  currentArtistId: string
}

interface FoundArtist {
  id: string
  name: string
  coverArt: string
  artistImageUrl: string
}

export function ArtistsInSameGenre({ topSongs, currentArtistId }: ArtistsInSameGenreProps) {
  const navigate = useNavigate()
  const [artists, setArtists] = useState<FoundArtist[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 1. Собираем уникальные жанры из топ-треков
  const genres = useMemo(() => {
    const genreSet = new Set<string>()
    topSongs.forEach(song => {
      if (song.genre) genreSet.add(song.genre.toLowerCase())
    })
    return Array.from(genreSet).slice(0, 3) // Берем топ-3 жанра
  }, [topSongs])

  // 2. Загружаем артистов из этих жанров
  useEffect(() => {
    if (genres.length === 0) return

    const fetchArtists = async () => {
      setIsLoading(true)
      const foundArtistsMap = new Map<string, FoundArtist>()

      try {
        // Для каждого жанра ищем треки
        for (const genre of genres) {
          const songs = await getRandomSongs(50, genre)
          
          for (const song of songs) {
            if (song.artistId === currentArtistId) continue // Пропускаем текущего артиста
            if (!song.artist || !song.artistId) continue
            if (foundArtistsMap.has(song.artistId)) continue

            foundArtistsMap.set(song.artistId, {
              id: song.artistId,
              name: song.artist,
              coverArt: song.coverArt || '',
              artistImageUrl: '',
            })
          }
        }

        // Берем первые 10 уникальных артистов
        const result = Array.from(foundArtistsMap.values()).slice(0, 10)
        setArtists(result)
      } catch (error) {
        console.error('[ArtistsInSameGenre] Error fetching:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchArtists()
  }, [genres, currentArtistId])

  if (artists.length === 0 && !isLoading) return null

  return (
    <div className="mt-8 mb-4">
      <h2 className="text-2xl font-bold mb-4 px-4">
        Исполнители в жанре: <span className="text-muted-foreground text-lg">{genres.join(', ')}</span>
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
          artists.map(artist => (
            <Card
              key={artist.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors group overflow-hidden bg-transparent border-0"
              onClick={() => navigate(ROUTES.ARTIST.PAGE(artist.id, artist.name))}
            >
              <CardContent className="p-0">
                <AspectRatio ratio={1} className="bg-muted rounded-md overflow-hidden mb-2 relative">
                  <ImageWithFallback
                    src={artist.coverArt}
                    alt={artist.name}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                    fallback={<div className="w-full h-full flex items-center justify-center text-muted-foreground"><User size={40} /></div>}
                  />
                </AspectRatio>
                <div className="text-center text-sm font-medium truncate px-1" title={artist.name}>
                  {artist.name}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
