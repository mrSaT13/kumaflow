import { useQuery } from '@tanstack/react-query'
import { memo, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PodcastFallback } from '@/app/components/fallbacks/podcast-fallbacks'
import { EpisodeList } from '@/app/components/podcasts/episode-list'
import { PodcastInfo } from '@/app/components/podcasts/podcast-info'
import ErrorPage from '@/app/pages/error-page'
import { getPodcast } from '@/queries/podcasts'
import { queryKeys } from '@/utils/queryKeys'
import { useLocalPodcastsStore } from '@/store/local-podcasts.store'
import { parseEpisodesFromRSS } from '@/service/podcast-rss-parser'
import { usePlayerActions } from '@/store/player.store'
import { Play, Trash2 } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { toast } from 'react-toastify'

const MemoPodcastInfo = memo(PodcastInfo)
const MemoEpisodeList = memo(EpisodeList)

// Компонент для отображения списка локальных эпизодов
function LocalEpisodeList({ episodes, podcast }: { episodes: any[], podcast: any }) {
  const { setSongList } = usePlayerActions()
  
  const handlePlayEpisode = (episode: any, index: number) => {
    console.log('[Podcast] Playing episode:', episode.title, 'URL:', episode.audioUrl)
    
    const songs = episodes.map(ep => ({
      id: ep.id,
      title: ep.title,
      artist: podcast.author,
      album: podcast.title,
      coverArt: podcast.image_url,
      url: ep.audioUrl,  // Прямая ссылка на аудио
      isPodcast: true,
      isLocal: true,  // Важно! Чтобы плеер знал что это локальный подкаст
      duration: parseDuration(ep.duration),
    }))
    
    console.log('[Podcast] Setting song list with', songs.length, 'episodes')
    setSongList(songs, index)
  }
  
  return (
    <div className="w-full h-full overflow-y-auto p-4">
      <div className="space-y-2">
        {episodes.map((episode, index) => (
          <div
            key={episode.id}
            className="p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
            onClick={() => handlePlayEpisode(episode, index)}
          >
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation()
                  handlePlayEpisode(episode, index)
                }}
              >
                <Play className="w-5 h-5" />
              </Button>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{episode.title}</h3>
                <p className="text-sm text-muted-foreground truncate">
                  {new Date(episode.pubDate).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDurationDisplay(episode.duration)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function parseDuration(duration: string): number {
  if (!duration) return 0
  
  const parts = duration.split(':')
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  } else if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  }
  return parseInt(duration) || 0
}

function formatDurationDisplay(seconds: number): string {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function Podcast() {
  const { podcastId } = useParams() as { podcastId: string }
  const navigate = useNavigate()
  const [localPodcastEpisodes, setLocalPodcastEpisodes] = useState<any[]>([])
  const [isLoadingLocal, setIsLoadingLocal] = useState(false)
  
  // Функция удаления подкаста
  const handleDeletePodcast = () => {
    if (!localPodcast) return
    
    const { removePodcast } = useLocalPodcastsStore.getState()
    removePodcast(localPodcast.id)
    toast.success('Подкаст удалён')
    
    // Принудительный редирект на страницу со всеми подкастами
    // Используем window.location.hash для надёжности
    setTimeout(() => {
      window.location.hash = '/library/podcasts'
    }, 100)
  }
  
  // Проверяем, это локальный подкаст - ищем по всем возможным ID
  const localPodcast = useLocalPodcastsStore((state) => {
    // Пробуем разные варианты ID
    const cleanId = podcastId.replace('local-', '')
    return state.podcasts.find(p => 
      p.id === podcastId || 
      p.id === `local-${cleanId}` ||
      p.rssUrl.includes(cleanId)
    )
  })
  
  const isLocalPodcast = !!localPodcast

  const {
    data: podcast,
    isFetched,
    isLoading: podcastIsLoading,
  } = useQuery({
    queryKey: [queryKeys.podcast.one, podcastId],
    queryFn: () => getPodcast(podcastId),
    enabled: !isLocalPodcast, // Не делаем запрос для локальных
  })

  // Загружаем эпизоды для локального подкаста (из localStorage или RSS)
  useEffect(() => {
    if (!isLocalPodcast || !localPodcast) return
    
    // Если эпизоды уже загружены для этого подкаста - не загружаем снова
    if (localPodcastEpisodes.length > 0) return
    
    const loadEpisodes = async () => {
      setIsLoadingLocal(true)
      try {
        // Сначала пробуем загрузить из localStorage
        const cacheKey = `podcast-episodes-${localPodcast.id}`
        const cachedEpisodes = localStorage.getItem(cacheKey)
        
        if (cachedEpisodes) {
          console.log('[Podcast] Loading episodes from localStorage:', cacheKey)
          const episodes = JSON.parse(cachedEpisodes)
          setLocalPodcastEpisodes(episodes)
          setIsLoadingLocal(false)
          return
        }
        
        console.log('[Podcast] No cached episodes found for:', localPodcast.id)
        setIsLoadingLocal(false)
      } catch (error) {
        console.error('[Podcast] Error loading episodes:', error)
        setIsLoadingLocal(false)
      }
    }
    
    loadEpisodes()
  }, [isLocalPodcast, localPodcast?.id])

  if (podcastIsLoading || isLoadingLocal) return <PodcastFallback />
  
  if (isLocalPodcast) {
    // Отображаем локальный подкаст
    const localPodcastData = {
      id: localPodcast.id,
      title: localPodcast.title,
      author: localPodcast.author,
      description: localPodcast.description,
      coverArt: localPodcast.imageUrl,
      image_url: localPodcast.imageUrl,
      episode_count: localPodcast.episodeCount,
      isLocal: true,
    }
    
    const episodesForList = localPodcastEpisodes.map(ep => ({
      ...ep,
      podcast_id: localPodcast.id,
      podcast_title: localPodcast.title,
      author: localPodcast.author,
    }))
    
    return (
      <div className="h-full">
        <MemoPodcastInfo 
          podcast={localPodcastData} 
          episodes={episodesForList} 
          totalEpisodes={localPodcast.episodeCount}
          onDelete={handleDeletePodcast}
        />
        {isLoadingLocal ? (
          <div className="p-4 text-center text-muted-foreground">
            Загрузка эпизодов...
          </div>
        ) : episodesForList.length > 0 ? (
          <LocalEpisodeList episodes={episodesForList} podcast={localPodcastData} />
        ) : (
          <div className="p-4 text-center text-muted-foreground">
            Эпизоды не найдены
          </div>
        )}
      </div>
    )
  }
  
  if (isFetched && !podcast) {
    return <ErrorPage status={404} statusText="Not Found" />
  }
  if (!podcast) return <PodcastFallback />

  return (
    <div className="h-full">
      <MemoPodcastInfo podcast={podcast} />
      <MemoEpisodeList />
    </div>
  )
}
