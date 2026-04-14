import { lazy, Suspense } from 'react'
import { createHashRouter, Navigate } from 'react-router-dom'

import {
  AlbumFallback,
  AlbumsFallback,
} from '@/app/components/fallbacks/album-fallbacks'
import { ArtistsFallback } from '@/app/components/fallbacks/artists.tsx'
import { HomeFallback } from '@/app/components/fallbacks/home-fallbacks'
import { PlaylistFallback } from '@/app/components/fallbacks/playlist-fallbacks'
import {
  EpisodeFallback,
  LatestEpisodesFallback,
  PodcastFallback,
} from '@/app/components/fallbacks/podcast-fallbacks'
import {
  InfinitySongListFallback,
  SongListFallback,
} from '@/app/components/fallbacks/song-fallbacks'
import { albumsLoader } from '@/routes/loaders/albumsLoader'
import { loginLoader } from '@/routes/loginLoader'
import { podcastsLoader, protectedLoader } from '@/routes/protectedLoader'
import { ROUTES } from '@/routes/routesList'

const BaseLayout = lazy(() => import('@/app/layout/base'))
const ColdStartOnboarding = lazy(() => import('@/app/pages/artists/cold-start-onboarding'))
const RemoteControlPage = lazy(() => import('@/app/pages/remote'))
const MLForYouPage = lazy(() => import('@/app/pages/ml/for-you-page'))
const MLPlaylistViewPage = lazy(() => import('@/app/pages/ml/ml-playlist-view-page'))
const MLStatsPage = lazy(() => import('@/app/pages/ml/stats'))
const MLDiscoveriesPage = lazy(() => import('@/app/pages/ml/discoveries-page'))  // 🆕
const SharedListensPage = lazy(() => import('@/app/pages/ml/shared-listens-page'))
const MyWaveEncountersPage = lazy(() => import('@/app/pages/ml/my-wave-encounters'))
const InStyleArtistsPage = lazy(() => import('@/app/pages/ml/in-style-artists'))
const WrappedPage = lazy(() => import('@/app/pages/wrapped/index'))
const HistoryPage = lazy(() => import('@/app/pages/history/history-page'))
const SearchPage = lazy(() => import('@/app/pages/search/search-page'))
const AudiobooksPage = lazy(() => import('@/app/pages/audiobooks/audiobooks-page'))
const AudiobookDetail = lazy(() => import('@/app/pages/audiobooks/audiobook-detail'))
const GenreCardsPage = lazy(() => import('@/app/pages/genres/genre-cards'))
const Album = lazy(() => import('@/app/pages/albums/album'))
const AlbumsList = lazy(() => import('@/app/pages/albums/list'))
const Artist = lazy(() => import('@/app/pages/artists/artist'))
const ArtistsList = lazy(() => import('@/app/pages/artists/list'))
const ErrorPage = lazy(() => import('@/app/pages/error-page'))
const Favorites = lazy(() => import('@/app/pages/favorites/songlist'))
const Login = lazy(() => import('@/app/pages/login'))
const PlaylistsPage = lazy(() => import('@/app/pages/playlists/list'))
const Playlist = lazy(() => import('@/app/pages/playlists/playlist'))
const SavedPlaylistPage = lazy(() => import('@/app/pages/playlists/saved-playlist-page'))
const AudiobookAuthor = lazy(() => import('@/app/pages/audiobooks/author-detail'))
const Radios = lazy(() => import('@/app/pages/radios/radios-list'))
const SongList = lazy(() => import('@/app/pages/songs/songlist'))
const Home = lazy(() => import('@/app/pages/home'))
const PodcastsList = lazy(() => import('@/app/pages/podcasts/list'))
const Podcast = lazy(() => import('@/app/pages/podcasts/podcast'))
const Episode = lazy(() => import('@/app/pages/podcasts/episode'))
const LatestEpisodes = lazy(
  () => import('@/app/pages/podcasts/latest-episodes'),
)
const LocalLibrary = lazy(() => import('@/app/pages/local-library'))
const CachePage = lazy(() => import('@/app/pages/cache'))

export const router = createHashRouter([
  {
    path: ROUTES.LIBRARY.HOME,
    element: <BaseLayout />,
    loader: protectedLoader,
    children: [
      {
        id: 'home',
        path: ROUTES.LIBRARY.HOME,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<HomeFallback />}>
            <Home />
          </Suspense>
        ),
      },
      {
        id: 'artists',
        path: ROUTES.LIBRARY.ARTISTS,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<ArtistsFallback />}>
            <ArtistsList />
          </Suspense>
        ),
      },
      {
        id: 'songs',
        path: ROUTES.LIBRARY.SONGS,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<InfinitySongListFallback />}>
            <SongList />
          </Suspense>
        ),
      },
      {
        id: 'albums',
        path: ROUTES.LIBRARY.ALBUMS,
        loader: albumsLoader,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<AlbumsFallback />}>
            <AlbumsList />
          </Suspense>
        ),
      },
      {
        id: 'favorites',
        path: ROUTES.LIBRARY.FAVORITES,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<InfinitySongListFallback />}>
            <Favorites />
          </Suspense>
        ),
      },
      {
        id: 'playlists',
        path: ROUTES.LIBRARY.PLAYLISTS,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<SongListFallback />}>
            <PlaylistsPage />
          </Suspense>
        ),
      },
      {
        id: 'radios',
        path: ROUTES.LIBRARY.RADIOS,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<SongListFallback />}>
            <Radios />
          </Suspense>
        ),
      },
      {
        id: 'local-library',
        path: '/library/local',
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<SongListFallback />}>
            <LocalLibrary />
          </Suspense>
        ),
      },
      {
        id: 'cache',
        path: ROUTES.CACHE.PAGE,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<SongListFallback />}>
            <CachePage />
          </Suspense>
        ),
      },
      {
        id: 'artist',
        path: ROUTES.ARTIST.PATH,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<AlbumFallback />}>
            <Artist />
          </Suspense>
        ),
      },
      {
        id: 'cold-start',
        path: '/artists/cold-start',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <ColdStartOnboarding />
          </Suspense>
        ),
      },
      {
        id: 'remote',
        path: '/remote',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <RemoteControlPage />
          </Suspense>
        ),
      },
      {
        id: 'ml-for-you',
        path: '/ml/for-you',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <MLForYouPage />
          </Suspense>
        ),
      },
      {
        id: 'ml-playlist',
        path: '/ml/playlist/:playlistId',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <MLPlaylistViewPage />
          </Suspense>
        ),
      },
      {
        // 🔒 Редирект /ml/discover → /ml/for-you?tab=trends
        id: 'ml-discover',
        path: '/ml/discover',
        element: <Navigate to="/ml/for-you?tab=trends" replace />,
      },
      {
        id: 'ml-stats',
        path: '/ml/stats',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <MLStatsPage />
          </Suspense>
        ),
      },
      {
        // 🆕 "Открытия" — праздничные плейлисты и новые рекомендации
        id: 'ml-discoveries',
        path: '/ml/discoveries',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <MLDiscoveriesPage />
          </Suspense>
        ),
      },
      {
        // 🔒 "Встречали в Моей Волне" — артисты из истории с лайками
        id: 'ml-my-wave-encounters',
        path: '/ml/my-wave-encounters',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <MyWaveEncountersPage />
          </Suspense>
        ),
      },
      {
        // 🔒 "В стиле" — все лайкнутые артисты
        id: 'ml-in-style-artists',
        path: '/ml/in-style-artists',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <InStyleArtistsPage />
          </Suspense>
        ),
      },
      {
        id: 'shared-listens',
        path: '/ml/shared-listens/:playlistId?',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <SharedListensPage />
          </Suspense>
        ),
      },
      {
        id: 'audiobooks',
        path: '/audiobooks',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <AudiobooksPage />
          </Suspense>
        ),
      },
      {
        id: 'audiobook-detail',
        path: '/audiobooks/:bookId',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <AudiobookDetail />
          </Suspense>
        ),
      },
      {
        id: 'genres',
        path: '/genres',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <GenreCardsPage />
          </Suspense>
        ),
      },
      {
        id: 'album',
        path: ROUTES.ALBUM.PATH,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<AlbumFallback />}>
            <Album />
          </Suspense>
        ),
      },
      {
        id: 'playlist',
        path: ROUTES.PLAYLIST.PATH,
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<PlaylistFallback />}>
            <Playlist />
          </Suspense>
        ),
      },
      {
        id: 'saved-playlist',
        path: '/library/playlists/saved/:playlistType/:playlistId',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <SavedPlaylistPage />
          </Suspense>
        ),
      },
      {
        id: 'audiobook-author',
        path: '/audiobooks/author/:authorId/:authorName?',
        errorElement: <ErrorPage />,
        element: (
          <Suspense>
            <AudiobookAuthor />
          </Suspense>
        ),
      },
      {
        id: 'podcasts',
        path: ROUTES.LIBRARY.PODCASTS,
        errorElement: <ErrorPage />,
        loader: podcastsLoader,
        element: (
          <Suspense fallback={<AlbumsFallback />}>
            <PodcastsList />
          </Suspense>
        ),
      },
      {
        id: 'podcast',
        path: ROUTES.PODCASTS.PATH,
        errorElement: <ErrorPage />,
        loader: podcastsLoader,
        element: (
          <Suspense fallback={<PodcastFallback />}>
            <Podcast />
          </Suspense>
        ),
      },
      {
        id: 'episode',
        path: ROUTES.EPISODES.PATH,
        errorElement: <ErrorPage />,
        loader: podcastsLoader,
        element: (
          <Suspense fallback={<EpisodeFallback />}>
            <Episode />
          </Suspense>
        ),
      },
      {
        id: 'latest-episodes',
        path: ROUTES.EPISODES.LATEST,
        errorElement: <ErrorPage />,
        loader: podcastsLoader,
        element: (
          <Suspense fallback={<LatestEpisodesFallback />}>
            <LatestEpisodes />
          </Suspense>
        ),
      },
      {
        id: 'wrapped',
        path: '/wrapped',
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<HomeFallback />}>
            <WrappedPage />
          </Suspense>
        ),
      },
      {
        id: 'history',
        path: '/history',
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<SongListFallback />}>
            <HistoryPage />
          </Suspense>
        ),
      },
      {
        id: 'search',
        path: '/search',
        errorElement: <ErrorPage />,
        element: (
          <Suspense fallback={<HomeFallback />}>
            <SearchPage />
          </Suspense>
        ),
      },
      {
        id: 'error',
        path: '*',
        element: (
          <Suspense>
            <ErrorPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    id: 'login',
    path: ROUTES.SERVER_CONFIG,
    loader: loginLoader,
    element: (
      <Suspense>
        <Login />
      </Suspense>
    ),
  },
])
