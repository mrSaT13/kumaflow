/**
 * Страница управления кешем - Modern UI
 * Полный функционал: поиск, сортировка, drag-and-drop, анализ
 */

import { 
  Database, Music, Mic2, Trash2, Play, Shuffle, RefreshCw, 
  Search, SortAsc, SortDesc, GripVertical,
  BarChart3, Heart, Clock, Disc3, ChevronLeft
} from 'lucide-react'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { Progress } from '@/app/components/ui/progress'
import { Input } from '@/app/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { cacheService } from '@/service/cache-service'
import { usePlayerActions } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'
import type { IArtist } from '@/types/responses/artist'

// Сортируемый элемент таблицы
interface SortableTrackRowProps {
  track: ISong
  index: number
  onPlay: (track: ISong) => void
  onRemove: (trackId: string) => void
  formatDuration: (seconds: number) => string
  formatBytes: (bytes: number) => string
}

function SortableTrackRow({ track, index, onPlay, onRemove, formatDuration, formatBytes }: SortableTrackRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: track.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        isDragging && 'bg-primary/10 border-primary',
        'group'
      )}
    >
      <TableCell className="w-10">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="w-12">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onPlay(track)}
          className="w-8 h-8"
        >
          <Play className="w-4 h-4" />
        </Button>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <div className="font-medium">{track.title}</div>
            <div className="text-sm text-muted-foreground">{track.artist}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{track.album || '-'}</TableCell>
      <TableCell className="text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDuration(track.duration || 0)}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{track.genre || '-'}</TableCell>
      <TableCell className="text-muted-foreground">
        {track.bpm ? (
          <div className="flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            {Math.round(track.bpm)}
          </div>
        ) : '-'}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {track.valence ? (
          <div className="flex items-center gap-1">
            <Heart className="w-3 h-3" />
            {track.valence > 0.6 ? 'Позитивное' : track.valence < 0.4 ? 'Негативное' : 'Нейтральное'}
          </div>
        ) : '-'}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(track.id)}
          className="w-8 h-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </TableCell>
    </TableRow>
  )
}

interface CacheTrackCardProps {
  track: ISong
  onPlay: (track: ISong) => void
  onRemove: (trackId: string) => void
  formatDuration: (seconds: number) => string
}

function CacheTrackCard({ track, onPlay, onRemove, formatDuration }: CacheTrackCardProps) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 active:bg-accent/40">
      <Button
        variant="ghost"
        size="icon"
        className="size-10 shrink-0"
        onClick={() => onPlay(track)}
      >
        <Play className="size-4" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium">{track.title}</p>
        <p className="truncate text-sm text-muted-foreground">{track.artist}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[track.album, formatDuration(track.duration || 0)].filter(Boolean).join(' · ')}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(track.id)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

interface CacheArtistCardProps {
  artist: IArtist
  onRemove: (artistId: string) => void
}

function CacheArtistCard({ artist, onRemove }: CacheArtistCardProps) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 active:bg-accent/40">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Mic2 className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium">{artist.name}</p>
        <p className="text-xs text-muted-foreground">
          {artist.albumCount || 0} альб. · {artist.songCount || 0} треков
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(artist.id)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

export default function CachePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setSongList, play } = usePlayerActions()
  
  const [stats, setStats] = useState({
    totalItems: 0,
    totalSize: 0,
    artists: 0,
    tracks: 0,
  })
  const [cachedTracks, setCachedTracks] = useState<ISong[]>([])
  const [cachedArtists, setCachedArtists] = useState<IArtist[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [cachingProgress, setCachingProgress] = useState<{
    isCaching: boolean
    current: number
    total: number
    message: string
  }>({ isCaching: false, current: 0, total: 0, message: '' })
  
  // Поиск и сортировка
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'title' | 'artist' | 'album' | 'duration' | 'bpm'>('title')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [activeTab, setActiveTab] = useState<'tracks' | 'artists'>('tracks')

  // Сенсоры для drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Автообновление
  useEffect(() => {
    loadCache()
    
    const interval = setInterval(() => {
      loadCache(true)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  // Подписка на события кеширования
  useEffect(() => {
    const handleCacheStart = (e: any) => {
      setCachingProgress({
        isCaching: true,
        current: 0,
        total: e.detail.total,
        message: `Начало кеширования ${e.detail.total} треков...`,
      })
    }

    const handleCacheProgress = (e: any) => {
      setCachingProgress(prev => ({
        ...prev,
        current: e.detail.current,
        total: e.detail.total,
        message: `Закешировано ${e.detail.current}/${e.detail.total}`,
      }))
    }

    const handleCacheComplete = () => {
      setCachingProgress({ isCaching: false, current: 0, total: 0, message: '' })
      loadCache()
    }

    // Новое событие - обновление кэша (когда трек лайкают)
    const handleCacheUpdated = () => {
      console.log('[CachePage] Cache updated event received, reloading...')
      loadCache()
    }

    window.addEventListener('cache-start', handleCacheStart as EventListener)
    window.addEventListener('cache-progress', handleCacheProgress as EventListener)
    window.addEventListener('cache-complete', handleCacheComplete as EventListener)
    window.addEventListener('cache-updated', handleCacheUpdated as EventListener)

    return () => {
      window.removeEventListener('cache-start', handleCacheStart as EventListener)
      window.removeEventListener('cache-progress', handleCacheProgress as EventListener)
      window.removeEventListener('cache-complete', handleCacheComplete as EventListener)
      window.removeEventListener('cache-updated', handleCacheUpdated as EventListener)
    }
  }, [])

  const loadCache = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true)
    if (!silent) setIsRefreshing(true)
    
    const newStats = await cacheService.getStats()
    const tracks = cacheService.getCachedTracks()
    const artists = cacheService.getCachedArtists()

    setStats(newStats)
    setCachedTracks(tracks)
    setCachedArtists(artists)
    
    if (!silent) setIsLoading(false)
    setTimeout(() => setIsRefreshing(false), 300)
  }, [])

  const handleClearCache = () => {
    if (!confirm('Вы уверены что хотите очистить весь кеш?')) return

    const result = cacheService.clearCache()
    toast.success(`Кеш очищен: ${result.tracks} треков, ${result.artists} артистов`)
    loadCache()
  }

  const handlePlayAll = () => {
    if (cachedTracks.length === 0) {
      toast.warning('Нет треков в кеше')
      return
    }
    setSongList(cachedTracks, 0)
    play()
    toast.success(`▶️ Воспроизведение ${cachedTracks.length} треков из кеша`)
  }

  const handleShuffle = () => {
    if (cachedTracks.length === 0) {
      toast.warning('Нет треков в кеше')
      return
    }
    const shuffled = [...cachedTracks].sort(() => Math.random() - 0.5)
    setSongList(shuffled, 0)
    play()
    toast.success(`🔀 Перемешано и воспроизведено ${shuffled.length} треков`)
  }

  const handlePlayTrack = (track: ISong) => {
    setSongList(cachedTracks, cachedTracks.indexOf(track))
    play()
  }

  const handleRemoveTrack = (trackId: string) => {
    cacheService.removeCachedTrack(trackId)
    toast.success('Трек удалён из кеша')
    loadCache()
  }

  const handleRemoveArtist = (artistId: string) => {
    cacheService.removeCachedArtist(artistId)
    toast.success('Артист удалён из кеша')
    loadCache()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = cachedTracks.findIndex(t => t.id === active.id)
      const newIndex = cachedTracks.findIndex(t => t.id === over.id)
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newTracks = arrayMove(cachedTracks, oldIndex, newIndex)
        setCachedTracks(newTracks)
        toast.success('Порядок треков изменён')
      }
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Вычисление размера аудио
  const metadataSize = JSON.stringify(cachedTracks).length * 2 + JSON.stringify(cachedArtists).length * 2
  const audioSize = Math.max(0, stats.totalSize - metadataSize)

  // Фильтрация и сортировка треков
  const filteredAndSortedTracks = useMemo(() => {
    let filtered = [...cachedTracks]

    // Поиск
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(track =>
        track.title?.toLowerCase().includes(query) ||
        track.artist?.toLowerCase().includes(query) ||
        track.album?.toLowerCase().includes(query) ||
        track.genre?.toLowerCase().includes(query)
      )
    }

    // Сортировка
    filtered.sort((a, b) => {
      const aVal = a[sortBy] || 0
      const bVal = b[sortBy] || 0
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [cachedTracks, searchQuery, sortBy, sortOrder])

  return (
    <div className="w-full pb-6 md:container md:mx-auto md:space-y-6 md:p-6">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur-md md:static md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/profile')}
              className="flex size-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-accent/60 md:hidden"
              aria-label="Назад"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 truncate text-xl font-bold md:text-3xl">
                <Database className="size-5 shrink-0 md:size-8" />
                Кэш
              </h1>
              <p className="mt-0.5 hidden text-sm text-muted-foreground md:block">
                Просмотр и управление закешированными данными
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadCache()}
              disabled={isRefreshing}
              className={`flex-1 md:flex-none ${isRefreshing ? 'animate-pulse' : ''}`}
            >
              <RefreshCw className={`size-4 md:mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Обновить</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearCache}
              className="flex-1 md:flex-none"
            >
              <Trash2 className="size-4 md:mr-2" />
              <span className="hidden md:inline">Очистить весь кеш</span>
              <span className="md:hidden">Очистить</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4 md:space-y-6 md:px-0 md:pt-0">
        {cachingProgress.isCaching && (
          <Card className="border-primary/50">
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-primary">{cachingProgress.message}</span>
                  <span className="text-muted-foreground">
                    {cachingProgress.current} / {cachingProgress.total}
                  </span>
                </div>
                <Progress
                  value={(cachingProgress.current / cachingProgress.total) * 100}
                  className="h-3"
                />
              </div>
            </CardContent>
          </Card>
        )}

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card className={isRefreshing ? 'border-primary/50' : ''}>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
              Треков
              {isRefreshing && <RefreshCw className="size-3 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 md:pt-0">
            <div className="text-2xl font-bold md:text-3xl">{stats.tracks}</div>
          </CardContent>
        </Card>
        <Card className={isRefreshing ? 'border-primary/50' : ''}>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
              Артистов
              {isRefreshing && <RefreshCw className="size-3 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 md:pt-0">
            <div className="text-2xl font-bold md:text-3xl">{stats.artists}</div>
          </CardContent>
        </Card>
        <Card className={isRefreshing ? 'border-primary/50' : ''}>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
              Размер
              {isRefreshing && <RefreshCw className="size-3 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 md:pt-0">
            <div className="text-2xl font-bold md:text-3xl">{formatBytes(stats.totalSize)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatBytes(audioSize)} аудио
            </p>
          </CardContent>
        </Card>
        <Card className={isRefreshing ? 'border-primary/50' : ''}>
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
              Всего
              {isRefreshing && <RefreshCw className="size-3 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 md:pt-0">
            <div className="text-2xl font-bold md:text-3xl">{stats.totalItems}</div>
          </CardContent>
        </Card>
      </div>

      {/* Табы и управление */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'tracks' | 'artists')} className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList className="grid h-auto w-full grid-cols-2 md:w-auto">
            <TabsTrigger value="tracks" className="flex items-center gap-2 text-xs md:text-sm">
              <Music className="size-4" />
              Треки ({cachedTracks.length})
            </TabsTrigger>
            <TabsTrigger value="artists" className="flex items-center gap-2 text-xs md:text-sm">
              <Mic2 className="size-4" />
              Артисты ({cachedArtists.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === 'tracks' && (
            <div className="flex gap-2">
              <Button
                onClick={handlePlayAll}
                disabled={cachedTracks.length === 0}
                className="flex-1 md:flex-none"
                size="sm"
              >
                <Play className="size-4 md:mr-2" />
                <span className="hidden sm:inline">Воспроизвести все</span>
                <span className="sm:hidden">Все</span>
              </Button>
              <Button
                variant="outline"
                onClick={handleShuffle}
                disabled={cachedTracks.length === 0}
                className="flex-1 md:flex-none"
                size="sm"
              >
                <Shuffle className="size-4 md:mr-2" />
                <span className="hidden sm:inline">Перемешать</span>
                <span className="sm:hidden">Shuffle</span>
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="tracks" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Поиск треков..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Сортировать" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="title">Название</SelectItem>
                      <SelectItem value="artist">Артист</SelectItem>
                      <SelectItem value="album">Альбом</SelectItem>
                      <SelectItem value="duration">Длительность</SelectItem>
                      <SelectItem value="bpm">BPM</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    {sortOrder === 'asc' ? <SortAsc className="size-4" /> : <SortDesc className="size-4" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {filteredAndSortedTracks.length > 0 ? (
            <>
              <div className="overflow-hidden rounded-2xl border bg-background-foreground md:hidden">
                {filteredAndSortedTracks.map((track) => (
                  <CacheTrackCard
                    key={track.id}
                    track={track}
                    onPlay={handlePlayTrack}
                    onRemove={handleRemoveTrack}
                    formatDuration={formatDuration}
                  />
                ))}
              </div>

              <Card className="hidden md:block">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Music className="size-5" />
                    Закешированные треки
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <Table className="w-full min-w-[1200px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10"></TableHead>
                            <TableHead className="w-12"></TableHead>
                            <TableHead className="min-w-[200px]">Название</TableHead>
                            <TableHead className="min-w-[150px]">Альбом</TableHead>
                            <TableHead className="w-20">Длительность</TableHead>
                            <TableHead className="min-w-[100px]">Жанр</TableHead>
                            <TableHead className="w-20">BPM</TableHead>
                            <TableHead className="min-w-[120px]">Настроение</TableHead>
                            <TableHead className="w-20 text-right">Действия</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <SortableContext
                            items={filteredAndSortedTracks.map((t) => t.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {filteredAndSortedTracks.map((track, index) => (
                              <SortableTrackRow
                                key={track.id}
                                track={track}
                                index={index}
                                onPlay={handlePlayTrack}
                                onRemove={handleRemoveTrack}
                                formatDuration={formatDuration}
                                formatBytes={formatBytes}
                              />
                            ))}
                          </SortableContext>
                        </TableBody>
                      </Table>
                    </DndContext>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="rounded-2xl border py-12 text-center text-muted-foreground">
              <Music className="mx-auto mb-4 size-12 opacity-50" />
              <p>Треки в кеше отсутствуют</p>
              <p className="mt-2 text-sm">
                Лайкайте треки — они сохранятся в кэш автоматически
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="artists" className="space-y-4">
          {cachedArtists.length > 0 ? (
            <>
              <div className="overflow-hidden rounded-2xl border bg-background-foreground md:hidden">
                {cachedArtists.map((artist) => (
                  <CacheArtistCard
                    key={artist.id}
                    artist={artist}
                    onRemove={handleRemoveArtist}
                  />
                ))}
              </div>

              <Card className="hidden md:block">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mic2 className="size-5" />
                    Закешированные артисты
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Артист</TableHead>
                        <TableHead>Альбомов</TableHead>
                        <TableHead>Треков</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cachedArtists.map((artist) => (
                        <TableRow key={artist.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                                <Mic2 className="size-5" />
                              </div>
                              <div className="font-medium">{artist.name}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{artist.albumCount || 0}</TableCell>
                          <TableCell className="text-muted-foreground">{artist.songCount || 0}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveArtist(artist.id)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="rounded-2xl border py-12 text-center text-muted-foreground">
              <Mic2 className="mx-auto mb-4 size-12 opacity-50" />
              <p>Артисты в кеше отсутствуют</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  )
}
