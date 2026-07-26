import { memo } from 'react'
import { Dot } from '@/app/components/dot'
import { MarqueeTitle } from '@/app/components/fullscreen/marquee-title'
import { SongQualityBadge } from '@/app/components/song/quality-badge'
import { Badge } from '@/app/components/ui/badge'
import { usePlayerStore } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'
import { FullscreenSongImage } from './song-image'
import { FullscreenSongExplanation } from './song-explanation'

const MemoFullscreenSongImage = memo(FullscreenSongImage)
const MemoFullscreenSongExplanation = memo(FullscreenSongExplanation)

export function SongInfo() {
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)

  return (
    <div className="flex h-full min-h-0 max-h-full flex-1 flex-col items-center justify-start gap-4 overflow-hidden pt-1 md:flex-row md:items-center md:justify-start md:pt-2 2xl:gap-6">
      <MemoFullscreenSongImage />

      <div className="relative flex h-auto w-full max-w-full flex-col justify-end overflow-hidden text-center md:h-full md:max-h-[450px] md:w-[66%] md:text-left 2xl:max-h-[550px]">
        {/* Кнопка объяснений */}
        <div className="absolute top-0 right-0 z-10">
          <MemoFullscreenSongExplanation />
        </div>

        <MarqueeTitle gap="mr-6">
          <h2 className="scroll-m-20 py-1 text-2xl font-bold tracking-tight text-shadow-md sm:text-3xl md:py-2 md:text-4xl 2xl:py-3 2xl:text-5xl">
            {currentSong.title}
          </h2>
        </MarqueeTitle>
        <div className="flex flex-wrap items-center justify-center gap-1 truncate text-sm text-foreground/70 maskImage-marquee-fade-finished md:justify-start md:text-base 2xl:text-lg">
          <p className="truncate text-shadow-lg text-foreground">
            {currentSong.album}
          </p>
          <Dot className="text-foreground/70" />
          <ArtistNames song={currentSong} />
        </div>
        <div className="mb-[1px] mt-2 flex flex-wrap justify-center gap-2 md:justify-start 2xl:mt-3">
          {currentSong.genre && (
            <Badge variant="neutral">{currentSong.genre}</Badge>
          )}
          {currentSong.year && (
            <Badge variant="neutral">{currentSong.year}</Badge>
          )}
          {currentSong.bpm && currentSong.bpm > 0 && (
            <Badge variant="neutral" title="Beats Per Minute">
              {currentSong.bpm} BPM
            </Badge>
          )}
          {currentSong.moods && currentSong.moods.length > 0 && (
            <Badge variant="neutral">
              {currentSong.moods.join(', ')}
            </Badge>
          )}
          <SongQualityBadge song={currentSong} variant="neutral" />
        </div>
      </div>
    </div>
  )
}

function ArtistNames({ song }: { song: ISong }) {
  const { artist, artists } = song

  if (artists && artists.length > 1) {
    const data = artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)

    return (
      <div className="flex items-center gap-1">
        {data.map(({ id, name }, index) => (
          <div key={id} className="flex">
            <p className="truncate text-shadow-lg">{name}</p>
            {index < data.length - 1 && ','}
          </div>
        ))}
      </div>
    )
  }

  return <p className="truncate text-shadow-lg">{artist}</p>
}
