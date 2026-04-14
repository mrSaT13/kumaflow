import { useMemo } from 'react'
import { explainRecommendation, type Explanation } from '@/service/explainable-ai'
import { useML } from '@/store/ml.store'
import { usePlayerStore } from '@/store/player.store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Info, Music, User, Tag, Activity, Zap, Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/routes/routesList'
import { useSongList } from '@/app/hooks/use-song-list'

const explanationIcons: Record<Explanation['type'], React.ReactNode> = {
  'similar-track': <Music className="w-4 h-4" />,
  'similar-artist': <User className="w-4 h-4" />,
  'genre-match': <Tag className="w-4 h-4" />,
  'bpm-match': <Activity className="w-4 h-4" />,
  'energy-match': <Zap className="w-4 h-4" />,
  'new-discovery': <Compass className="w-4 h-4" />,
}

const explanationColors: Record<Explanation['type'], string> = {
  'similar-track': 'text-blue-400',
  'similar-artist': 'text-green-400',
  'genre-match': 'text-purple-400',
  'bpm-match': 'text-orange-400',
  'energy-match': 'text-yellow-400',
  'new-discovery': 'text-pink-400',
}

export function FullscreenExplanation() {
  const navigate = useNavigate()
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const { getProfile, ratings } = useML()
  const { getArtistAllSongs } = useSongList()
  
  const explanations = useMemo(() => {
    if (!currentSong) return []
    const profile = getProfile()
    return explainRecommendation(currentSong, profile, ratings)
  }, [currentSong, getProfile, ratings])
  
  if (!currentSong || explanations.length === 0) {
    return null
  }
  
  const handleNavigateToArtist = async (artistName: string) => {
    try {
      const songs = await getArtistAllSongs(artistName)
      if (songs && songs.length > 0) {
        navigate(ROUTES.ARTIST.PAGE(songs[0].artistId))
      }
    } catch (error) {
      console.error('Failed to navigate to artist:', error)
    }
  }
  
  return (
    <Card className="bg-background/50 backdrop-blur-sm border-white/10">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Info className="w-5 h-5 text-muted-foreground" />
          <CardTitle className="text-lg">Почему этот трек:</CardTitle>
        </div>
        <CardDescription className="text-sm">
          Рекомендации на основе твоих предпочтений
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {explanations.map((exp, index) => (
          <div 
            key={index}
            className="flex items-center gap-2 text-sm flex-wrap"
          >
            <span className={explanationColors[exp.type]}>
              {explanationIcons[exp.type]}
            </span>
            <span className="text-muted-foreground">
              {exp.text}
            </span>
            
            {/* Кликабельные элементы */}
            {exp.type === 'similar-track' && exp.details?.trackId && (
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-xs"
                onClick={() => navigate(ROUTES.SONG.PAGE(exp.details.trackId!))}
              >
                → Трек
              </Button>
            )}
            {exp.type === 'similar-artist' && (
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-xs"
                onClick={() => handleNavigateToArtist(currentSong.artist)}
              >
                → Артист
              </Button>
            )}
            {exp.type === 'genre-match' && (
              <span className="text-xs text-muted-foreground">
                (топ-{exp.details?.genreRank})
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
