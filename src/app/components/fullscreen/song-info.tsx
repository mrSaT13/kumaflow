import { memo } from 'react'
import { Dot } from '@/app/components/dot'
import { MarqueeTitle } from '@/app/components/fullscreen/marquee-title'
import { ArtistAvatar } from '@/app/components/fullscreen/artist-avatar'
import { SongQualityBadge } from '@/app/components/song/quality-badge'
import { Badge } from '@/app/components/ui/badge'
import { usePlayerStore, selectCurrentSong,
} from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'
import { FullscreenSongImage } from './song-image'
import { FullscreenSongExplanation } from './song-explanation'

const MemoFullscreenSongImage = memo(FullscreenSongImage)
const MemoFullscreenSongExplanation = memo(FullscreenSongExplanation)

/**
 * Вкладка "Сейчас играет" — вертикальная компоновка как дефолтный
 * NowPlaying мобайла: большая обложка по центру, под ней ряд
 * "кружок артиста + название/артист + объяснение", бейджи по центру.
 * Прогресс и контролы живут в нижней строке (FullscreenPlayer) — как было.
 */
export function SongInfo() {
  const currentSong = usePlayerStore(selectCurrentSong)

  return (
    <div className="flex flex-col items-center h-full min-h-full max-h-full w-full max-w-[560px] mx-auto gap-4 overflow-y-auto py-4 px-4">
      {/* Обложка по центру, как в мобайле (~80% ширины колонки) */}
      <MemoFullscreenSongImage centered />

      {/* Ряд как мобильный _SongInfo: кружок артиста + название/артист + действия */}
      <div className="flex items-center gap-3 w-full">
        <ArtistAvatar song={currentSong} clickable={false} />
        <div className="flex-1 min-w-0 text-left">
          <MarqueeTitle gap="mr-2">
            <h2 className="scroll-m-20 text-xl 2xl:text-2xl font-bold tracking-tight py-1 text-shadow-md truncate">
              {currentSong.title}
            </h2>
          </MarqueeTitle>
          <div className="text-sm 2xl:text-base flex gap-1 text-foreground/70 truncate maskImage-marquee-fade-finished">
            <p className="truncate text-shadow-lg text-foreground">
              {currentSong.album}
            </p>
            <Dot className="text-foreground/70 shrink-0" />
            <ArtistNames song={currentSong} />
          </div>
        </div>
        {/* Кнопка "почему этот трек" — на месте мобильного меню */}
        <div className="shrink-0">
          <MemoFullscreenSongExplanation />
        </div>
      </div>

      {/* Бейджи по центру */}
      <div className="flex gap-2 flex-wrap justify-center">
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
  )
}

function ArtistNames({ song }: { song: ISong }) {
  const { artist, artists } = song

  if (artists && artists.length > 1) {
    const data = artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)

    return (
      <div className="flex items-center gap-1 min-w-0">
        {data.map(({ id, name }, index) => (
          <div key={id} className="flex min-w-0">
            <p className="truncate text-shadow-lg">{name}</p>
            {index < data.length - 1 && ','}
          </div>
        ))}
      </div>
    )
  }

  return <p className="truncate text-shadow-lg">{artist}</p>
}
