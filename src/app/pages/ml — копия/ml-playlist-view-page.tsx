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
  const { getPlaylist, removePlaylist, updatePlaylist } = useMLPlaylistsStateActions()
  const { currentList } = usePlayerStore()
  const { removeSongFromQueue } = usePlayerActions()

  const [playlist, setPlaylist] = useState<{
    id: string
    name: string
    description?: string
    songs: ISong[]
    createdAt: number
  } | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [editName, setEditName] = useState('')
  const [coverImages, setCoverImages] = useState<string[]>([])
  const [removingSongId, setRemovingSongId] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
    if (playlistId) {
      setIsLoading(true)
      // playlistId теперь это тип плейлиста (например 'daily-mix', 'my-wave')
      const savedPlaylist = getPlaylist(playlistId)
      
      if (savedPlaylist) {
        setPlaylist({
          ...savedPlaylist,
          createdAt: savedPlaylist.createdAt
            ? new Date(savedPlaylist.createdAt).getTime()
            : Date.now(),
        } as any)
        setLastUpdated(savedPlaylist.lastUpdated || null)
        setEditName(savedPlaylist.name)
        console.log('[MLPlaylistView] Loaded playlist:', savedPlaylist.type, savedPlaylist.id)
        setIsLoading(false)
      } else {
        // Плейлист не найден - идём назад
        console.warn('[MLPlaylistView] Playlist not found:', playlistId)
        toast.error('Плейлист не найден. Сначала сгенерируйте его.')
        navigate('/ml/for-you')
      }
    }
  }, [playlistId])

  // Обновляем плейлист при возврате на страницу (если он был перегенерирован)
  useEffect(() => {
    if (playlistId) {
      const savedPlaylist = getPlaylist(playlistId)
      if (savedPlaylist) {
        setPlaylist({
          ...savedPlaylist,
          createdAt: savedPlaylist.createdAt
            ? new Date(savedPlaylist.createdAt).getTime()
            : Date.now(),
        } as any)
        console.log('[MLPlaylistView] Refreshed playlist:', savedPlaylist.type, savedPlaylist.id)
      }
    }
  }, []) // Проверяем при монтировании
  
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

  // Удаление трека из плейлиста с синхронизацией
  const handleRemoveSong = (songId: string, songIndex: number) => {
    if (!playlist) return

    // 1. Проверяем играет ли этот плейлист СЕЙЧАС (до удаления!)
    const isPlayingThisPlaylist = currentList.some(
      (song: ISong) => song.id === songId
    )

    // 2. Запускаем анимацию удаления
    setRemovingSongId(songId)

    // 3. Удаляем из локального состояния страницы через небольшую задержку (для анимации)
    setTimeout(() => {
      const updatedSongs = playlist.songs.filter((s) => s.id !== songId)
      setPlaylist({
        ...playlist,
        songs: updatedSongs,
      })

      // 4. Обновляем в ml-playlists-state.store
      updatePlaylist(playlist.id, { songs: updatedSongs as any })

      // 5. Синхронизируем с очередью плеера
      if (isPlayingThisPlaylist) {
        // Удаляем трек из очереди плеера
        removeSongFromQueue(songId)
      }

      setRemovingSongId(null)
    }, 300)
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
            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
              <Button
                size="icon"
                onClick={handlePlayAll}
                disabled={playlist.songs.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white rounded-full"
                title="Воспроизвести всё"
              >
                <Play className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                onClick={handleShuffle}
                disabled={playlist.songs.length === 0}
                className="rounded-full"
                title="Перемешать"
              >
                <Shuffle className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={handleSaveToNavidrome}
                disabled={isSaving || playlist.songs.length === 0}
                className="rounded-full"
                title="Сохранить на сервер"
              >
                <Save className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={handleShare}
                className="rounded-full"
                title="Поделиться"
              >
                <Share2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Список треков */}
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-0">
            {playlist.songs.length > 0 ? (
              <div className="divide-y">
                {playlist.songs.map((song, index) => (
                  <div
                    key={song.id}
                    className={`flex items-center gap-3 p-3 hover:bg-accent/50 transition-all duration-300 ${
                      removingSongId === song.id
                        ? 'opacity-0 translate-x-4'
                        : 'opacity-100 translate-x-0'
                    } group`}
                  >
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
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
