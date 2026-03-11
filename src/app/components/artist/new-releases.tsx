/**
 * Компонент новых релизов из Apple Music
 *
 * Показывает список новых треков аналогично секции "Популярное"
 * - Иконка вместо эмодзи
 * - Статус "В библиотеке" если трек есть
 * - Кнопка Play / Добавить
 * - Перевод жанров
 * - Двухэтапный поиск: артист+трек → только трек
 */

import { useEffect, useState, useRef } from 'react'
import { appleMusicService, type iTunesResult } from '@/service/apple-music-api'
import { useExternalApi } from '@/store/external-api.store'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { Play, Pause, Check, Music2, Plus, Loader2, ExternalLink } from 'lucide-react'
import { subsonic } from '@/service/subsonic'
import { usePlayerActions } from '@/store/player.store'
import { toast } from 'react-toastify'
import { useNavigate } from 'react-router-dom'

interface NewReleasesProps {
  artistName?: string // Если есть - показываем новинки артиста, если нет - общие новинки
}

interface TrackWithStatus extends iTunesResult {
  inLibrary: boolean
  isSearching: boolean
  libraryTrackId?: string
  libraryTrack?: ISong
  previewUrl?: string // 30-сек превью из Apple Music
}

// Словарь жанров Apple Music → Русский
const GENRE_TRANSLATIONS: Record<string, string> = {
  'Alternative': 'Альтернатива',
  'Rock': 'Рок',
  'Pop': 'Поп',
  'Hip-Hop/Rap': 'Хип-хоп/Рэп',
  'Electronic': 'Электронная',
  'Dance': 'Танцевальная',
  'R&B/Soul': 'R&B/Соул',
  'Indie': 'Инди',
  'Metal': 'Метал',
  'Punk': 'Панк',
  'Jazz': 'Джаз',
  'Classical': 'Классика',
  'Country': 'Кантри',
  'Folk': 'Фолк',
  'Blues': 'Блюз',
  'Reggae': 'Регги',
  'World': 'Мировая',
  'Latin': 'Латинская',
  'K-Pop': 'K-Pop',
  'J-Pop': 'J-Pop',
  'Anime': 'Аниме',
  'Soundtrack': 'Саундтрек',
  'Ambient': 'Амбиент',
  'House': 'Хаус',
  'Techno': 'Техно',
  'Trance': 'Транс',
  'Drum & Bass': 'Драм-н-бейс',
  'Dubstep': 'Дабстеп',
  'Hardcore': 'Хардкор',
  'Grunge': 'Гранж',
  'Hard Rock': 'Хард-рок',
  'Progressive': 'Прогрессив',
  'Psychedelic': 'Психоделика',
  'Garage': 'Гараж',
  'Emo': 'Эмо',
  'Ska': 'Ска',
  'Gospel': 'Госпел',
  'Funk': 'Фанк',
  'Disco': 'Диско',
  'New Wave': 'Новая волна',
  'Post-Punk': 'Пост-панк',
  'Post-Rock': 'Пост-рок',
  'Shoegaze': 'Шугейз',
  'Dream Pop': 'Дрим-поп',
  'Trip-Hop': 'Трип-хоп',
  'Downtempo': 'Даунтемпо',
  'Chillout': 'Чиллаут',
  'Lo-Fi': 'Ло-фай',
  'Acoustic': 'Акустика',
  'Singer/Songwriter': 'Автор-исполнитель',
  'Vocal': 'Вокал',
  'Instrumental': 'Инструментал',
  'Experimental': 'Эксперимент',
  'Avant-Garde': 'Авангард',
  'Minimal': 'Минимал',
  'Deep House': 'Дип-хаус',
  'Tech House': 'Тек-хаус',
  'Progressive House': 'Прогрессив-хаус',
  'Electro': 'Электро',
  'Synthpop': 'Синтипоп',
  'New Romantic': 'Новый романтизм',
  'Gothic': 'Готика',
  'Industrial': 'Индастриал',
  'EBM': 'EBM',
  'Future Bass': 'Фьюче-бейс',
  'Trap': 'Трэп',
  'Drill': 'Дрилл',
  'Grime': 'Грайм',
  'UK Garage': 'UK Гарэж',
  'Breakbeat': 'Брейкбит',
  'Jungle': 'Джангл',
  'Hardstyle': 'Хардстайл',
  'Psytrance': 'Пситранс',
  'Goa': 'Гоа',
}

function translateGenre(genre: string): string {
  return GENRE_TRANSLATIONS[genre] || genre
}

export function NewReleases({ artistName }: NewReleasesProps) {
  const { settings } = useExternalApi()
  const { setSongList } = usePlayerActions()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tracks, setTracks] = useState<TrackWithStatus[]>([])
  const [playingPreviewId, setPlayingPreviewId] = useState<string | number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    async function loadTracks() {
      if (!settings.appleMusicEnabled) {
        setLoading(false)
        return
      }

      setLoading(true)

      try {
        let newAlbums: any[] = []

        if (artistName) {
          // Новинки конкретного артиста
          newAlbums = await appleMusicService.getNewReleases(artistName, 5)
        } else {
          // Общие новинки (топ альбомов)
          const { appleMusicService } = await import('@/service/apple-music-api')
          const searchResults = await appleMusicService.searchAlbums('New Releases 2025', 10)
          newAlbums = searchResults
        }

        if (newAlbums.length === 0) {
          setLoading(false)
          return
        }

        // Собираем треки из новых альбомов
        const tracksWithStatus: TrackWithStatus[] = []

        for (const album of newAlbums.slice(0, 5)) {
          // Получаем треки из альбома Apple Music
          const albumTracks = await appleMusicService.getAlbumTracks(album.collectionId)

          // Ищем эти треки в библиотеке Navidrome
          for (const track of albumTracks.slice(0, 3)) {
            tracksWithStatus.push({
              ...track,
              inLibrary: false,
              isSearching: true,
              libraryTrackId: undefined,
              libraryTrack: undefined,
              previewUrl: track.previewUrl,
            })

            if (tracksWithStatus.length >= 25) break
          }

          if (tracksWithStatus.length >= 25) break
        }

        setTracks(tracksWithStatus)

        // Асинхронно ищем треки в библиотеке
        for (let i = 0; i < tracksWithStatus.length; i++) {
          const track = tracksWithStatus[i]
          const libraryTrack = await findInLibrary(track.artistName, track.trackName)

          setTracks(prev => prev.map(t => {
            if (t.trackId === track.trackId) {
              return {
                ...t,
                inLibrary: !!libraryTrack,
                isSearching: false,
                libraryTrackId: libraryTrack?.id,
                libraryTrack,
              }
            }
            return t
          }))
        }

        setLoading(false)
      } catch (error) {
        console.error('[NewReleases] Error:', error)
        setLoading(false)
      }
    }

    loadTracks()
  }, [artistName, settings.appleMusicEnabled])

  // Поиск трека в библиотеке (двухэтапный: артист+трек → только трек)
  async function findInLibrary(artist: string, title: string) {
    try {
      console.log('[NewReleases] 🔍 Поиск в библиотеке:', `${artist} - ${title}`)

      // Используем стандартный search.get из subsonic
      const searchResult = await subsonic.search.get({
        query: title,
        songCount: 50,
        artistCount: 0,
        albumCount: 0,
      })

      const foundSongs = searchResult?.song || []
      console.log(`[NewReleases] Найдено треков: ${foundSongs.length}`)

      if (foundSongs.length > 0) {
        // Ищем совпадение по названию и артисту
        const searchTitle = title.toLowerCase().trim()
        const searchArtist = artist.toLowerCase().trim()

        for (const song of foundSongs) {
          const libraryTitle = song.title.toLowerCase().trim()
          const libraryArtist = song.artist?.toLowerCase().trim() || ''

          // Проверяем совпадение по названию
          const titleMatch = libraryTitle === searchTitle ||
              libraryTitle.includes(searchTitle) ||
              searchTitle.includes(libraryTitle)

          // Проверяем совпадение по артисту (если нашли по названию)
          if (titleMatch) {
            const artistMatch = libraryArtist.includes(searchArtist) ||
              searchArtist.includes(libraryArtist) ||
              libraryArtist === searchArtist

            if (artistMatch) {
              console.log('[NewReleases] ✅ Найдено точное совпадение:', song.title, '-', song.artist)
              // Получаем полную информацию о треке (с albumId)
              const songDetails = await subsonic.songs.getSong(song.id).catch(() => null)
              console.log('[NewReleases] Детали трека:', songDetails)
              return songDetails || song
            }

            // Если артист не совпал, но название точное - всё равно считаем что нашли
            if (libraryTitle === searchTitle) {
              console.log('[NewReleases] ✅ Найдено по названию:', song.title, '-', song.artist)
              // Получаем полную информацию о треке (с albumId)
              const songDetails = await subsonic.songs.getSong(song.id).catch(() => null)
              console.log('[NewReleases] Детали трека:', songDetails)
              return songDetails || song
            }
          }
        }
      }

      console.log('[NewReleases] ❌ Не найдено в библиотеке:', title)
      return null
    } catch (error) {
      console.warn('[NewReleases] Search error:', error)
      return null
    }
  }

  // Переход на страницу альбома
  function navigateToTrack(track: TrackWithStatus, event?: React.MouseEvent) {
    event?.stopPropagation()

    if (track.inLibrary && track.libraryTrackId) {
      const albumId = track.libraryTrack?.albumId
      const trackTitle = track.libraryTrack?.title || track.trackName
      const albumTitle = track.libraryTrack?.album || 'Неизвестно'

      console.log('[NewReleases] Переход к треку:', {
        trackId: track.libraryTrackId,
        albumId,
        title: trackTitle,
        album: albumTitle,
      })

      // Переходим на страницу альбома с этим треком
      if (albumId) {
        console.log('[NewReleases] Переход на страницу альбома:', `/library/albums/${albumId}`)
        navigate(`/library/albums/${albumId}`)
        toast(`Открываем альбом: ${albumTitle}`, { type: 'info' })
      } else {
        // Если нет albumId, просто воспроизводим трек
        console.log('[NewReleases] Нет albumId, воспроизводим трек')
        if (track.libraryTrack) {
          setSongList([track.libraryTrack], 0)
          toast(`Воспроизводим: ${trackTitle}`, { type: 'success' })
        }
      }
    } else {
      console.warn('[NewReleases] Нельзя перейти: трек не в библиотеке', track)
      toast('Трек не найден в библиотеке', { type: 'warning' })
    }
  }

  // Воспроизведение трека (превью или из библиотеки)
  function playTrack(track: TrackWithStatus, event?: React.MouseEvent) {
    event?.stopPropagation()
    
    if (track.inLibrary && track.libraryTrack) {
      // Трек в библиотеке — воспроизводим
      setSongList([track.libraryTrack!], 0)
      toast(`Воспроизводится: ${track.trackName}`, { type: 'success' })
    } else if (track.previewUrl) {
      // Трека нет в библиотеке — воспроизводим превью (30 сек)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      
      if (playingPreviewId === track.trackId) {
        // Уже играет — останавливаем
        setPlayingPreviewId(null)
        return
      }
      
      const audio = new Audio(track.previewUrl)
      audioRef.current = audio
      
      audio.play()
      setPlayingPreviewId(track.trackId!)
      toast(`Превью: ${track.trackName}`, { type: 'info' })
      
      audio.onended = () => {
        setPlayingPreviewId(null)
        audioRef.current = null
      }
      
      audio.onerror = () => {
        console.error('[NewReleases] Preview error:', track.trackName)
        setPlayingPreviewId(null)
      }
    } else {
      toast('Трека нет в вашей библиотеке', { type: 'info' })
    }
  }

  // Остановить превью
  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingPreviewId(null)
  }

  if (!settings.appleMusicEnabled) {
    return null
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music2 className="h-5 w-5" />
            Новые релизы
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Загрузка...</div>
        </CardContent>
      </Card>
    )
  }

  if (tracks.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music2 className="h-5 w-5" />
          Новые релизы
          {artistName && <span className="text-sm font-normal text-muted-foreground">— {artistName}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {tracks.map((track, index) => (
            <div
              key={track.trackId || index}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              {/* Обложка */}
              <div className="relative w-12 h-12 min-w-[48px] rounded overflow-hidden bg-muted">
                {track.artworkUrl100 ? (
                  <img
                    src={track.artworkUrl100.replace('100x100bb', '100x100bb')}
                    alt={track.trackName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}

                {/* Overlay с кнопкой Play/Pause при наведении */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-white hover:text-white hover:bg-white/20"
                    onClick={(e) => playTrack(track, e)}
                  >
                    {playingPreviewId === track.trackId ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Информация */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{track.trackName}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground truncate">
                    {track.artistName}
                  </p>
                  {track.primaryGenreName && (
                    <>
                      <span className="text-xs text-muted-foreground">•</span>
                      <p className="text-xs text-muted-foreground">
                        {translateGenre(track.primaryGenreName)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Статус и кнопки */}
              <div className="flex items-center gap-2">
                {track.isSearching ? (
                  <Badge variant="outline" className="text-xs">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    Поиск...
                  </Badge>
                ) : track.inLibrary ? (
                  <Badge
                    variant="default"
                    className="text-xs bg-green-600/90 hover:bg-green-600 cursor-pointer"
                    onClick={(e) => navigateToTrack(track, e)}
                    title={
                      track.libraryTrack?.albumId
                        ? `Альбом: ${track.libraryTrack.album}\nНажмите чтобы открыть`
                        : `Трек: ${track.libraryTrack?.title || track.trackName}\nНажмите чтобы открыть`
                    }
                  >
                    <Check className="h-3 w-3 mr-1" />
                    В библиотеке
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Badge>
                ) : (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      Нет в библиотеке
                    </Badge>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation()
                        toast('Функция добавления в разработке', { type: 'info' })
                      }}
                      title="Добавить"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
