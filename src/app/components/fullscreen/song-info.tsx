import { memo } from 'react'
import { Dot } from '@/app/components/dot'
import { MarqueeTitle } from '@/app/components/fullscreen/marquee-title'
import { SongQualityBadge } from '@/app/components/song/quality-badge'
import { Badge } from '@/app/components/ui/badge'
import { usePlayerStore } from '@/store/player.store'
import { ISong } from '@/types/responses/song'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'
import { ArtistAvatar } from './artist-avatar'
import { FullscreenSongExplanation } from './song-explanation'
import { FullscreenSongImage } from './song-image'

const MemoFullscreenSongImage = memo(FullscreenSongImage)
const MemoFullscreenSongExplanation = memo(FullscreenSongExplanation)

/**
 * Вкладка "Сейчас играет" — вертикальная компоновка как дефолтный
 * NowPlaying мобайла: большая обложка по центру, под ней ряд
 * "кружок артиста + название/артист + объяснение", бейджи по центру.
 * Прогресс и контролы живут в нижней строке (FullscreenPlayer) — как было.
 */
export function SongInfo() {
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-0 max-h-full w-full max-w-[560px] mx-auto gap-4 overflow-hidden py-4 px-4">
      {/* Обложка по центру, как в мобайле (~80% ширины колонки) */}
      <MemoFullscreenSongImage centered />

      {/* Ряд как мобильный _SongInfo: кружок артиста + название/артист + действия */}
      <div className="flex items-center gap-3 w-full min-w-0 shrink-0">
        <ArtistAvatar song={currentSong} />
        <div className="flex-1 min-w-0 text-left">
          <MarqueeTitle gap="mr-2">
            <h2 className="scroll-m-20 text-xl 2xl:text-2xl font-bold tracking-tight py-1 text-shadow-md truncate">
              {currentSong.title}
            </h2>
          </MarqueeTitle>
          <div className="text-sm 2xl:text-base flex items-center gap-1 text-foreground/70 min-w-0 maskImage-marquee-fade-finished">
            <p className="truncate text-shadow-lg text-foreground min-w-0 max-w-[45%] shrink">
              {currentSong.album}
            </p>
            <Dot className="text-foreground/70 shrink-0" />
            <div className="flex-1 min-w-0">
              <ArtistNames song={currentSong} />
            </div>
          </div>
        </div>
        {/* Кнопка "почему этот трек" — на месте мобильного меню */}
        <div className="shrink-0">
          <MemoFullscreenSongExplanation />
        </div>
      </div>

      {/* Бейджи по центру */}
      <div className="hidden [@media(min-height:640px)]:flex gap-2 flex-wrap justify-center shrink-0">
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
          <Badge variant="neutral">{currentSong.moods.join(', ')}</Badge>
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
      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        {data.map(({ id, name }, index) => (
          <div
            key={`${id}-${name}-${index}`}
            className="flex min-w-0 items-center shrink"
          >
            <p className="truncate min-w-0 text-shadow-lg">{name}</p>
            {index < data.length - 1 && (
              <span className="shrink-0">,&nbsp;</span>
            )}
          </div>
        ))}
      </div>
    )
  }

  return <p className="truncate text-shadow-lg">{artist}</p>
}
