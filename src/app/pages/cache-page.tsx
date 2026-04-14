/**
 * Страница "Мой кэш" - Офлайн-плейлист
 * 
 * Функционал:
 * - Просмотр всех кэшированных песен
 * - Воспроизведение из кэша
 * - Фильтрация по типу
 * - Очистка выбранных элементов
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAllCacheEntries, deleteCacheEntry, getCachedSongUrl } from '@/service/cache.service'
import { usePlayerActions } from '@/store/player.store'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { Input } from '@/app/components/ui/input'
import { Music, Image, Headphones, Play, Trash2, Download, WifiOff, Search } from 'lucide-react'
import { ROUTES } from '@/routes/routesList'
import { toast } from 'react-toastify'
import { songs } from '@/service/songs'
import type { CacheEntry } from '@/service/cache.service'

interface CacheItem {
  id: string
  songId: string
  type: 'song' | 'cover' | 'podcast'
  size: number
  lastAccessedAt: number
  expiresAt: number
  title?: string
  artist?: string
}

export function CachePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setSongList, playSong } = usePlayerActions()

  const [items, setItems] = useState<CacheItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'song' | 'cover' | 'podcast'>('all')
  const [isPlaying, setIsPlaying] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Загрузка кэшированных элементов
  useEffect(() => {
    loadCacheItems()

    // Слушаем событие обновления кэша
    const handleCacheUpdated = () => {
      console.log('[CachePage] Cache updated event received, reloading...')
      loadCacheItems()
    }

    window.addEventListener('cache-updated', handleCacheUpdated)

    return () => {
      window.removeEventListener('cache-updated', handleCacheUpdated)
    }
  }, [])

  const loadCacheItems = async () => {
    setIsLoading(true)
    try {
      const entries: CacheEntry[] = await getAllCacheEntries()
      console.log('[CachePage] Loaded cache entries:', entries.length, entries)

      // Загружаем данные песен с сервера (но не блокируем если ошибка)
      const cacheItems: CacheItem[] = await Promise.all(
        entries.map(async (e) => {
          const entryId = String(e.id)
          let title = entryId
          let artist = ''

          // Для песен пытаемся получить данные
          if (e.type === 'song' && entryId.startsWith('song_')) {
            const songId = entryId.replace('song_', '')
            try {
              const songInfo = await songs.getSong(songId)
              title = songInfo?.title || songId
              artist = songInfo?.artist || ''
            } catch (error) {
              // Если сервер недоступен, используем ID
              console.warn(`[CachePage] Failed to load song ${songId}:`, error)
              title = songId
            }
          }

          return {
            id: entryId,
            songId: entryId.startsWith('song_') ? entryId.replace('song_', '') : entryId,
            type: e.type,
            size: e.size,
            lastAccessedAt: e.lastAccessedAt,
            expiresAt: e.expiresAt,
            title,
            artist,
          }
        })
      )

      console.log('[CachePage] Cache items prepared:', cacheItems)
      setItems(cacheItems)
    } catch (error) {
      console.error('[CachePage] Failed to load cache:', error)
      // Не показываем ошибку, просто пустой список
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }

  // Фильтрация по типу + поиск
  const filteredItems = useMemo(() => {
    let filtered = activeTab === 'all'
      ? items
      : items.filter(item => item.type === activeTab)

    // Применяем поиск
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(item => {
        const titleMatch = item.title?.toLowerCase().includes(query)
        const artistMatch = item.artist?.toLowerCase().includes(query)
        const idMatch = item.songId?.toLowerCase().includes(query)
        return titleMatch || artistMatch || idMatch
      })
    }

    return filtered
  }, [items, activeTab, searchQuery])

  // Группировка по типу + артисты
  const stats = {
    songs: items.filter(i => i.type === 'song').length,
    covers: items.filter(i => i.type === 'cover').length,
    podcasts: items.filter(i => i.type === 'podcast').length,
    totalSize: items.reduce((sum, i) => sum + i.size, 0),
  }

  // Уникальные артисты
  const uniqueArtists = useMemo(() => {
    const artists = new Set<string>()
    items
      .filter(i => i.type === 'song' && i.artist)
      .forEach(i => artists.add(i.artist))
    return Array.from(artists).sort()
  }, [items])

  // Воспроизведение всех кэшированных песен
  const playAllCached = async () => {
    const songItems = filteredItems.filter(i => i.type === 'song')

    if (songItems.length === 0) {
      toast.info('Нет кэшированных песен для воспроизведения')
      return
    }

    try {
      console.log('[CachePage] Playing cached songs:', songItems.map(s => s.songId))
      
      // Получаем полные данные о песнях + кэшированные URL
      const songsWithDetails = await Promise.all(
        songItems.map(async (item) => {
          try {
            // Получаем данные о песне с сервера для метаданных
            const songInfo = await songs.getSong(item.songId).catch(() => null)
            
            // Получаем кэшированный URL
            const cachedUrl = await getCachedSongUrl(item.songId)
            
            return {
              ...(songInfo || {}),
              id: item.songId,
              title: songInfo?.title || item.title || item.songId,
              artist: songInfo?.artist || item.artist,
              album: songInfo?.album || '',
              duration: songInfo?.duration || 0,
              url: cachedUrl || undefined,
              isCached: !!cachedUrl,
            }
          } catch (error) {
            console.warn(`[CachePage] Failed to load song ${item.songId}:`, error)
            return {
              id: item.songId,
              title: item.title || item.songId,
              artist: item.artist,
              isCached: true,
            }
          }
        })
      )

      console.log('[CachePage] Songs to play:', songsWithDetails)
      
      // Устанавливаем плейлист и начинаем воспроизведение с первой песни
      setSongList(songsWithDetails, 0)

      toast.success(`Воспроизведение ${songsWithDetails.length} песен из кэша`)
    } catch (error) {
      console.error('[CachePage] Failed to play cached songs:', error)
      toast.error('Ошибка при воспроизведении')
    }
  }

  // Воспроизведение отдельной песни
  const playSongFromCache = async (songId: string) => {
    try {
      console.log('[CachePage] Playing cached song:', songId)
      
      // Получаем данные о песне
      const item = items.find(i => i.songId === songId)
      
      // Получаем данные с сервера для метаданных
      const songInfo = await songs.getSong(songId).catch(() => null)
      
      // Получаем кэшированный URL
      const cachedUrl = await getCachedSongUrl(songId)
      console.log('[CachePage] Cached URL:', cachedUrl ? 'FOUND' : 'NOT FOUND', cachedUrl)
      
      const song = {
        ...(songInfo || {}),
        id: songId,
        title: songInfo?.title || item?.title || songId,
        artist: songInfo?.artist || item?.artist,
        album: songInfo?.album || '',
        duration: songInfo?.duration || 0,
        url: cachedUrl || undefined,
        isCached: !!cachedUrl,
      }

      console.log('[CachePage] Setting song to play:', song)
      // Используем setSongList с индексом 0 для воспроизведения одной песни
      setSongList([song], 0)

      toast.success(cachedUrl ? 'Воспроизведение из кэша' : 'Воспроизведение с сервера')
    } catch (error) {
      console.error('[CachePage] Failed to play song:', error)
      toast.error('Ошибка при воспроизведении')
    }
  }

  // Удаление элемента
  const deleteItem = async (id: string) => {
    await deleteCacheEntry(id)
    await loadCacheItems()
    toast.success('Элемент удалён из кэша')
  }

  // Очистка всего кэша
  const clearAll = async () => {
    if (!confirm('Очистить весь кэш?')) return

    for (const item of items) {
      await deleteCacheEntry(item.id)
    }

    // Очищаем localStorage
    localStorage.removeItem('kumaflow-cached-songs')

    await loadCacheItems()
    toast.success('Кэш очищен')
  }

  // Очистка по типу
  const clearByType = async (type: 'song' | 'cover' | 'podcast') => {
    const toDelete = items.filter(i => i.type === type)
    for (const item of toDelete) {
      await deleteCacheEntry(item.id)
    }
    await loadCacheItems()
    toast.success(`Кэш ${type} очищен`)
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Мой кэш</h1>
          <p className="text-muted-foreground">
            Офлайн-плейлист из кэшированных песен
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(ROUTES.LIBRARY.HOME)}
          >
            Вернуться в библиотеку
          </Button>
          <Button
            onClick={playAllCached}
            disabled={stats.songs === 0}
          >
            <Play className="h-4 w-4 mr-2" />
            Воспроизвести всё
          </Button>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Music className="h-4 w-4" />
              Песни
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.songs}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Image className="h-4 w-4" />
              Обложки
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.covers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Headphones className="h-4 w-4" />
              Подкасты
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.podcasts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4" />
              Общий размер
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats.totalSize / 1024 / 1024).toFixed(2)} MB
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Индикатор офлайн-режима */}
      <Card className="border-yellow-500/20 bg-yellow-500/10">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <WifiOff className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="font-medium">Офлайн-режим</p>
              <p className="text-sm text-muted-foreground">
                При отсутствии соединения воспроизведение будет работать с кэшированными данными
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Табы и список */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex-1">
              <CardTitle>Кэшированные элементы</CardTitle>
              <CardDescription>
                {filteredItems.length} элементов в кэше
                {uniqueArtists.length > 0 && ` • ${uniqueArtists.length} артистов`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeTab !== 'all' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearByType(activeTab as any)}
                  disabled={filteredItems.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Очистить {activeTab === 'song' ? 'песни' : activeTab === 'cover' ? 'обложки' : 'подкасты'}
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={clearAll}
                disabled={items.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Очистить весь кэш
              </Button>
            </div>
          </div>

          {/* Поиск */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по названию, артисту или ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchQuery('')}
              >
                ×
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Артисты */}
          {uniqueArtists.length > 0 && (
            <div className="mb-4 pb-4 border-b">
              <h3 className="text-sm font-medium mb-2">Артисты в кэше:</h3>
              <div className="flex flex-wrap gap-2">
                {uniqueArtists.map((artist) => {
                  const artistSongsCount = items.filter(
                    i => i.type === 'song' && i.artist === artist
                  ).length
                  return (
                    <Button
                      key={artist}
                      variant="outline"
                      size="sm"
                      onClick={() => setSearchQuery(artist)}
                      className="text-xs"
                    >
                      {artist} ({artistSongsCount})
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">Все ({items.length})</TabsTrigger>
              <TabsTrigger value="song">Песни ({stats.songs})</TabsTrigger>
              <TabsTrigger value="cover">Обложки ({stats.covers})</TabsTrigger>
              <TabsTrigger value="podcast">Подкасты ({stats.podcasts})</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Загрузка...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Кэш пуст</p>
                  <p className="text-sm">
                    Песни автоматически кэшируются при воспроизведении
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {filteredItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/80 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          {item.type === 'song' && (
                            <Music className="h-4 w-4 text-muted-foreground" />
                          )}
                          {item.type === 'cover' && (
                            <Image className="h-4 w-4 text-muted-foreground" />
                          )}
                          {item.type === 'podcast' && (
                            <Headphones className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.title || item.songId}
                            </p>
                            {item.artist && (
                              <p className="text-xs text-muted-foreground truncate">
                                {item.artist}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {(item.size / 1024).toFixed(2)} KB •{' '}
                              {new Date(item.lastAccessedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.type === 'song' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => playSongFromCache(item.songId)}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

export default CachePage
