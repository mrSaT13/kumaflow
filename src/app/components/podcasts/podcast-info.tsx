import { GlobeIcon, RssIcon, Play, Music2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Dot } from '@/app/components/dot'
import { Button } from '@/app/components/ui/button'
import { Separator } from '@/app/components/ui/separator'
import { Podcast } from '@/types/responses/podcasts'
import { parseHtmlToText } from '@/utils/parseTexts'
import { PodcastInfoContainer } from './info/container'
import { PodcastInfoImage } from './info/image'
import { Description, Details, Root, Subtitle, Title } from './info/texts'
import { UnfollowButton } from './unfollow-button'
import { usePlayerActions } from '@/store/player.store'
import { useState } from 'react'

interface PodcastInfoProps {
  podcast: Podcast & { isLocal?: boolean }
  episodes?: any[]
  totalEpisodes?: number
  onDelete?: () => void
}

export function PodcastInfo({ podcast, episodes, totalEpisodes, onDelete }: PodcastInfoProps) {
  const { t } = useTranslation()
  const { setSongList } = usePlayerActions()
  const [imageError, setImageError] = useState(false)

  const handlePlayAll = () => {
    if (!episodes || episodes.length === 0) return
    
    const songs = episodes.map(ep => ({
      id: ep.id,
      title: ep.title,
      artist: podcast.author,
      album: podcast.title,
      coverArt: podcast.coverArt || podcast.image_url,
      url: ep.audioUrl,
      isPodcast: true,
      isLocal: podcast.isLocal,
      duration: parseDuration(ep.duration),
    }))
    
    setSongList(songs, 0)
  }
  
  const imageUrl = podcast.isLocal && !imageError 
    ? podcast.image_url || podcast.coverArt 
    : null

  return (
    <PodcastInfoContainer>
      {imageUrl ? (
        <PodcastInfoImage 
          src={imageUrl} 
          alt={podcast.title}
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="w-full aspect-square bg-muted flex items-center justify-center rounded-lg">
          <Music2 className="w-24 h-24 text-muted-foreground/50" />
        </div>
      )}

      <Root>
        <div className="flex gap-3 items-center">
          <Title>{podcast.title}</Title>
          {podcast.isLocal ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={handlePlayAll}
                disabled={!episodes || episodes.length === 0}
              >
                <Play className="w-4 h-4 mr-2" />
                Слушать
              </Button>
              {onDelete && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ) : (
            <UnfollowButton title={podcast.title} podcastId={podcast.id} />
          )}
        </div>
        <Subtitle>{podcast.author}</Subtitle>
        <Separator />
        <Description>{parseHtmlToText(podcast.description)}</Description>
        <Details.Root>
          <Details.Text>
            {t('podcasts.header.episodeCount', {
              count: podcast.episode_count,
            })}
          </Details.Text>
          {podcast.isLocal && totalEpisodes && totalEpisodes > podcast.episode_count && (
            <>
              <Dot />
              <Details.Text>
                {podcast.episode_count} из {totalEpisodes} доступно
              </Details.Text>
            </>
          )}
          {!podcast.isLocal && (
            <>
              <Dot />
              <Details.Link href={podcast.feed_url}>
                <RssIcon className="w-4 h-4" />
                {t('podcasts.header.feed')}
              </Details.Link>
              {podcast.link && (
                <>
                  <Dot />
                  <Details.Link href={podcast.link}>
                    <GlobeIcon className="w-4 h-4" />
                    {t('podcasts.header.website')}
                  </Details.Link>
                </>
              )}
            </>
          )}
        </Details.Root>
      </Root>
    </PodcastInfoContainer>
  )
}

function parseDuration(duration: string): number {
  if (!duration) return 0
  
  // Форматы: "1:23:45", "23:45", "90" (секунды)
  const parts = duration.split(':')
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  } else if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  }
  return parseInt(duration) || 0
}
