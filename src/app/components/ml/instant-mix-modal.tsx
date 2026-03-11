import { useState } from 'react'
import { X, Search, Music, Mic2, Radio } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { usePlayerActions } from '@/store/player.store'
import { generateTrackRadio, generateArtistRadio, generateGenrePlaylist } from '@/service/ml-wave-service'
import { search } from '@/service/search'
import { toast } from 'react-toastify'
import { trackEvent } from '@/service/ml-event-tracker'

interface InstantMixModalProps {
  open: boolean
  onClose: () => void
}

export function InstantMixModal({ open, onClose }: InstantMixModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<{
    tracks?: any[]
    artists?: any[]
    genres?: string[]
  }>({})
  const [selectedType, setSelectedType] = useState<'track' | 'artist' | 'genre' | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const { setSongList } = usePlayerActions()

  if (!open) return null

  // Поиск
  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const results = await search.get({
        query: searchQuery,
        songCount: 10,
        artistCount: 10,
        albumCount: 0,
        songOffset: 0,
        artistOffset: 0,
        albumOffset: 0,
      })

      setSearchResults({
        tracks: results.song || [],
        artists: results.artist || [],
      })
    } catch (error) {
      console.error('Search error:', error)
      toast('Ошибка поиска', { type: 'error' })
    } finally {
      setIsSearching(false)
    }
  }

  // Выбор трека/артиста/жанра
  const handleSelect = (type: 'track' | 'artist' | 'genre', id: string) => {
    setSelectedType(type)
    setSelectedId(id)
  }

  // Генерация микса
  const handleGenerate = async () => {
    if (!selectedType || !selectedId) {
      toast('Выберите трек, артиста или жанр', { type: 'warning' })
      return
    }

    setIsGenerating(true)
    try {
      let songs

      switch (selectedType) {
        case 'track':
          const trackRadio = await generateTrackRadio(selectedId, 25)
          songs = trackRadio.songs
          trackEvent('radio_started', { type: 'instant-mix-track', songId: selectedId })
          break

        case 'artist':
          const artistRadio = await generateArtistRadio(selectedId, 50)
          songs = artistRadio.songs
          trackEvent('radio_started', { type: 'instant-mix-artist', artistId: selectedId })
          break

        case 'genre':
          const genrePlaylist = await generateGenrePlaylist(selectedId, 30)
          songs = genrePlaylist.songs
          trackEvent('playlist_generated', { type: 'instant-mix-genre', genre: selectedId })
          break
      }

      if (songs && songs.length > 0) {
        setSongList(songs, 0)
        toast('🎵 Instant Mix запущен!', { type: 'success' })
        onClose()
      } else {
        toast('Не удалось найти похожие треки', { type: 'error' })
      }
    } catch (error) {
      console.error('Instant Mix error:', error)
      toast('Ошибка генерации микса', { type: 'error' })
    } finally {
      setIsGenerating(false)
    }
  }

  // Отмена
  const handleCancel = () => {
    setSearchQuery('')
    setSearchResults({})
    setSelectedType(null)
    setSelectedId(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden border border-border">
        {/* Заголовок */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Radio className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold">⚡ Instant Mix</h2>
              <p className="text-sm text-muted-foreground">Создайте микс на основе трека, артиста или жанра</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Поиск */}
        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Введите название трека, артиста или жанра..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? '🔍' : 'Найти'}
            </Button>
          </div>

          {/* Результаты поиска */}
          {searchResults.tracks?.length !== undefined && searchResults.tracks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Music className="w-4 h-4" />
                <span>Треки</span>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                {searchResults.tracks.slice(0, 5).map((track: any) => (
                  <button
                    key={track.id}
                    onClick={() => handleSelect('track', track.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      selectedType === 'track' && selectedId === track.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50 border-border'
                    }`}
                  >
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Music className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-medium truncate">{track.title}</p>
                      <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                    </div>
                    {selectedType === 'track' && selectedId === track.id && (
                      <div className="w-3 h-3 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchResults.artists?.length !== undefined && searchResults.artists.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Mic2 className="w-4 h-4" />
                <span>Артисты</span>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                {searchResults.artists.slice(0, 5).map((artist: any) => (
                  <button
                    key={artist.id}
                    onClick={() => handleSelect('artist', artist.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      selectedType === 'artist' && selectedId === artist.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50 border-border'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Mic2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium">{artist.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {artist.albumCount || 0} альбомов
                      </p>
                    </div>
                    {selectedType === 'artist' && selectedId === artist.id && (
                      <div className="w-3 h-3 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Выбранный элемент */}
          {selectedType && selectedId && (
            <div className="p-4 bg-primary/10 border border-primary rounded-lg">
              <p className="text-sm font-medium">
                ✅ Выбрано: {selectedType === 'track' ? 'Трек' : selectedType === 'artist' ? 'Артист' : 'Жанр'}
              </p>
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div className="flex gap-3 p-6 border-t border-border">
          <Button variant="outline" onClick={handleCancel} className="flex-1">
            Отмена
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedType || !selectedId}
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            {isGenerating ? '⏳ Генерация...' : '🎵 Создать микс'}
          </Button>
        </div>
      </div>
    </div>
  )
}
