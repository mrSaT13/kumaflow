/**
 * Страница локальной библиотеки
 */

import { FolderOpen, Music2, Play, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table'
import { useLocalMusicStore } from '@/store/local-music.store'
import { usePlayerActions } from '@/store/player.store'
import { useAppStore } from '@/store/app.store'

export default function LocalLibrary() {
  const navigate = useNavigate()
  const { tracks, folders, isScanning } = useLocalMusicStore()
  const { setSongList } = usePlayerActions()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'title' | 'artist' | 'album' | 'year'>(
    'title',
  )

  const filteredTracks = useMemo(() => {
    let filtered = [...tracks] // Создаём копию массива

    // Поиск
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (track) =>
          track.title.toLowerCase().includes(query) ||
          track.artist.toLowerCase().includes(query) ||
          track.album?.toLowerCase().includes(query),
      )
    }

    // Сортировка
    return filtered.sort((a, b) => {
      const aVal = a[sortBy] || ''
      const bVal = b[sortBy] || ''
      return String(aVal).localeCompare(String(bVal), 'ru')
    })
  }, [tracks, searchQuery, sortBy])

  const handlePlayTrack = async (trackId: string) => {
    const trackIndex = tracks.findIndex((t) => t.id === trackId)
    if (trackIndex === -1) return

    // Для локальных треков получаем stream URL через IPC
    const isElectron = typeof window !== 'undefined' && !!(window as any).api

    // Создаём playlist с URL для всех треков (нужно для crossfade)
    // Используем any так как у нас расширенные поля для локальных треков
    const playlist: any[] = await Promise.all(tracks.map(async (t) => {
      // Получаем URL для стриминга через Electron IPC
      let streamUrl: string | undefined
      if (isElectron && t.path) {
        streamUrl = await window.api.streamLocalFile(t.path)
        console.log('[LocalLibrary] Stream URL for', t.path, ':', streamUrl)
      }

      return {
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        coverUrl: undefined,  // Убираем обложки - используем заглушку
        duration: t.duration,
        genre: t.genre,
        isLocal: true,
        localPath: t.path,
        url: streamUrl,  // kumaflow-local:// URL для воспроизведения
      }
    }))

    setSongList(playlist, trackIndex)
  }

  const handlePlayAll = async () => {
    if (filteredTracks.length === 0) return

    const isElectron = typeof window !== 'undefined' && !!(window as any).api

    const playlist: any[] = await Promise.all(filteredTracks.map(async (track) => {
      // Получаем URL для стриминга через Electron IPC
      let streamUrl: string | undefined
      if (isElectron && track.path) {
        streamUrl = await window.api.streamLocalFile(track.path)
      }

      return {
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        coverUrl: undefined,  // Убираем обложки - используем заглушку
        duration: track.duration,
        genre: track.genre,
        isLocal: true,
        localPath: track.path,
        url: streamUrl,  // kumaflow-local:// URL для воспроизведения
      }
    }))

    setSongList(playlist, 0)
  }

  if (folders.length === 0 && !isScanning) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <FolderOpen className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold">Нет локальной музыки</h2>
        <p className="text-muted-foreground">
          Добавьте папку с музыкой в настройках
        </p>
        <Button onClick={() => {
          const { setOpenDialog, setCurrentPage } = useAppStore.getState().settings
          setOpenDialog(true)
          setCurrentPage('local-music')
          setTimeout(() => {
            const element = document.getElementById('local-music')
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }, 500)
        }}>Открыть настройки</Button>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[calc(100vh-140px)]">
      <div className="p-6 space-y-6">
        {/* Заголовок */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Music2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Локальная библиотека</h1>
              <p className="text-muted-foreground">
                {filteredTracks.length} треков из {folders.length} папок
              </p>
            </div>
          </div>

          <Button
            onClick={handlePlayAll}
            disabled={filteredTracks.length === 0}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            Играть все
          </Button>
        </div>

        {/* Поиск */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск треков..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Таблица треков */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="w-[400px]">Название</TableHead>
                <TableHead>Исполнитель</TableHead>
                <TableHead>Альбом</TableHead>
                <TableHead className="text-right">Длительность</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTracks.map((track, index) => (
                <TableRow
                  key={track.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handlePlayTrack(track.id)}
                >
                  <TableCell className="text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <LocalCoverArtCell />
                      <div>
                        <div className="font-medium">{track.title}</div>
                        {track.genre && (
                          <div className="text-xs text-muted-foreground">
                            {track.genre}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{track.artist}</TableCell>
                  <TableCell>{track.album || '—'}</TableCell>
                  <TableCell className="text-right">
                    {formatDuration(track.duration)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {filteredTracks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Треки не найдены</p>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}

function formatDuration(duration?: number): string {
  if (!duration) return '—'

  const minutes = Math.floor(duration / 60)
  const seconds = Math.floor(duration % 60)

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Компонент обложки для ячейки таблицы
 * Показывает стандартную заглушку для всех локальных треков
 */
function LocalCoverArtCell({ alt }: { alt?: string }) {
  return (
    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
      <Music2 className="w-5 h-5 text-muted-foreground" />
    </div>
  )
}
