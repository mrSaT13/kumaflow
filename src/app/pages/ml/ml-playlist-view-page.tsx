/**
 * Страница просмотра и редактирования ML плейлиста
 * С красивой обложкой-коллажем
 */

import {
  ArrowLeft,
  Clock,
  Heart,
  Music,
  Play,
  Save,
  Share2,
  Shuffle,
  Trash2,
  GripVertical,
  RefreshCw,  // 🆕 Кнопка перегенерации
  Star,       // 🆕 Рейтинг плейлиста 1-5
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { getSimpleCoverArtUrl } from '@/api/httpClient'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent } from '@/app/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { subsonic } from '@/service/subsonic'
import { llmService } from '@/service/llm-service'
import {
  useMLPlaylistsState,
  useMLPlaylistsStateActions,
} from '@/store/ml-playlists-state.store'
import { usePlayerActions, usePlayerStore } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function MLPlaylistViewPage() {
  const navigate = useNavigate()
  const { playlistId } = useParams<{ playlistId: string }>()

  const { setSongList } = usePlayerActions()
  const { getPlaylist, removePlaylist, updatePlaylist, addPlaylist } = useMLPlaylistsStateActions()
  const { currentList } = usePlayerStore()
  const { removeSongFromQueue } = usePlayerActions()

  // 🆕 Состояние рейтинга плейлиста
  const [playlistRating, setPlaylistRating] = useState(0)

  // 🆕 Загрузка рейтинга из localStorage
  const loadPlaylistRating = (pid: string) => {
    try {
      const key = `ml-playlist-rating-${pid}`
      const saved = localStorage.getItem(key)
      if (saved) {
        const rating = parseInt(saved)
        setPlaylistRating(rating)
        console.log(`[MLPlaylistView] Loaded rating ${rating} for ${pid}`)
      }
    } catch (error) {
      console.error('[MLPlaylistView] Failed to load rating:', error)
    }
  }

  // 🆕 Сохранение рейтинга в localStorage
  const savePlaylistRating = (pid: string, rating: number) => {
    try {
      const key = `ml-playlist-rating-${pid}`
      localStorage.setItem(key, rating.toString())
      console.log(`[MLPlaylistView] Saved rating ${rating} for ${pid}`)

      // 🆕 Передаём рейтинг в ML для учёта при генерации
      const { useMLPlaylistsStore } = require('@/store/ml-playlists.store')
      useMLPlaylistsStore.getState().recordPlaylistRating(pid, rating)
    } catch (error) {
      console.error('[MLPlaylistView] Failed to save rating:', error)
    }
  }

  // 🆕 Функция перегенерации плейлиста
  const handleRegenerate = async () => {
    if (!playlistId) return
    toast.info('🔄 Перегенерация плейлиста...', { autoClose: 2000 })
    try {
      const { useMLStore } = await import('@/store/ml.store')
      const { generateDailyMix, generateDiscoverWeekly, generateMyWavePlaylist } = await import('@/service/ml-wave-service')

      const profile = useMLStore.getState().getProfile()
      const ratings = useMLStore.getState().ratings

      let result: any

      if (playlistId === 'daily-mix') {
        result = await generateDailyMix(profile.likedSongs || [], profile.preferredGenres, profile.preferredArtists || {}, ratings, 25)
      } else if (playlistId === 'discover-weekly') {
        result = await generateDiscoverWeekly(profile.likedSongs || [], profile.preferredGenres, 20, ratings)
      } else if (playlistId === 'my-wave' || playlistId === 'ml-recommendations') {
        result = { playlist: await generateMyWavePlaylist(profile.likedSongs || [], ratings, 25, true) }
      } else {
        toast.info('ℹ️ Для этого типа плейлиста перегенерация недоступна', { autoClose: 3000 })
        return
      }

      if (result?.playlist?.songs && result.playlist.songs.length > 0) {
        // Обновляем плейлист
        addPlaylist({
          id: playlistId,
          type: playlistId,
          name: result.playlist.name || playlist.name,
          description: result.playlist.description || playlist.description || '',
          songs: result.playlist.songs,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })

        setSongList(result.playlist.songs, 0, false, undefined, playlistId)
        toast.success(`✅ Плейлист перегенерирован: ${result.playlist.songs.length} треков!`, { autoClose: 2000 })

        // Обновляем локальный стейт
        setPlaylist({
          ...playlist,
          songs: result.playlist.songs,
          name: result.playlist.name || playlist.name,
        })
      }
    } catch (error) {
      console.error('[MLPlaylist] Regeneration error:', error)
      toast.error('Ошибка при перегенерации', { autoClose: 2000 })
    }
  }

  const [playlist, setPlaylist] = useState<{
    id: string
    name: string
    description?: string
    songs: ISong[]
    createdAt: number
    sharedTracksInfo?: Record<string, { accounts: string[]; totalPlays: number }>
  } | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [editName, setEditName] = useState('')
  const [coverImages, setCoverImages] = useState<string[]>([])
  const [removingSongId, setRemovingSongId] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [llmComment, setLlmComment] = useState<string | null>(null)
  const [commentGenerated, setCommentGenerated] = useState(false) // Флаг чтобы генерировать только один раз
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Drag-and-drop сенсоры
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Обработчик перетаскивания
  const handleDragEnd = (event: any) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = playlist.songs.findIndex(s => s.id === active.id)
      const newIndex = playlist.songs.findIndex(s => s.id === over.id)

      const newSongs = arrayMove(playlist.songs, oldIndex, newIndex)
      setPlaylist({ ...playlist, songs: newSongs })

      // Сохраняем новый порядок
      updatePlaylist(playlistId!, { songs: newSongs })

      toast.success('Порядок треков изменён', { type: 'success' })
    }
  }

  // Удаление трека из плейлиста с синхронизацией
  const handleRemoveSong = (songId: string, songIndex: number) => {
    if (!playlist) return

    // 1. Проверяем играет ли этот плейлист СЕЙЧАС (до удаления!)
    const currentList = usePlayerStore.getState().songlist.currentList
    const isPlayingThisPlaylist = currentList?.some(
      (song: ISong) => song.id === songId
    ) || false

    // 2. Запускаем анимацию удаления
    setRemovingSongId(songId)

    // 3. Удаляем из локального состояния страницы через небольшую задержку (для анимации)
    setTimeout(() => {
      const updatedSongs = playlist.songs.filter((s) => s.id !== songId)
      
      // Обновляем локальное состояние
      setPlaylist({
        ...playlist,
        songs: updatedSongs,
      })

      // 4. Обновляем в ml-playlists-state.store через addPlaylist
      addPlaylist({
        id: playlist.id,
        type: playlistId!,
        name: playlist.name,
        description: playlist.description,
        songs: updatedSongs,
        createdAt: playlist.createdAt.toString(),
        lastUpdated: new Date().toISOString(),
      })

      // 5. Синхронизируем с очередью плеера
      if (isPlayingThisPlaylist) {
        // Удаляем трек из очереди плеера
        removeSongFromQueue(songId)
      }

      setRemovingSongId(null)
    }, 300)
  }

  // Компонент сортируемого трека
  const SortableTrack = ({ song, index }: { song: ISong; index: number }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: song.id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center gap-3 p-3 hover:bg-accent/50 transition-all duration-300 ${
          removingSongId === song.id
            ? 'opacity-0 translate-x-4'
            : 'opacity-100 translate-x-0'
        } group`}
        {...attributes}
      >
        {/* Drag handle - всегда виден */}
        <button
          className="text-muted-foreground hover:text-primary cursor-move"
          {...listeners}
          title="Перетащить для изменения порядка"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        
        <span className="text-sm text-muted-foreground w-8 text-center">
          {index + 1}
        </span>
        <img
          src={getSimpleCoverArtUrl(
            song.albumId || song.id,
            'album',
            '100',
          )}
          alt={song.title}
          className="w-12 h-12 rounded object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement
            target.src = '/default_album_art.png'
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{song.title}</div>
          <div className="text-sm text-muted-foreground truncate">
            {song.artist}
          </div>
        </div>
        <div className="hidden md:block text-sm text-muted-foreground">
          {song.album}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-12 text-right">
            {formatDuration(song.duration)}
          </span>
          {/* Кнопка лайка */}
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              // TODO: Логика лайка
              console.log('Like track:', song.id)
            }}
            className={`opacity-0 group-hover:opacity-100 transition-opacity ${
              song.starred ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-red-500'
            }`}
            title={song.starred ? 'Убрать из избранных' : 'В избранное'}
          >
            <Heart className={`w-4 h-4 ${song.starred ? 'fill-current' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSongList(playlist.songs, index)
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            title="Воспроизвести"
          >
            <Play className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleRemoveSong(song.id, index)}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
            title="Удалить из плейлиста"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
    )
  }
  useEffect(() => {
    if (playlistId && !commentGenerated) {
      setIsLoading(true)
      // playlistId теперь это тип плейлиста (например 'daily-mix', 'my-wave')
      const savedPlaylist = getPlaylist(playlistId)

      if (savedPlaylist) {
        setPlaylist({
          ...savedPlaylist,
          createdAt: savedPlaylist.createdAt
            ? new Date(savedPlaylist.createdAt).getTime()
            : Date.now(),
          sharedTracksInfo: (savedPlaylist as any).sharedTracksInfo || {},
        } as any)
        setLastUpdated(savedPlaylist.lastUpdated || null)
        setEditName(savedPlaylist.name)

        // 🆕 Загружаем рейтинг плейлиста
        loadPlaylistRating(playlistId)

        // Генерируем детальный LLM комментарий для страницы (только один раз!)
        if (savedPlaylist.songs && savedPlaylist.songs.length > 0 && !commentGenerated) {
          setCommentGenerated(true) // Ставим флаг сразу
          
          const genres = [...new Set(savedPlaylist.songs.map((s: any) => s.genre).filter(Boolean))]
          const artists = [...new Set(savedPlaylist.songs.map((s: any) => s.artist).filter(Boolean))]

          llmService.generateDetailedComment({
            type: savedPlaylist.type,
            trackCount: savedPlaylist.songs.length,
            genres: genres.slice(0, 5),
            artists: artists.slice(0, 5),
          }).then(comment => setLlmComment(comment))
        }
        
        console.log('[MLPlaylistView] Loaded playlist:', savedPlaylist.type, savedPlaylist.id)
        setIsLoading(false)
      } else {
        // Плейлист не найден - показываем кнопку генерации
        console.warn('[MLPlaylistView] Playlist not found:', playlistId)
        setIsLoading(false)
        setNotFound(true)
      }
    }
  }, [playlistId])

  // Обновляем плейлист при возврате на страницу (если он был перегенерирован)
  useEffect(() => {
    if (playlistId && !commentGenerated) {
      const savedPlaylist = getPlaylist(playlistId)
      if (savedPlaylist) {
        setPlaylist({
          ...savedPlaylist,
          createdAt: savedPlaylist.createdAt
            ? new Date(savedPlaylist.createdAt).getTime()
            : Date.now(),
          sharedTracksInfo: (savedPlaylist as any).sharedTracksInfo || {},
        } as any)
        setLastUpdated(savedPlaylist.lastUpdated || null)
        
        // Генерируем новый детальный комментарий (только один раз!)
        if (savedPlaylist.songs && savedPlaylist.songs.length > 0 && !commentGenerated) {
          setCommentGenerated(true) // Ставим флаг сразу
          
          const genres = [...new Set(savedPlaylist.songs.map((s: any) => s.genre).filter(Boolean))]
          const artists = [...new Set(savedPlaylist.songs.map((s: any) => s.artist).filter(Boolean))]
          
          llmService.generateDetailedComment({
            type: savedPlaylist.type,
            trackCount: savedPlaylist.songs.length,
            genres: genres.slice(0, 5),
            artists: artists.slice(0, 5),
          }).then(comment => setLlmComment(comment))
        }
        
        console.log('[MLPlaylistView] Refreshed playlist:', savedPlaylist.type, savedPlaylist.id)
      }
    }
  }, [playlistId]) // Зависимость от playlistId
  
  // Подписка на автообновление плейлиста - ОТКЛЮЧЕНО (бесило)
  useEffect(() => {
    // Убрали авто-обновление - теперь только вручную по кнопке
    return () => {}
  }, [])

  // Загружаем обложки для коллажа - СЛУЧАЙНЫЕ при каждом входе
  useEffect(() => {
    if (playlist?.songs && playlist.songs.length > 0) {
      // Перемешиваем треки для разнообразия
      const shuffled = [...playlist.songs].sort(() => Math.random() - 0.5)
      const images = shuffled
        .slice(0, 9) // Берём первые 9 треков для коллажа 3x3
        .map((song) =>
          getSimpleCoverArtUrl(song.albumId || song.id, 'album', '300'),
        )
      setCoverImages(images)
      console.log('[MLPlaylistView] Random collage generated:', images.length, 'covers')
    }
  }, [playlist?.songs])

  // Сохранение на Navidrome
  const handleSaveToNavidrome = async () => {
    if (!playlist || isSaving) return

    setIsSaving(true)
    try {
      const playlistName = editName || playlist.name

      const response = await subsonic.playlists.createPlaylist(
        playlistName,
        playlist.description ||
          `ML Generated Playlist - ${new Date().toLocaleDateString()}`,
        playlist.songs.map((s) => s.id),
      )

      if (response) {
        toast.success(`✅ Плейлист "${playlistName}" сохранён на сервере!`)
        navigate('/library/playlists')
      } else {
        throw new Error('Failed to create playlist')
      }
    } catch (error: any) {
      console.error('[ML Playlist] Save error:', error)
      toast.error(`❌ Ошибка сохранения: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Воспроизвести весь плейлист
  const handlePlayAll = () => {
    if (!playlist || playlist.songs.length === 0) return

    setSongList(playlist.songs, 0)
    toast.success(`▶️ Воспроизведение ${playlist.songs.length} треков`)
  }

  // Перемешать
  const handleShuffle = () => {
    if (!playlist || playlist.songs.length === 0) return

    const shuffled = [...playlist.songs].sort(() => Math.random() - 0.5)
    setPlaylist({ ...playlist, songs: shuffled })
    toast.success('🔀 Плейлист перемешан')
  }

  // Поделиться плейлистом
  const handleShare = () => {
    if (!playlist) return

    const shareUrl = `${window.location.origin}/#/ml/playlist/${playlist.id}`
    setShareLink(shareUrl)
    setIsShareOpen(true)
  }

  // Копировать ссылку
  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink)
    toast.success('Ссылка скопирована в буфер обмена')
  }

  // Форматирование длительности
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Подсчёт общей длительности
  const totalDuration =
    playlist?.songs.reduce((sum, song) => sum + (song.duration || 0), 0) || 0

  if (notFound) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-8">
          <Music className="w-16 h-16 mx-auto mb-6 text-muted-foreground" />
          <h2 className="text-2xl font-bold mb-3">Плейлист ещё не создан</h2>
          <p className="text-muted-foreground mb-6">
            Сгенерируйте плейлист "{playlistId}" чтобы начать слушать
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => navigate('/ml/for-you')}
              variant="outline"
            >
              На страницу ML
            </Button>
            <Button
              onClick={async () => {
                // Генерируем плейлист
                try {
                  const { useMLStore } = await import('@/store/ml.store')
                  const { usePlayerActions } = await import('@/store/player.store')
                  const { generateDailyMix, generateDiscoverWeekly, generateMyWavePlaylist } = await import('@/service/ml-wave-service')

                  const profile = useMLStore.getState().getProfile()
                  const ratings = useMLStore.getState().ratings
                  const { setSongList } = usePlayerActions()

                  let result: any
                  const playlistType = playlistId as string

                  if (playlistType === 'daily-mix') {
                    result = await generateDailyMix(
                      profile.likedSongs || [],
                      profile.preferredGenres,
                      profile.preferredArtists || {},
                      ratings,
                      25
                    )
                  } else if (playlistType === 'discover-weekly') {
                    result = await generateDiscoverWeekly(
                      profile.likedSongs || [],
                      profile.preferredGenres,
                      20,
                      ratings
                    )
                  } else if (playlistType === 'my-wave' || playlistType === 'ml-recommendations') {
                    result = { playlist: await generateMyWavePlaylist(
                      profile.likedSongs || [],
                      ratings,
                      25,
                      true
                    )}
                  }

                  if (result?.playlist?.songs && result.playlist.songs.length > 0) {
                    const { addPlaylist } = useMLPlaylistsStateActions()
                    addPlaylist({
                      id: playlistType,
                      type: playlistType,
                      name: result.playlist.name || playlistType,
                      description: result.playlist.description || '',
                      songs: result.playlist.songs,
                      createdAt: new Date().toISOString(),
                      lastUpdated: new Date().toISOString(),
                    })
                    setSongList(result.playlist.songs, 0, false, undefined, playlistType)
                    toast.success(`▶️ ${playlistType}: ${result.playlist.songs.length} треков!`, { type: 'success' })

                    // Перезагружаем страницу чтобы показать плейлист
                    setNotFound(false)
                    const savedPlaylist = getPlaylist(playlistId!)
                    if (savedPlaylist) {
                      setPlaylist({
                        ...savedPlaylist,
                        createdAt: new Date(savedPlaylist.createdAt).getTime(),
                      } as any)
                      setEditName(savedPlaylist.name)
                    }
                  }
                } catch (error) {
                  console.error('[MLPlaylistView] Generation error:', error)
                  toast.error('Ошибка генерации плейлиста', { type: 'error' })
                }
              }}
            >
              <Play className="w-4 h-4 mr-2" />
              Сгенерировать и играть
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Music className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Загрузка плейлиста...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-b from-purple-900/50 via-background to-background">
      {/* Заголовок с коллажем */}
      <div className="relative h-64 md:h-80 overflow-hidden">
        {/* Коллаж обложек */}
        <div className="absolute inset-0 grid grid-cols-3 gap-1 p-1">
          {coverImages.map((src, index) => (
            <div key={index} className="relative overflow-hidden rounded-sm">
              <img
                src={src}
                alt={`Cover ${index}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/20" />
            </div>
          ))}
          {coverImages.length === 0 && (
            <div className="col-span-3 flex items-center justify-center bg-muted/50">
              <Music className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Градиент поверх коллажа */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        {/* Кнопка назад */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/ml/for-you')}
          className="absolute top-4 left-4 z-10 bg-black/20 hover:bg-black/40 text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
      </div>

      {/* Информация о плейлисте */}
      <div className="container mx-auto px-4 -mt-20 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end gap-6 mb-8">
          {/* Большая обложка (первая из коллажа) */}
          <div className="w-48 h-48 md:w-52 md:h-52 rounded-lg shadow-2xl overflow-hidden flex-shrink-0 mx-auto md:mx-0">
            {coverImages.length > 0 ? (
              <img
                src={coverImages[0]}
                alt={playlist.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Music className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Название и кнопки */}
          <div className="flex-1 text-center md:text-left">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-3xl md:text-4xl font-bold text-center md:text-left mb-2 bg-transparent border-none focus-visible:ring-0"
              placeholder="Название плейлиста"
            />
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 justify-center md:justify-start">
              <span>{playlist.songs.length} треков • {formatDuration(totalDuration)}</span>
              {lastUpdated && (
                <>
                  <span>•</span>
                  <span title={new Date(lastUpdated).toLocaleString()}>
                    Обновлено: {new Date(lastUpdated).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
            {llmComment && (
              <div className="mb-4 text-center md:text-left">
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {llmComment}
                </p>
              </div>
            )}

            {/* 🆕 Рейтинг плейлиста звёздами 1-5 */}
            <div className="mb-4 flex items-center gap-3 justify-center md:justify-start">
              <span className="text-sm text-muted-foreground">Оценка:</span>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      const newRating = star === playlistRating ? 0 : star  // Toggle
                      setPlaylistRating(newRating)
                      savePlaylistRating(playlistId!, newRating)
                      toast.info(newRating === 0 ? 'Рейтинг убран' : `Оценка: ${star} из 5`, { autoClose: 1500 })
                    }}
                    className="transition-all duration-150 hover:scale-110"
                    title={`${star} ${star === 1 ? 'звезда' : star < 5 ? 'звезды' : 'звёзд'}`}
                  >
                    <Star
                      className={`w-5 h-5 transition-colors duration-150 ${
                        star <= playlistRating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground/40'
                      }`}
                    />
                  </button>
                ))}
              </div>
              {playlistRating > 0 && (
                <span className="text-xs text-muted-foreground">({playlistRating}/5)</span>
              )}
            </div>
            {playlist.sharedTracksInfo && Object.keys(playlist.sharedTracksInfo).length > 0 && (
              <div className="mb-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
                <h4 className="text-sm font-medium mb-3">🌍 Что слушают другие</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {Object.entries(playlist.sharedTracksInfo)
                    .sort((a, b) => b[1].totalPlays - a[1].totalPlays)
                    .slice(0, 15)
                    .map(([songId, info]) => {
                      const song = playlist.songs.find(s => s.id === songId)
                      if (!song) return null
                      const uniqueAccounts = [...new Set(info.accounts)]
                      return (
                        <div key={songId} className="text-xs flex justify-between items-center py-1 border-b border-primary/5 last:border-0">
                          <span className="truncate flex-1">
                            <span className="font-medium">{song.artist}</span>
                            <span className="text-muted-foreground"> - {song.title}</span>
                          </span>
                          <span className="text-right ml-2 text-muted-foreground whitespace-nowrap">
                            {uniqueAccounts.join(', ')} • {info.totalPlays} раз
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
              {/* 🔄 Перегенерировать */}
              <button
                onClick={handleRegenerate}
                className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--theme-accent)', color: 'white' }}
                title="Перегенерировать плейлист"
              >
                <RefreshCw className="w-5 h-5" />
              </button>

              {/* ▶️ Воспроизвести */}
              <button
                onClick={handlePlayAll}
                disabled={playlist.songs.length === 0}
                className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--theme-accent)', color: 'white' }}
                title="Воспроизвести всё"
              >
                <Play className="w-5 h-5" />
              </button>

              {/* 🔀 Перемешать */}
              <button
                onClick={handleShuffle}
                disabled={playlist.songs.length === 0}
                className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--theme-background)', color: 'var(--theme-foreground)' }}
                title="Перемешать"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              {/* 💾 Сохранить на сервер */}
              <button
                onClick={handleSaveToNavidrome}
                disabled={isSaving || playlist.songs.length === 0}
                className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--theme-background)', color: 'var(--theme-foreground)' }}
                title="Сохранить на сервер"
              >
                <Save className="w-5 h-5" />
              </button>

              {/* 🔗 Поделиться */}
              <button
                onClick={handleShare}
                className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95"
                style={{ backgroundColor: 'var(--theme-background)', color: 'var(--theme-foreground)' }}
                title="Поделиться"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Список треков */}
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-0">
            {playlist.songs.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <div className="divide-y">
                  <SortableContext
                    items={playlist.songs.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {playlist.songs.map((song, index) => (
                      <SortableTrack key={song.id} song={song} index={index} />
                    ))}
                  </SortableContext>
                </div>
              </DndContext>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Плейлист пуст</p>
                <Button variant="link" onClick={() => navigate('/ml/for-you')}>
                  Сгенерировать новый плейлист
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Диалог поделиться */}
      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Поделиться плейлистом</DialogTitle>
            <DialogDescription>
              Скопируйте ссылку чтобы поделиться плейлистом
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Input value={shareLink} readOnly className="flex-1" />
            <Button onClick={copyShareLink}>Копировать</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
