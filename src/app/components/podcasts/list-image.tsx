import { useState } from 'react'
import { LazyLoadImage } from 'react-lazy-load-image-component'
import { Podcast } from '@/types/responses/podcasts'

interface ListImageProps {
  podcast: Podcast & { isLocal?: boolean; imageUrl?: string; coverArt?: string }
}

const placeholderSrc = '/default_podcast_art.png'

export function PodcastListImage({ podcast }: ListImageProps) {
  // Для локальных подкастов используем imageUrl или coverArt
  const initialSrc = podcast.isLocal 
    ? (podcast.imageUrl || podcast.coverArt || placeholderSrc)
    : podcast.image_url
  
  const [imageSrc, setImageSrc] = useState(initialSrc)

  const handleError = () => {
    setImageSrc(placeholderSrc)
  }

  return (
    <LazyLoadImage
      src={imageSrc}
      alt={podcast.title}
      effect="opacity"
      width="100%"
      height="100%"
      className="aspect-square object-cover w-full h-full absolute inset-0 z-0"
      data-testid="podcast-card-image"
      onError={handleError}
    />
  )
}
