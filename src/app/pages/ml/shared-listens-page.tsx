/**
 * Shared Listens Page - Страница "Слушают другие"
 *
 * Плейлисты на основе того, что слушают другие пользователи
 * Использует данные из подключенных аккаунтов Navidrome
 */

import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Play, Shuffle, Share2, Star, Heart, Music, Users, RefreshCw } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { usePlayerActions } from '@/store/player.store'
import { useMLPlaylistsStateActions, useMLPlaylistsState } from '@/store/ml-playlists-state.store'
import { toast } from 'react-toastify'
import { subsonic } from '@/service/subsonic'
import type { ISong } from '@/types/responses/song'

export default function SharedListensPage() {
  const navigate = useNavigate()
  const { playlistId } = useParams<{ playlistId: string }>()
  const { setSongList } = usePlayerActions()
  const { getPlaylist } = useMLPlaylistsStateActions()
  const [playlist, setPlaylist] = useState<{
    id: string
    name: string
    description: string
    author: string
    songs: ISong[]
    coverArt?: string
    accountsCount?: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    loadPlaylist()
  }, [playlistId])

  const loadPlaylist = async () => {
    setLoading(true)
    try {
      // Пробуем получить сохраненный плейлист из store
      const savedPlaylist = getPlaylist('shared-listens')
      
      if (savedPlaylist && savedPlaylist.songs && savedPlaylist.songs.length > 0) {
        console.log('[SharedListensPage] Using saved playlist from store:', savedPlaylist.songs.length, 'tracks')
        setPlaylist({
          id: savedPlaylist.id,
          name: savedPlaylist.name || '🌍 Что слушают другие',
          description: savedPlaylist.description || 'Плейлист из подключенных аккаунтов',
          author: 'KumaFlow Shared',
          songs: savedPlaylist.songs,
          accountsCount: savedPlaylist.metadata?.accountsCount,
        })
      } else {
        // Если нет сохраненного - генерируем новый
        console.log('[SharedListensPage] No saved playlist, generating new one...')
        await regeneratePlaylist()
        return
      }
    } catch (error) {
      console.error('Error loading playlist:', error)
      toast('Ошибка загрузки плейлиста', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const regeneratePlaylist = async () => {
    setIsRefreshing(true)
    try {
      const { loadSharedAccounts, generateSharedPlaylist } = await import('@/service/shared-listens')
      const accounts = loadSharedAccounts()
      const enabledAccounts = accounts.filter(a => a.enabled)

      if (enabledAccounts.length === 0) {
        toast('⚠️ Нет подключенных аккаунтов! Добавьте их в настройках', { type: 'warning' })
        return
      }

      console.log('[SharedListensPage] Generating from', enabledAccounts.length, 'accounts')
      const sharedResult = await generateSharedPlaylist(enabledAccounts, 30)

      if (sharedResult.tracks.length === 0) {
        toast('⚠️ Не удалось получить треки из аккаунтов', { type: 'warning' })
        return
      }

      const songs = sharedResult.tracks.map(t => t.song)

      setPlaylist({
        id: sharedResult.playlistId || 'shared-listens',
        name: '🌍 Что слушают другие',
        description: `Плейлист из ${enabledAccounts.length} аккаунтов: ${enabledAccounts.map(a => a.name).join(', ')}`,
        author: 'KumaFlow Shared',
        songs: songs,
        accountsCount: enabledAccounts.length,
      })

      toast('✅ Плейлист обновлен!', { type: 'success' })
    } catch (error) {
      console.error('Error regenerating playlist:', error)
      toast('Ошибка обновления плейлиста', { type: 'error' })
    } finally {
      setIsRefreshing(false)
    }
  }

  const handlePlay = () => {
    if (playlist) {
      setSongList(playlist.songs, 0, false, undefined, playlist.name)
      toast('▶️ Воспроизведение...', { type: 'success' })
    }
  }

  const handleShare = () => {
    if (playlist) {
      const text = `🎵 ${playlist.name}\n${playlist.description}\n\n${playlist.songs.length} треков`
      navigator.clipboard.writeText(text)
      toast('📋 Информация скопирована', { type: 'success' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Music className="w-16 h-16 mx-auto mb-4 animate-spin text-primary" />
          <h2 className="text-xl font-bold">Загрузка плейлиста...</h2>
        </div>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Плейлист не найден</h2>
          <Button onClick={() => navigate('/ml/for-you')}>Вернуться назад</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-8 py-6">
      {/* Баннер */}
      <div className="relative h-64 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg mb-6 overflow-hidden">
        <div className="absolute inset-0 flex items-end p-8">
          <div className="text-white">
            <h1 className="text-4xl font-bold mb-2">{playlist.name}</h1>
            <p className="text-lg opacity-90 mb-4">{playlist.description}</p>
            <div className="flex items-center gap-4">
              <Button
                size="lg"
                className="bg-white text-blue-600 hover:bg-white/90"
                onClick={handlePlay}
              >
                <Play className="w-5 h-5 mr-2" />
                Play ({playlist.songs.length})
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10"
                onClick={handleShare}
              >
                <Share2 className="w-5 h-5 mr-2" />
                Поделиться
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10"
                onClick={regeneratePlaylist}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-5 h-5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Обновить
              </Button>
              {playlist.accountsCount && (
                <div className="flex items-center gap-2 text-sm opacity-80">
                  <Users className="w-4 h-4" />
                  <span>{playlist.accountsCount} аккаунтов</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 rounded-lg p-4">
          <div className="text-2xl font-bold">{playlist.songs.length}</div>
          <div className="text-sm text-muted-foreground">Треков</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <div className="text-2xl font-bold">
            {new Set(playlist.songs.map(s => s.artist)).size}
          </div>
          <div className="text-sm text-muted-foreground">Артистов</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <div className="text-2xl font-bold">
            {new Set(playlist.songs.map(s => s.genre).filter(Boolean)).size}
          </div>
          <div className="text-sm text-muted-foreground">Жанров</div>
        </div>
        <div className="bg-white/5 rounded-lg p-4">
          <div className="text-2xl font-bold">
            {Math.floor(playlist.songs.reduce((sum, s) => sum + (s.duration || 0), 0) / 60)} мин
          </div>
          <div className="text-sm text-muted-foreground">Длительность</div>
        </div>
      </div>

      {/* Список треков */}
      <div className="space-y-2">
        {playlist.songs.map((song, index) => (
          <div
            key={song.id}
            className="flex items-center gap-4 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            onClick={() => setSongList(playlist.songs, index, false, undefined, playlist.name)}
          >
            <div className="w-8 text-center text-muted-foreground">
              {index + 1}
            </div>
            {song.coverArtUrl && (
              <img
                src={song.coverArtUrl}
                alt={song.title}
                className="w-12 h-12 rounded object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{song.title}</div>
              <div className="text-sm text-muted-foreground truncate">
                {song.artist}
                {song.genre && ` • ${song.genre}`}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              {Math.floor((song.duration || 0) / 60)}:{((song.duration || 0) % 60).toString().padStart(2, '0')}
            </div>
          </div>
        ))}
      </div>

      {/* Пустое состояние */}
      {playlist.songs.length === 0 && (
        <div className="text-center py-12">
          <Music className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-bold mb-2">Нет треков</h3>
          <p className="text-muted-foreground mb-4">
            Не удалось получить треки из подключенных аккаунтов
          </p>
          <Button onClick={regeneratePlaylist}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Попробовать снова
          </Button>
        </div>
      )}
    </div>
  )
}
