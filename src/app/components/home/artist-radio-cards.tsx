/**
 * Artist Radio Cards - Радио по артистам
 * Персональные карточки топ артистов пользователя (стиль как у жанров)
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerActions } from '@/store/player.store'
import { useML } from '@/store/ml.store'
import { generateArtistRadio } from '@/service/ml-wave-service'
import { subsonic } from '@/service/subsonic'
import { toast } from 'react-toastify'
import { Radio, Play } from 'lucide-react'
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from '@/app/components/ui/carousel'
import type { IArtist } from '@/types/responses/artist'
import { ArtistCollageCard } from '@/app/components/homepage/artist-collage-card'

// Градиенты для жанров
const GENRE_GRADIENTS: Record<string, string> = {
  'Rock': 'from-red-600 via-red-500 to-orange-500',
  'Metal': 'from-gray-900 via-gray-800 to-black',
  'Pop': 'from-pink-500 via-purple-500 to-indigo-500',
  'Hip-Hop': 'from-yellow-600 via-orange-600 to-red-700',
  'rap': 'from-yellow-600 via-orange-600 to-red-700',
  'Electronic': 'from-blue-600 via-purple-600 to-pink-600',
  'Jazz': 'from-amber-700 via-amber-600 to-orange-700',
  'Classical': 'from-indigo-900 via-purple-900 to-indigo-800',
  'R&B': 'from-purple-800 via-purple-700 to-pink-800',
  'Latin': 'from-red-600 via-orange-500 to-yellow-500',
  'Indie': 'from-teal-500 via-emerald-500 to-green-600',
  'Folk': 'from-green-700 via-emerald-600 to-teal-700',
  'rusrap': 'from-red-700 via-orange-700 to-yellow-700',
  'rusrock': 'from-blue-700 via-indigo-700 to-purple-700',
  'kpop': 'from-pink-400 via-purple-400 to-indigo-500',
  'dance': 'from-cyan-500 via-blue-500 to-purple-600',
  'house': 'from-violet-600 via-purple-600 to-fuchsia-700',
  'techno': 'from-gray-700 via-gray-600 to-slate-700',
  'trance': 'from-indigo-600 via-purple-600 to-pink-700',
  'ambient': 'from-blue-400 via-cyan-400 to-teal-500',
  'lo-fi': 'from-purple-400 via-pink-400 to-rose-500',
  'soundtrack': 'from-yellow-700 via-amber-700 to-orange-800',
  'videogame': 'from-green-500 via-emerald-500 to-teal-600',
}

const getGradientForArtist = (genre?: string): string => {
  if (!genre) return 'from-gray-500 via-gray-600 to-gray-700'
  
  if (GENRE_GRADIENTS[genre]) return GENRE_GRADIENTS[genre]
  
  const normalizedGenre = genre.toLowerCase().trim()
  for (const [key, gradient] of Object.entries(GENRE_GRADIENTS)) {
    if (normalizedGenre.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedGenre)) {
      return gradient
    }
  }
  
  return 'from-gray-500 via-gray-600 to-gray-700'
}

interface ArtistWithGradient extends IArtist {
  gradient: string
}

export default function ArtistRadioCards() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const { profile } = useML()
  const [isLoading, setIsLoading] = useState<string | null>(null)
  const [topArtists, setTopArtists] = useState<ArtistWithGradient[]>([])
  const [api, setApi] = useState<CarouselApi>()

  // Загружаем топ артистов
  useEffect(() => {
    async function loadTopArtists() {
      const topArtistIds = Object.entries(profile.preferredArtists || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([id, _]) => id)

      if (topArtistIds.length === 0) return

      const loadedArtists: ArtistWithGradient[] = []
      for (const artistId of topArtistIds) {
        try {
          const artist = await subsonic.artists.getOne(artistId)
          if (artist) {
            const genre = artist.genre || ''
            const gradient = getGradientForArtist(genre)
            
            loadedArtists.push({
              ...artist,
              gradient,
            })
          }
        } catch (error) {
          console.error('Ошибка загрузки артиста:', error)
        }
      }
      
      setTopArtists(loadedArtists)
    }
    
    loadTopArtists()
  }, [profile.preferredArtists])

  const handlePlayArtistRadio = async (artistId: string, artistName: string) => {
    if (isLoading) return
    
    setIsLoading(artistId)
    
    try {
      const result = await generateArtistRadio(artistId, 25)
      
      if (result.songs.length > 0) {
        setSongList(result.songs, 0, false)
        toast.success(`▶️ Радио: ${artistName}`, { autoClose: 2000 })
      }
    } catch (error) {
      console.error('Ошибка запуска радио:', error)
      toast.error(`Не удалось запустить радио: ${artistName}`)
    } finally {
      setIsLoading(null)
    }
  }

  if (topArtists.length === 0) {
    return null
  }

  return (
    <div className="px-8 pb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-orange-500" />
          <h2 className="text-xl font-bold">Радио артистов</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
            onClick={() => api?.scrollPrev()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <button
            className="w-8 h-8 rounded-lg bg-muted hover:bg-accent flex items-center justify-center transition-colors"
            onClick={() => api?.scrollNext()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </button>
          <button 
            className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => navigate('/library/artists')}
          >
            Все артисты →
          </button>
        </div>
      </div>

      <Carousel
        setApi={setApi}
        opts={{
          align: 'start',
          slidesToScroll: 8,
          containScroll: 'trimSnaps',
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-4">
          {topArtists.map((artist) => (
            <CarouselItem key={artist.id} className="pl-4 basis-1/8 sm:basis-1/6 md:basis-1/5 lg:basis-1/6 xl:basis-1/8">
              <ArtistCollageCard
                artistId={artist.id}
                artistName={artist.name}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </div>
  )
}
