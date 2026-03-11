/**
 * Компонент новых треков (новинок) из Apple Music
 * 
 * Показывает карточку для генерации плейлиста из новинок
 * Работает аналогично "Популярное" - нажатие генерирует плейлист
 */

import { useState } from 'react'
import { appleMusicService } from '@/service/apple-music-api'
import { useExternalApi } from '@/store/external-api.store'
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { toast } from 'react-toastify'
import { usePlayerActions } from '@/store/player.store'
import { subsonic } from '@/service/subsonic'

interface NewReleasesFromAppleProps {
  artistName: string
}

export function NewReleasesFromApple({ artistName }: NewReleasesFromAppleProps) {
  const { settings } = useExternalApi()
  const { setSongList } = usePlayerActions()
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGeneratePlaylist = async () => {
    if (!settings.appleMusicEnabled) {
      toast('Включите Apple Music в настройках', { type: 'warning' })
      return
    }

    setIsGenerating(true)

    try {
      // Получаем новые альбомы артиста за последний год
      const newAlbums = await appleMusicService.getNewReleases(artistName, 5)
      
      if (newAlbums.length === 0) {
        toast('Нет новых релизов у этого артиста', { type: 'info' })
        setIsGenerating(false)
        return
      }

      // Собираем треки из новых альбомов
      const allTracks: ISong[] = []
      
      for (const album of newAlbums.slice(0, 3)) {
        // Получаем треки из альбома Apple Music
        const appleTracks = await appleMusicService.getAlbumTracks(album.collectionId)
        
        // Ищем эти треки в библиотеке Navidrome
        for (const track of appleTracks.slice(0, 5)) {
          const libraryTrack = await findInLibrary(artistName, track.trackName)
          if (libraryTrack && !allTracks.find(t => t.id === libraryTrack!.id)) {
            allTracks.push(libraryTrack)
          }
        }
        
        if (allTracks.length >= 25) break
      }

      if (allTracks.length === 0) {
        toast('Не найдено треков в вашей библиотеке', { type: 'info' })
        setIsGenerating(false)
        return
      }

      // Запускаем плейлист
      setSongList(allTracks, 0)
      toast(`▶️ Запущено: Новинки (${allTracks.length} треков)`, { type: 'success' })
    } catch (error) {
      console.error('[NewReleases] Error:', error)
      toast('Ошибка при загрузке новинок', { type: 'error' })
    } finally {
      setIsGenerating(false)
    }
  }

  // Поиск трека в библиотеке
  async function findInLibrary(artist: string, title: string) {
    try {
      const { httpClient } = await import('@/api/httpClient')
      
      const searchResponse = await httpClient<{
        searchResult3?: {
          song?: { song: any[] }
        }
      }>('search3', {
        query: {
          query: `${artist} ${title}`,
          songCount: '5',
          artistCount: '0',
          albumCount: '0',
        },
      })

      const foundSongs = searchResponse?.data?.searchResult3?.song?.song || []
      
      if (foundSongs.length > 0) {
        const matchedSong = foundSongs.find(s =>
          s.title.toLowerCase().includes(title.toLowerCase()) ||
          title.toLowerCase().includes(s.title.toLowerCase())
        )
        
        if (matchedSong) {
          return await subsonic.songs.getSong(matchedSong.id).catch(() => null)
        }
      }
      
      return null
    } catch (error) {
      console.warn('[NewReleases] Search error:', error)
      return null
    }
  }

  if (!settings.appleMusicEnabled) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Новинки</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Новые треки из Apple Music
          </div>
          <Button
            onClick={handleGeneratePlaylist}
            disabled={isGenerating}
            size="sm"
          >
            {isGenerating ? '⏳' : '▶'}
            {isGenerating ? 'Загрузка...' : 'Запустить'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
