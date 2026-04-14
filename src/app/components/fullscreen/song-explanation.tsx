import { useMemo, useState } from 'react'
import { explainRecommendation } from '@/service/explainable-ai'
import { useML } from '@/store/ml.store'
import { usePlayerStore } from '@/store/player.store'
import { Button } from '@/app/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/popover'
import { Info, Music, User, Tag, Activity, Zap, Compass } from 'lucide-react'
import { useSongList } from '@/app/hooks/use-song-list'
import { ROUTES } from '@/routes/routesList'

const explanationIcons: Record<Explanation['type'], React.ReactNode> = {
  'similar-track': <Music className="w-3 h-3" />,
  'similar-artist': <User className="w-3 h-3" />,
  'genre-match': <Tag className="w-3 h-3" />,
  'bpm-match': <Activity className="w-3 h-3" />,
  'energy-match': <Zap className="w-3 h-3" />,
  'new-discovery': <Compass className="w-3 h-3" />,
}

const explanationColors: Record<Explanation['type'], string> = {
  'similar-track': 'text-blue-400',
  'similar-artist': 'text-green-400',
  'genre-match': 'text-purple-400',
  'bpm-match': 'text-orange-400',
  'energy-match': 'text-yellow-400',
  'new-discovery': 'text-pink-400',
}

interface Explanation {
  type: 'similar-track' | 'similar-artist' | 'genre-match' | 'bpm-match' | 'energy-match' | 'new-discovery'
  text: string
  details?: {
    trackId?: string
    albumId?: string  // Добавили albumId
    genreRank?: number
  }
}

export function FullscreenSongExplanation() {
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const { getProfile, ratings } = useML()
  const { getArtistAllSongs } = useSongList()
  const [open, setOpen] = useState(false)
  
  const explanations = useMemo(() => {
    if (!currentSong) return []
    const profile = getProfile()
    return explainRecommendation(currentSong, profile, ratings).slice(0, 3)
  }, [currentSong, getProfile, ratings])
  
  if (!currentSong || explanations.length === 0) {
    return null
  }
  
  const handleNavigateToArtist = async () => {
    try {
      const songs = await getArtistAllSongs(currentSong.artist)
      if (songs && songs.length > 0) {
        window.location.hash = `/artists/${songs[0].artistId}`
      }
    } catch (error) {
      console.error('Failed to navigate to artist:', error)
    }
  }
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-8 h-8 p-0 hover:bg-muted/50 rounded-full"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(true)
          }}
          title="Почему этот трек рекомендован"
        >
          <Info className="w-4 h-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end" side="right">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 pb-1.5 border-b">
            <Info className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-medium">Почему этот трек:</p>
          </div>
          {explanations.map((exp, index) => (
            <div 
              key={index}
              className="flex items-start gap-1.5 text-xs"
            >
              <span className={`${explanationColors[exp.type]} mt-0.5`}>
                {explanationIcons[exp.type]}
              </span>
              <span className="text-muted-foreground flex-1">
                {exp.text}
              </span>
              {exp.type === 'similar-track' && exp.details?.trackId && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="h-auto p-0 text-[10px]"
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      // Получаем информацию о треке чтобы узнать albumId
                      const { subsonic } = await import('@/service/subsonic')
                      const songInfo = await subsonic.songs.getSong(exp.details.trackId!)
                      if (songInfo && songInfo.albumId) {
                        // Переходим на страницу альбома с этим треком
                        window.location.hash = ROUTES.ALBUM.PAGE(songInfo.albumId)
                      } else {
                        // Фоллбэк: просто страница songs
                        window.location.hash = `/library/songs?songId=${exp.details.trackId}`
                      }
                    } catch (error) {
                      console.error('Failed to navigate to song album:', error)
                    }
                    setOpen(false)
                  }}
                >
                  Трек
                </Button>
              )}
              {exp.type === 'similar-artist' && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="h-auto p-0 text-[10px]"
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      const songs = await getArtistAllSongs(currentSong.artist)
                      if (songs && songs.length > 0) {
                        window.location.hash = `/library/artists/${songs[0].artistId}`
                      }
                    } catch (error) {
                      console.error('Failed to navigate to artist:', error)
                    }
                    setOpen(false)
                  }}
                >
                  Артист
                </Button>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
