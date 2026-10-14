/**
 * Библиотека — всё своё в одном месте, по мотивам Коллекции Яндекс Музыки:
 * Разделы / Мне нравится / Любимые исполнители / Мои плейлисты /
 * Любимые альбомы / Подкасты и книги / Мои дизлайки / Для вас.
 */

import { useQuery } from '@tanstack/react-query'
import {
  Album,
  BookOpen,
  ChevronRight,
  Disc3,
  FolderOpen,
  Heart,
  ListMusic,
  MicVocal,
  Music2,
  Play,
  Podcast,
  Plus,
  Radio,
  Sparkles,
  ThumbsDown,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFavoriteSongs } from '@/app/hooks/use-favorite-songs'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { ROUTES } from '@/routes/routesList'
import { subsonic } from '@/service/subsonic'
import { getStarredArtists } from '@/service/subsonic-api'
import { useAppStore } from '@/store/app.store'
import { useAudiobookshelf } from '@/store/audiobookshelf.store'
import { useLocalMusicStore } from '@/store/local-music.store'
import { useML } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { queryKeys } from '@/utils/queryKeys'

/** Кэш для мгновенного показа + автообновление в фоне. */
const STALE_10M = 1000 * 60 * 10
const GC_24H = 1000 * 60 * 60 * 24
const REFETCH_5M = 1000 * 60 * 5

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <button
      onClick={onAction}
      disabled={!onAction}
      className="flex items-center gap-1.5 text-xl font-bold text-foreground hover:opacity-80 transition-opacity disabled:cursor-default mb-4"
    >
      {title}
      {onAction && <ChevronRight className="w-5 h-5 text-muted-foreground" />}
      {action && <span className="ml-auto text-sm font-medium text-muted-foreground">{action}</span>}
    </button>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground mb-8">{text}</p>
}

function NavCard({
  title,
  subtitle,
  gradient,
  icon,
  onClick,
}: {
  title: string
  subtitle?: string
  gradient: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-card border border-border hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all text-left group"
    >
      <span
        className={`p-3 rounded-2xl text-white shrink-0 bg-gradient-to-br ${gradient}`}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="font-semibold block text-foreground text-[15px] leading-tight">
          {title}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground block truncate mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:translate-x-0.5 group-hover:text-foreground transition-all shrink-0" />
    </button>
  )
}

export default function LibraryPage() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const { ratings } = useML()
  const isPodcastsActive = useAppStore((s) => s.podcasts.active)
  const userName = useAppStore((s) => s.data?.username || '')
  const storedSongCount = useAppStore((s) => s.data?.songCount || 0)
  const { config: absConfig } = useAudiobookshelf()
  const localTracksCount = useLocalMusicStore((s) => s.tracks.length)
  const [playlistTab, setPlaylistTab] = useState<'mine' | 'liked'>('mine')

  const { data: favData } = useFavoriteSongs()
  const favSongs = favData?.songs ?? []

  const { data: starredArtists = [] } = useQuery({
    queryKey: ['library-starred-artists'],
    queryFn: getStarredArtists,
    staleTime: STALE_10M,
    gcTime: GC_24H,
    refetchInterval: REFETCH_5M,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const { data: starred } = useQuery({
    queryKey: ['library-starred'],
    queryFn: () => subsonic.star.getStarred(),
    staleTime: STALE_10M,
    gcTime: GC_24H,
    refetchInterval: REFETCH_5M,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
  const starredAlbums = (starred?.albums ?? []) as { id: string; name: string; artist?: string; coverArt?: string }[]
  const starredSongsCount = (starred as { song?: unknown[] } | undefined)?.song?.length ?? favSongs.length

  const { data: playlists = [] } = useQuery({
    queryKey: [queryKeys.playlist.all],
    queryFn: subsonic.playlists.getAll,
    staleTime: STALE_10M,
    gcTime: GC_24H,
    refetchInterval: REFETCH_5M,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
  const myPlaylists = playlists.filter((p) => !userName || p.owner === userName)
  const likedPlaylists = playlists.filter((p) => !!userName && p.owner !== userName)
  const shownPlaylists = (playlistTab === 'mine' ? (userName ? myPlaylists : playlists) : likedPlaylists).slice(0, 6)

  const { data: radios = [] } = useQuery({
    queryKey: [queryKeys.radio.all],
    queryFn: subsonic.radios.getAll,
    staleTime: STALE_10M,
    gcTime: GC_24H,
    refetchInterval: REFETCH_5M,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  // Дешёвые счётчики «всего»: первая страница + total, без выгрузки коллекции.
  const { data: artistsTotal } = useQuery({
    queryKey: ['library-count-artists'],
    queryFn: async () => {
      const res = await subsonic.artists.getPaginated({ offset: 0, limit: 1 })
      return res.total ?? res.artists.length
    },
    staleTime: STALE_10M,
    gcTime: GC_24H,
    refetchInterval: REFETCH_5M,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })
  const { data: albumsTotal } = useQuery({
    queryKey: ['library-count-albums'],
    queryFn: async () => {
      const res = await subsonic.albums.getAlbumList({ type: 'alphabeticalByName', size: 1, offset: 0 })
      return res.albumsCount ?? res.list?.length ?? 0
    },
    staleTime: STALE_10M,
    gcTime: GC_24H,
    refetchInterval: REFETCH_5M,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const booksConnected = absConfig.enabled && absConfig.isConnected
  const dislikes = Object.values(ratings ?? {}).filter((r) => r.like === false)

  return (
    <div className="w-full min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Библиотека</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Всё ваше: треки, артисты, плейлисты и альбомы
          </p>
        </div>

        {/* Разделы — быстрый доступ ко всей коллекции */}
        <section>
          <SectionHeader title="Разделы" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <NavCard
              title="Исполнители"
              subtitle={
                artistsTotal ? `Вся коллекция · ${artistsTotal}` : 'Вся коллекция'
              }
              gradient="from-sky-500 to-blue-600"
              icon={<MicVocal className="w-6 h-6" />}
              onClick={() => navigate(ROUTES.LIBRARY.ARTISTS)}
            />
            <NavCard
              title="Треки"
              subtitle={
                storedSongCount
                  ? `Вся коллекция · ${storedSongCount}`
                  : starredSongsCount
                    ? `Лайкнуто · ${starredSongsCount}`
                    : 'Вся коллекция'
              }
              gradient="from-emerald-500 to-teal-600"
              icon={<Music2 className="w-6 h-6" />}
              onClick={() => navigate(ROUTES.LIBRARY.SONGS)}
            />
            <NavCard
              title="Альбомы"
              subtitle={
                albumsTotal ? `Вся коллекция · ${albumsTotal}` : 'Вся коллекция'
              }
              gradient="from-orange-500 to-rose-600"
              icon={<Disc3 className="w-6 h-6" />}
              onClick={() => navigate(ROUTES.LIBRARY.ALBUMS)}
            />
            <NavCard
              title="Радио"
              subtitle={
                radios.length > 0 ? `${radios.length} станций · открыть` : 'Открыть станции'
              }
              gradient="from-pink-500 to-fuchsia-600"
              icon={<Radio className="w-6 h-6" />}
              onClick={() => navigate(ROUTES.LIBRARY.RADIOS)}
            />
            {booksConnected && (
              <NavCard
                title="Книги"
                subtitle="Audiobookshelf · открыть"
                gradient="from-amber-500 to-orange-600"
                icon={<BookOpen className="w-6 h-6" />}
                onClick={() => navigate('/audiobooks')}
              />
            )}
            <NavCard
              title="Локальная библиотека"
              subtitle={
                localTracksCount > 0
                  ? `${localTracksCount} треков · открыть`
                  : 'Файлы на устройстве'
              }
              gradient="from-slate-500 to-zinc-600"
              icon={<FolderOpen className="w-6 h-6" />}
              onClick={() => navigate('/library/local')}
            />
            <NavCard
              title="Для вас"
              subtitle="Миксы, рекомендации и статистика"
              gradient="from-violet-500 to-purple-600"
              icon={<Sparkles className="w-6 h-6" />}
              onClick={() => navigate('/ml/for-you')}
            />
          </div>
        </section>

        {/* Мне нравится */}
        <section>
          <SectionHeader
            title="Мне нравится"
            action={favSongs.length > 0 ? `${favSongs.length} треков` : undefined}
            onAction={favSongs.length > 0 ? () => navigate(ROUTES.FAVORITES.PAGE) : undefined}
          />
          {favSongs.length === 0 ? (
            <EmptyHint text="Ставьте лайки трекам, и они появятся тут" />
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden">
              {favSongs.slice(0, 5).map((song: any, i: number) => (
                <button
                  key={song.id ?? i}
                  onClick={() => setSongList(favSongs as any, i)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-accent transition-colors text-left"
                >
                  {song.coverArt ? (
                    <img
                      src={getSimpleCoverArtUrl(song.coverArt, 'song', '100')}
                      alt=""
                      loading="lazy"
                      className="w-10 h-10 rounded-lg object-cover bg-muted shrink-0"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Music2 className="w-4 h-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate text-foreground">
                      {song.title}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {song.artist}
                    </span>
                  </span>
                  <Heart className="w-4 h-4 text-muted-foreground fill-current shrink-0" />
                  <span className="text-xs text-muted-foreground w-11 text-right shrink-0">
                    {formatDuration(song.duration)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Любимые исполнители */}
        <section>
          <SectionHeader
            title="Любимые исполнители"
            onAction={() => navigate(ROUTES.LIBRARY.ARTISTS)}
          />
          {starredArtists.length === 0 ? (
            <EmptyHint text="Ставьте лайки артистам, и они появятся тут" />
          ) : (
            <div className="flex gap-5 overflow-x-auto pb-2">
              {starredArtists.map((artist) => (
                <button
                  key={artist.id}
                  onClick={() => navigate(ROUTES.ARTIST.PAGE(artist.id))}
                  className="flex flex-col items-center gap-2 shrink-0 w-28 group"
                >
                  {artist.coverArt ? (
                    <img
                      src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '200')}
                      alt={artist.name}
                      loading="lazy"
                      className="w-28 h-28 rounded-full object-cover bg-muted group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <span className="w-28 h-28 rounded-full bg-muted flex items-center justify-center group-hover:scale-105 transition-transform">
                      <MicVocal className="w-8 h-8 text-muted-foreground" />
                    </span>
                  )}
                  <span className="text-sm font-medium text-center line-clamp-2 text-foreground">
                    {artist.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Мои плейлисты */}
        <section>
          <SectionHeader
            title="Мои плейлисты"
            action={playlists.length > 0 ? `${playlists.length}` : undefined}
            onAction={() => navigate(ROUTES.LIBRARY.PLAYLISTS)}
          />
          <div className="flex gap-2 mb-4">
            {(['mine', 'liked'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setPlaylistTab(tab)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  playlistTab === tab
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'mine' ? 'Вы собрали' : 'Вам понравилось'}
              </button>
            ))}
          </div>
          {playlists.length === 0 ? (
            <EmptyHint text="Соберите первый плейлист — он появится тут" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <button
                onClick={() => navigate(ROUTES.LIBRARY.PLAYLISTS)}
                className="flex flex-col items-center gap-2 group"
              >
                <span className="w-full aspect-square rounded-2xl bg-muted flex items-center justify-center group-hover:scale-[1.03] transition-transform">
                  <Plus className="w-8 h-8 text-muted-foreground" />
                </span>
                <span className="text-sm font-medium text-foreground">Новый плейлист</span>
              </button>
              {shownPlaylists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={() => navigate(ROUTES.PLAYLIST.PAGE(pl.id))}
                  className="flex flex-col items-center gap-2 group text-center"
                >
                  {pl.coverArt ? (
                    <img
                      src={getSimpleCoverArtUrl(pl.coverArt, 'playlist', '300')}
                      alt={pl.name}
                      loading="lazy"
                      className="w-full aspect-square rounded-2xl object-cover bg-muted group-hover:scale-[1.03] transition-transform"
                    />
                  ) : (
                    <span className="w-full aspect-square rounded-2xl bg-muted flex items-center justify-center group-hover:scale-[1.03] transition-transform">
                      <ListMusic className="w-8 h-8 text-muted-foreground" />
                    </span>
                  )}
                  <span>
                    <span className="block text-sm font-medium line-clamp-1 text-foreground">
                      {pl.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {pl.songCount ?? 0} треков
                    </span>
                  </span>
                </button>
              ))}
              {/* Красивый переход ко всем плейлистам */}
              <button
                onClick={() => navigate(ROUTES.LIBRARY.PLAYLISTS)}
                className="flex flex-col items-center gap-2 group text-center"
              >
                <span className="w-full aspect-square rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex flex-col items-center justify-center gap-1 text-white group-hover:scale-[1.03] transition-transform shadow-md">
                  <ListMusic className="w-8 h-8" />
                  <span className="flex items-center gap-1 text-xs font-semibold opacity-90">
                    Все
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </span>
                <span>
                  <span className="block text-sm font-medium line-clamp-1 text-foreground">
                    Все плейлисты
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {playlists.length} шт
                  </span>
                </span>
              </button>
            </div>
          )}
        </section>

        {/* Любимые альбомы */}
        <section>
          <SectionHeader
            title="Любимые альбомы"
            onAction={() => navigate(ROUTES.LIBRARY.ALBUMS)}
          />
          {starredAlbums.length === 0 ? (
            <EmptyHint text="Ставьте лайки альбомам, и они появятся тут" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {starredAlbums.slice(0, 6).map((album) => (
                <button
                  key={album.id}
                  onClick={() => navigate(ROUTES.ALBUM.PAGE(album.id))}
                  className="flex flex-col items-center gap-2 group text-center"
                >
                  {album.coverArt ? (
                    <img
                      src={getSimpleCoverArtUrl(album.coverArt, 'album', '300')}
                      alt={album.name}
                      loading="lazy"
                      className="w-full aspect-square rounded-2xl object-cover bg-muted group-hover:scale-[1.03] transition-transform"
                    />
                  ) : (
                    <span className="w-full aspect-square rounded-2xl bg-muted flex items-center justify-center group-hover:scale-[1.03] transition-transform">
                      <Disc3 className="w-8 h-8 text-muted-foreground" />
                    </span>
                  )}
                  <span>
                    <span className="block text-sm font-medium line-clamp-1 text-foreground">
                      {album.name}
                    </span>
                    {album.artist && (
                      <span className="block text-xs text-muted-foreground line-clamp-1">
                        {album.artist}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Подкасты и книги */}
        {isPodcastsActive && (
          <section>
            <SectionHeader title="Подкасты и книги" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => navigate(ROUTES.LIBRARY.PODCASTS)}
                className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:shadow-lg transition-all text-left"
              >
                <span className="p-3 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                  <Podcast className="w-6 h-6" />
                </span>
                <span>
                  <span className="font-semibold block text-foreground">Подкасты</span>
                  <span className="text-xs text-muted-foreground">Ваши подписки и эпизоды</span>
                </span>
              </button>
              <button
                onClick={() => navigate('/audiobooks')}
                className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:shadow-lg transition-all text-left"
              >
                <span className="p-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
                  <BookOpen className="w-6 h-6" />
                </span>
                <span>
                  <span className="font-semibold block text-foreground">Книги</span>
                  <span className="text-xs text-muted-foreground">Аудиокниги</span>
                </span>
              </button>
            </div>
          </section>
        )}

        {/* Мои дизлайки */}
        <section>
          <SectionHeader title="Мои дизлайки" />
          {dislikes.length === 0 ? (
            <EmptyHint text="Треки с дизлайком появятся тут" />
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden">
              {dislikes.slice(0, 8).map((r) => (
                <div
                  key={r.songId}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left"
                >
                  <ThumbsDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate text-foreground">
                      {r.songInfo?.title ?? r.songId}
                    </span>
                    {r.songInfo?.artist && (
                      <span className="block text-xs text-muted-foreground truncate">
                        {r.songInfo.artist}
                      </span>
                    )}
                  </span>
                  <Album className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Быстрый play всего любимого */}
        {favSongs.length > 0 && (
          <button
            onClick={() => setSongList(favSongs as any, 0)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
          >
            <Play className="w-5 h-5 fill-current" />
            Слушать «Мне нравится»
          </button>
        )}
      </div>
    </div>
  )
}
