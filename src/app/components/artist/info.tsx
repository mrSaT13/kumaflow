import { Fragment, useState, useEffect } from 'react'
import { CollapsibleInfo } from '@/app/components/info/collapsible-info'
import { useGetArtistInfo } from '@/app/hooks/use-artist'
import { IArtist } from '@/types/responses/artist'
import { ArtistButtons } from './buttons'
import { wikipediaService } from '@/service/wikipedia-api'
import { Button } from '@/app/components/ui/button'
import { Instagram, Youtube, Twitter, Facebook, Globe, Music, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'

interface ArtistInfoProps {
  artist: IArtist
}

export function ArtistInfo({ artist }: ArtistInfoProps) {
  const { data: artistInfo } = useGetArtistInfo(artist.id)
  const [socialLinks, setSocialLinks] = useState<any>(null)
  const [wikiBio, setWikiBio] = useState<string>('')
  const [currentBioSource, setCurrentBioSource] = useState<'wikipedia' | 'musicbrainz'>('wikipedia')

  // Загрузка Wikipedia био
  useEffect(() => {
    setWikiBio('')
    
    const loadWiki = async () => {
      const wikiInfo = await wikipediaService.searchArtist(artist.name)
      if (wikiInfo?.bio) {
        setWikiBio(wikiInfo.bio)
      }
      if (wikiInfo?.socialLinks) {
        setSocialLinks(wikiInfo.socialLinks)
      }
    }

    loadWiki()
  }, [artist.name])

  // Определяем доступные источники
  const hasWiki = !!wikiBio
  const hasMB = !!artistInfo?.biography
  
  // Количество доступных источников
  const sourceCount = (hasWiki ? 1 : 0) + (hasMB ? 1 : 0)
  
  // Показываем стрелки только если есть 2+ источника
  const showArrows = sourceCount >= 2
  
  // Текущая биография
  const currentBio = currentBioSource === 'wikipedia' ? wikiBio : artistInfo?.biography
  const currentSourceName = currentBioSource === 'wikipedia' ? 'Wikipedia' : 'MusicBrainz'
  const hasInfoToShow = !!currentBio
  
  // Отладка
  console.log('[ArtistInfo] Sources:', { hasWiki, hasMB, sourceCount, showArrows, currentBioSource })

  const isArtistEmpty =
    artist.albumCount === undefined || artist.albumCount === 0

  // Отображение соцсетей
  const hasSocialLinks = socialLinks && Object.keys(socialLinks).length > 0

  return (
    <Fragment>
      <ArtistButtons
        artist={artist}
        showInfoButton={hasInfoToShow}
        isArtistEmpty={isArtistEmpty}
      />

      {hasInfoToShow && (
        <div className="space-y-2">
          {/* Заголовок с переключателем источников */}
          {showArrows && (
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Переключаем на предыдущий источник
                  if (currentBioSource === 'musicbrainz' && hasWiki) {
                    setCurrentBioSource('wikipedia')
                  } else if (currentBioSource === 'wikipedia' && hasMB) {
                    setCurrentBioSource('musicbrainz')
                  }
                }}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span className="text-xs text-muted-foreground">
                {currentSourceName}
              </span>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // Переключаем на следующий источник
                  if (currentBioSource === 'wikipedia' && hasMB) {
                    setCurrentBioSource('musicbrainz')
                  } else if (currentBioSource === 'musicbrainz' && hasWiki) {
                    setCurrentBioSource('wikipedia')
                  }
                }}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          {!showArrows && (
            <span className="text-xs text-muted-foreground">
              {currentSourceName}
            </span>
          )}
          
          <CollapsibleInfo
            title={artist.name}
            bio={currentBio}
            lastFmUrl={artistInfo?.lastFmUrl}
            musicBrainzId={artistInfo?.musicBrainzId}
            useStateInfo={!isArtistEmpty}
          />
        </div>
      )}

      {/* Секция соцсетей */}
      {hasSocialLinks && (
        <div className="mt-4 p-4 rounded-lg bg-muted/50">
          <h3 className="text-sm font-medium mb-3">Соцсети</h3>
          <div className="flex flex-wrap gap-2">
            {socialLinks.instagram && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(socialLinks.instagram, '_blank')}
                className="gap-2"
              >
                <Instagram className="h-4 w-4" />
                Instagram
              </Button>
            )}
            {socialLinks.youtube && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(socialLinks.youtube, '_blank')}
                className="gap-2"
              >
                <Youtube className="h-4 w-4" />
                YouTube
              </Button>
            )}
            {socialLinks.twitter && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(socialLinks.twitter, '_blank')}
                className="gap-2"
              >
                <Twitter className="h-4 w-4" />
                Twitter
              </Button>
            )}
            {socialLinks.facebook && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(socialLinks.facebook, '_blank')}
                className="gap-2"
              >
                <Facebook className="h-4 w-4" />
                Facebook
              </Button>
            )}
            {socialLinks.spotify && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(socialLinks.spotify, '_blank')}
                className="gap-2"
              >
                <Music className="h-4 w-4" />
                Spotify
              </Button>
            )}
            {socialLinks.website && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(socialLinks.website, '_blank')}
                className="gap-2"
              >
                <Globe className="h-4 w-4" />
                Сайт
              </Button>
            )}
          </div>
        </div>
      )}
    </Fragment>
  )
}
