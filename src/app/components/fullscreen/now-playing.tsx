/**
 * Fullscreen "Сейчас играет" в стиле Яндекс Музыки + идеи мобайла:
 * - слева: обложка с ховер-оверлеем (контролы на обложке), под ней ряд
 *   "кружок артиста + название/артист + почему трек" (как _SongInfo мобайла)
 * - справа: контекстная панель "Сейчас играет Моя волна / Работаю",
 *   текущий трек + "Далее в очереди"; очередь и текст открываются
 *   кнопками (оверлей на обложке / иконки панели), а не табами
 * - артист (аватар и имя) кликабелен → страница артиста
 */

import {
  ArrowLeft,
  Heart,
  Info,
  ListMusic,
  Mic,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  ThumbsDown,
  X,
} from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dot } from '@/app/components/dot'
import { MarqueeTitle } from '@/app/components/fullscreen/marquee-title'
import RepeatOne from '@/app/components/icons/repeat-one'
import { ImageLoader } from '@/app/components/image-loader'
import { AutoDJButton } from '@/app/components/player/auto-dj-button'
import { SleepTimerButton } from '@/app/components/player/sleep-timer-button'
import { SongQualityBadge } from '@/app/components/song/quality-badge'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import i18n from '@/i18n'
import { BRAIN_SHORT_NAME } from '@/store/brain.store'
import { useML } from '@/store/ml.store'
import {
  usePlayerActions,
  usePlayerIsPlaying,
  usePlayerLoop,
  usePlayerShuffle,
  usePlayerSonglist,
  usePlayerStore,
} from '@/store/player.store'
import { useSongInfo } from '@/store/ui.store'
import { ArtistAvatar, useGoArtist } from './artist-avatar'
export { useGoArtist }

import {
  readWaveContext,
  waveLabel,
} from '@/app/components/homepage/my-wave-settings'
import { LoopState } from '@/types/playerContext'
import { ISong } from '@/types/responses/song'
import { ALBUM_ARTISTS_MAX_NUMBER } from '@/utils/multipleArtists'
import { LyricsTab } from './lyrics'
import { FullscreenSettings } from './settings'
import { FullscreenSongExplanation } from './song-explanation'
import { VolumeContainer } from './volume-container'

const MemoLyricsTab = memo(LyricsTab)
const MemoExplanation = memo(FullscreenSongExplanation)

/**
 * Панели правой колонки:
 * - context: "Сейчас играет + Далее в очереди" (качественная очередь)
 * - lyrics: текст
 * - hidden: панель скрыта, обложка плавно центрируется
 * Кнопка очереди на обложке — переключатель context/hidden.
 */
export type FullscreenPanel = 'context' | 'lyrics' | 'hidden'

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ==================== ЛЕВАЯ КОЛОНКА ====================

export function CoverColumn({
  panel,
  setPanel,
}: {
  panel: FullscreenPanel
  setPanel: (p: FullscreenPanel) => void
}) {
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const { t } = useTranslation()

  // Очередь на обложке — переключатель качественной панели (сейчас играет + далее)
  const toggleQueue = () => setPanel(panel === 'context' ? 'hidden' : 'context')
  const toggleLyrics = () => setPanel(panel === 'lyrics' ? 'context' : 'lyrics')
  // Обложка зависит от ОБОИХ размеров окна, а не только ширины:
  // 1600x900 с масштабом Windows 125% = ~1280x720 CSS, минимум окна 960x600.
  // Старое `lg:w-[44vh]` не срабатывало уже при 960px (< lg=1024), отсюда ползунки.
  // Формула: min(vw, dvh - резерв под шапку/инфо/прогресс, cap).
  const coverWidth =
    panel === 'hidden' ? 'min(72vw, 58dvh, 560px)' : 'min(54vw, 44dvh, 440px)'

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-[640px] min-h-0 max-h-full overflow-hidden py-2 gap-3 mx-auto lg:mx-0 px-2 transition-all duration-300">
      <CoverWithOverlay
        queueActive={panel === 'context'}
        onToggleQueue={toggleQueue}
        onToggleLyrics={toggleLyrics}
        coverWidth={coverWidth}
      />

      {/* Инфо-блок шириной ровно с обложку, по центру — ничего не вылезает за края */}
      <div
        className="max-w-full flex flex-col gap-3 transition-all duration-300 shrink-0 min-h-0"
        style={{ width: coverWidth }}
      >
        <div className="flex items-center gap-3 w-full min-w-0">
          <ArtistAvatar song={currentSong} />
          <div className="flex-1 min-w-0 text-left">
            <MarqueeTitle gap="mr-2">
              <h2 className="scroll-m-20 text-xl 2xl:text-2xl font-bold tracking-tight py-1 text-shadow-md truncate">
                {currentSong.title}
              </h2>
            </MarqueeTitle>
            {/* Альбом ужимается (max-w), артисты занимают остаток — раньше альбом вытеснял имена */}
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
          <div className="shrink-0">
            <MemoExplanation />
          </div>
        </div>

        {/* Бейджи по центру блока */}
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

        {/* Кнопки панелей для узких экранов — круглые, в стиле контролов */}
        <div className="flex lg:hidden gap-2 justify-center shrink-0">
          <button
            onClick={toggleQueue}
            className={`h-10 pl-4 pr-5 rounded-full flex items-center gap-2 text-sm font-semibold transition-all active:scale-95 ${
              panel === 'context'
                ? 'bg-foreground text-background shadow-lg'
                : 'bg-foreground/10 text-foreground hover:bg-foreground/20'
            }`}
          >
            <ListMusic className="w-4 h-4" />
            {t('fullscreen.queue')}
          </button>
          <button
            onClick={toggleLyrics}
            className={`h-10 pl-4 pr-5 rounded-full flex items-center gap-2 text-sm font-semibold transition-all active:scale-95 ${
              panel === 'lyrics'
                ? 'bg-foreground text-background shadow-lg'
                : 'bg-foreground/10 text-foreground hover:bg-foreground/20'
            }`}
          >
            <Mic className="w-4 h-4" />
            {t('fullscreen.lyrics')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Обложка с ховер-оверлеем как в Яндекс Музыке: контролы прямо на обложке */
function CoverWithOverlay({
  queueActive,
  onToggleQueue,
  onToggleLyrics,
  coverWidth,
}: {
  queueActive: boolean
  onToggleQueue: () => void
  onToggleLyrics: () => void
  coverWidth: string
}) {
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const isPlaying = usePlayerIsPlaying()
  const loopState = usePlayerLoop()
  const isShuffleActive = usePlayerShuffle()
  const {
    togglePlayPause,
    playNextSong,
    playPrevSong,
    toggleLoop,
    toggleShuffle,
    starCurrentSong,
  } = usePlayerActions()
  const { rateSong } = useML()
  const isLiked = usePlayerStore((state) => state.playerState.isSongStarred)
  const { setSongId, setModalOpen } = useSongInfo()
  // Шторка «•••»: всё невошедшее (сон, автодиджей, настройки, громкость, дизлайк)
  const [showExtras, setShowExtras] = useState(false)
  const { t } = useTranslation()

  const isAudiobook = (
    usePlayerStore.getState().songlist.currentSong as unknown as {
      isAudiobook?: boolean
    }
  )?.isAudiobook
  const coverUrl = (
    usePlayerStore.getState().songlist.currentSong as unknown as {
      coverUrl?: string
    }
  )?.coverUrl

  const handleLike = () => {
    if (!currentSong?.id) return
    starCurrentSong()
    rateSong(currentSong.id, !isLiked, {
      title: currentSong.title,
      artist: currentSong.artist,
      artistId: currentSong.artistId,
      genre: currentSong.genre,
      album: currentSong.album,
    })
  }

  const handleDislike = () => {
    if (!currentSong?.id) return
    rateSong(currentSong.id, false, {
      title: currentSong.title,
      artist: currentSong.artist,
      artistId: currentSong.artistId,
      genre: currentSong.genre,
      album: currentSong.album,
    })
    playNextSong()
  }

  const openSongDialog = () => {
    if (!currentSong?.id) return
    setShowExtras(false)
    setSongId(currentSong.id)
    setModalOpen(true)
  }

  return (
    <div
      className="group relative max-w-full aspect-square shrink-0 min-h-0 transition-all duration-300"
      style={{ width: coverWidth }}
    >
      <div className="absolute inset-0 rounded-2xl overflow-hidden bg-accent/60 shadow-custom-5">
        {isAudiobook && coverUrl ? (
          <img
            src={coverUrl}
            alt={`${currentSong.artist} - ${currentSong.title}`}
            className="w-full h-full object-cover"
            width="100%"
            height="100%"
          />
        ) : (
          <ImageLoader id={currentSong.coverArt} type="song" size={800}>
            {(src, isLoading) => (
              <img
                src={src}
                alt={`${currentSong.artist} - ${currentSong.title}`}
                className={`w-full h-full object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                width="100%"
                height="100%"
              />
            )}
          </ImageLoader>
        )}
      </div>

      {/* Оверлей при наведении */}
      <div className="absolute inset-0 rounded-2xl bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-3">
        <div className="flex justify-end">
          <OverlayBtn
            title={t('fullscreen.toggleQueue')}
            onClick={onToggleQueue}
            active={queueActive}
          >
            <ListMusic className="w-5 h-5" />
          </OverlayBtn>
        </div>

        <div className="flex items-center justify-center gap-2">
          <OverlayBtn
            title={t('fullscreen.transportBack')}
            onClick={() => playPrevSong()}
          >
            <SkipBack className="w-5 h-5 fill-white" />
          </OverlayBtn>
          <button
            onClick={() => togglePlayPause()}
            title={
              isPlaying ? t('player.tooltips.pause') : t('player.tooltips.play')
            }
            className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-black" />
            ) : (
              <Play className="w-7 h-7 fill-black ml-0.5" />
            )}
          </button>
          <OverlayBtn
            title={t('fullscreen.transportForward')}
            onClick={() => playNextSong()}
          >
            <SkipForward className="w-5 h-5 fill-white" />
          </OverlayBtn>
          <OverlayBtn
            title={t('fullscreen.repeat')}
            onClick={() => toggleLoop()}
            active={loopState !== LoopState.Off}
          >
            {loopState === LoopState.One ? (
              <RepeatOne className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </OverlayBtn>
        </div>

        <div className="flex items-center justify-between">
          <OverlayBtn
            title={t('fullscreen.like')}
            onClick={handleLike}
            active={!!isLiked}
          >
            <Heart
              className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`}
            />
          </OverlayBtn>
          <OverlayBtn
            title={t('fullscreen.more')}
            onClick={() => setShowExtras((v) => !v)}
            active={showExtras}
          >
            <MoreHorizontal className="w-5 h-5" />
          </OverlayBtn>
          <OverlayBtn title={t('fullscreen.lyrics')} onClick={onToggleLyrics}>
            <Mic className="w-5 h-5" />
          </OverlayBtn>
        </div>
      </div>

      {/* Шторка «•••»: всё невошедшее — сон, автодиджей, настройки, громкость, дизлайк */}
      {showExtras && (
        <div
          className="absolute inset-x-3 bottom-3 z-10 rounded-xl bg-background/60 backdrop-blur-xl border border-foreground/10 p-2 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={openSongDialog}
              className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg text-sm hover:bg-foreground/10 transition-colors text-left"
            >
              <Info className="w-4 h-4" />
              {t('fullscreen.aboutTrack')}
            </button>
            <button
              onClick={() => setShowExtras(false)}
              title={t('fullscreen.collapse')}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-2 py-1">
            <VolumeContainer />
          </div>
          <div className="flex items-center justify-around pt-1">
            <button
              onClick={handleDislike}
              title={t('fullscreen.dislike')}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-colors"
            >
              <ThumbsDown className="w-5 h-5" />
            </button>
            <SleepTimerButton />
            <AutoDJButton />
            <FullscreenSettings />
            <button
              onClick={() => toggleShuffle()}
              title={t('fullscreen.shuffle')}
              className={`w-10 h-10 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-colors ${isShuffleActive ? 'text-primary' : ''}`}
            >
              <Shuffle className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function OverlayBtn({
  title,
  onClick,
  active,
  children,
}: {
  title: string
  onClick: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors ${
        active ? 'bg-white/30' : 'bg-white/10 hover:bg-white/25'
      } backdrop-blur-sm`}
    >
      {children}
    </button>
  )
}

// ==================== ИМЕНА АРТИСТОВ ====================

function ArtistNames({
  song,
  centered = false,
}: {
  song: ISong
  centered?: boolean
}) {
  const goArtist = useGoArtist()
  const { t } = useTranslation()
  const { artist, artists, artistId } = song
  const align = centered ? 'justify-center text-center' : ''

  if (artists && artists.length > 1) {
    const data = artists.slice(0, ALBUM_ARTISTS_MAX_NUMBER)
    return (
      <div
        className={`flex items-center gap-1 min-w-0 overflow-hidden ${align}`}
      >
        {data.map(({ id, name }, index) => (
          <div
            key={`${id}-${name}-${index}`}
            className="flex min-w-0 items-center shrink"
          >
            {id ? (
              <button
                onClick={() => goArtist(id)}
                className="truncate min-w-0 text-shadow-lg hover:text-primary hover:underline transition-colors"
                title={t('fullscreen.openArtist', { name })}
              >
                {name}
              </button>
            ) : (
              <p className="truncate min-w-0 text-shadow-lg">{name}</p>
            )}
            {index < data.length - 1 && (
              <span className="shrink-0">,&nbsp;</span>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (artistId) {
    return (
      <button
        onClick={() => goArtist(artistId)}
        className={`truncate block max-w-full text-shadow-lg hover:text-primary hover:underline transition-colors ${centered ? 'mx-auto' : 'text-left'}`}
        title={t('fullscreen.openArtist', { name: artist })}
      >
        {artist}
      </button>
    )
  }

  return <p className="truncate text-shadow-lg">{artist}</p>
}

// ==================== ПРАВАЯ ПАНЕЛЬ ====================

export function ContextPanel({
  panel,
  setPanel,
  onClose,
}: {
  panel: FullscreenPanel
  setPanel: (p: FullscreenPanel) => void
  onClose?: () => void
}) {
  return (
    <div className="flex flex-col min-h-0 h-full w-full">
      <PanelHeader panel={panel} setPanel={setPanel} onClose={onClose} />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {panel === 'lyrics' ? <MemoLyricsTab /> : <ContextBody />}
      </div>
    </div>
  )
}

function PanelHeader({
  panel,
  setPanel,
  onClose,
}: {
  panel: FullscreenPanel
  setPanel: (p: FullscreenPanel) => void
  onClose?: () => void
}) {
  const currentSong = usePlayerStore((state) => state.songlist.currentSong)
  const { t } = useTranslation()
  const ctx = getActiveContext(currentSong?.id)
  // Очередь = переключатель качественной панели (сейчас играет + далее).
  // Скрыли — обложка плавно центрируется (анимация ширины в page.tsx).
  const toggleQueue = () => setPanel(panel === 'context' ? 'hidden' : 'context')
  const toggleLyrics = () => setPanel(panel === 'lyrics' ? 'context' : 'lyrics')

  return (
    <div className="flex items-center gap-2 mb-3 shrink-0">
      {panel === 'lyrics' ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPanel('context')}
            title={t('fullscreen.backToQueue')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h3 className="text-xl font-bold flex-1 truncate">
            {t('fullscreen.lyrics')}
          </h3>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground/60 truncate">{ctx.kicker}</p>
            <h3 className="text-2xl 2xl:text-3xl font-bold truncate">
              {ctx.title}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleQueue}
            title={t('fullscreen.toggleQueue')}
            className={panel === 'context' ? 'text-primary' : ''}
          >
            <ListMusic className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLyrics}
            title={t('fullscreen.lyrics')}
          >
            <Mic className="w-5 h-5" />
          </Button>
        </>
      )}
      {onClose && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          title={t('fullscreen.closePanel')}
        >
          <X className="w-5 h-5" />
        </Button>
      )}
    </div>
  )
}

/**
 * Шапка контекста как в Яндекс Музыке: "Сейчас играет Моя волна под занятие / Работаю".
 * Берём из сохранённого контекста последней сгенерированной Волны.
 */
function getActiveContext(currentId?: string): {
  kicker: string
  title: string
} {
  try {
    const wave = readWaveContext()
    if (wave && currentId && wave.ids.includes(currentId)) {
      const short = wave.source === 'brain' ? ` (${BRAIN_SHORT_NAME})` : ''
      return {
        kicker: wave.hint
          ? i18n.t('fullscreen.kickerWaveActivity', { short })
          : i18n.t('fullscreen.kickerWave', { short }),
        title: wave.hint
          ? humanizeHint(wave.hint)
          : i18n.t('fullscreen.myWave'),
      }
    }
  } catch {
    /* ignore */
  }
  return {
    kicker: i18n.t('fullscreen.playing'),
    title: i18n.t('fullscreen.defaultCollection'),
  }
}

/** hint вида "work • unfamiliar" → красивая подпись (на случай старых сырых ключей) */
function humanizeHint(hint: string): string {
  return hint
    .split('•')
    .map((p) => waveLabel(p.trim()))
    .filter(Boolean)
    .join(' • ')
}

/** Текущий трек карточкой + "Далее в очереди" как в Яндексе */
function ContextBody() {
  const { currentList, currentSongIndex, currentSong } = usePlayerSonglist()
  const { setSongList } = usePlayerActions()
  const { t } = useTranslation()

  const next = currentList.slice(currentSongIndex + 1, currentSongIndex + 9)
  // Уже сыгранные — как у Яндекса уходят под шторку: верх затухает,
  // последний сыгранный виден частично
  const prev = currentList.slice(
    Math.max(0, currentSongIndex - 3),
    currentSongIndex,
  )

  return (
    <div className="flex flex-col min-h-0 overflow-y-auto gap-4 pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Уже сыграли — под шторкой с fade наверх */}
      {prev.length > 0 && (
        <div>
          <div className="flex flex-col gap-1 opacity-60 [mask-image:linear-gradient(to_bottom,transparent_0%,black_55%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_55%)]">
            {prev.map((song, i) => {
              const idx = currentSongIndex - prev.length + i
              return (
                <button
                  key={`prev-${song.id}-${idx}`}
                  onClick={() => setSongList(currentList, idx)}
                  title={t('fullscreen.backToTrack')}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-foreground/10 hover:opacity-100 transition-all text-left w-full group/row"
                >
                  <span className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-foreground/10 grayscale-[0.4]">
                    <ImageLoader id={song.coverArt} type="song" size={100}>
                      {(src) =>
                        src ? (
                          <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover"
                            width="44"
                            height="44"
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center">
                            <Music2 className="w-4 h-4 text-foreground/30" />
                          </span>
                        )
                      }
                    </ImageLoader>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate group-hover/row:text-primary transition-colors">
                      {song.title}
                    </span>
                    <span className="block text-sm text-foreground/60 truncate">
                      {song.artist}
                    </span>
                  </span>
                  <span className="text-sm text-foreground/50 shrink-0">
                    {formatDuration(song.duration)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      {/* Текущий трек */}
      <button
        onClick={() =>
          currentSong && setSongList(currentList, currentSongIndex)
        }
        className="flex items-center gap-3 p-2 rounded-xl bg-foreground/10 text-left w-full"
      >
        <span className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-foreground/10">
          <ImageLoader id={currentSong.coverArt} type="song" size={100}>
            {(src) =>
              src ? (
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover"
                  width="48"
                  height="48"
                />
              ) : (
                <span className="w-full h-full flex items-center justify-center">
                  <Music2 className="w-5 h-5 text-foreground/30" />
                </span>
              )
            }
          </ImageLoader>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate">
            {currentSong.title}
          </span>
          <span className="block text-sm text-foreground/60 truncate">
            {currentSong.artist}
          </span>
        </span>
        <span className="text-sm text-foreground/60 shrink-0">
          {formatDuration(currentSong.duration)}
        </span>
      </button>

      {/* Далее в очереди */}
      {next.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-foreground/70 mb-2">
            {t('fullscreen.upNext')}
          </p>
          <div className="flex flex-col gap-1">
            {next.map((song, i) => {
              const idx = currentSongIndex + 1 + i
              return (
                <button
                  key={`${song.id}-${idx}`}
                  onClick={() => setSongList(currentList, idx)}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-foreground/10 transition-colors text-left w-full group/row"
                >
                  <span className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-foreground/10">
                    <ImageLoader id={song.coverArt} type="song" size={100}>
                      {(src) =>
                        src ? (
                          <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover"
                            width="44"
                            height="44"
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center">
                            <Music2 className="w-4 h-4 text-foreground/30" />
                          </span>
                        )
                      }
                    </ImageLoader>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate group-hover/row:text-primary transition-colors">
                      {song.title}
                    </span>
                    <span className="block text-sm text-foreground/60 truncate">
                      {song.artist}
                    </span>
                  </span>
                  <span className="text-sm text-foreground/50 shrink-0">
                    {formatDuration(song.duration)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
