import { useState } from 'react'
import { X, Sparkles, Sliders } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Slider } from '@/app/components/ui/slider'
import { usePlayerActions } from '@/store/player.store'
import { generateSongAlchemy } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import { trackEvent } from '@/service/ml-event-tracker'

interface SongAlchemyModalProps {
  open: boolean
  onClose: () => void
}

export function SongAlchemyModal({ open, onClose }: SongAlchemyModalProps) {
  const [alchemyParams, setAlchemyParams] = useState({
    energy: 0.5,
    danceability: 0.5,
    valence: 0.5,
    acousticness: 0.5,
  })
  const [isGenerating, setIsGenerating] = useState(false)

  const { setSongList } = usePlayerActions()

  if (!open) return null

  const handleGenerate = async () => {
    setIsGenerating(true)
    try {
      const alchemyPlaylist = await generateSongAlchemy(alchemyParams, 25)
      
      if (alchemyPlaylist.songs && alchemyPlaylist.songs.length > 0) {
        setSongList(alchemyPlaylist.songs, 0)
        toast('🎵 Song Alchemy запущен!', { type: 'success' })
        trackEvent('playlist_generated', { 
          type: 'song-alchemy', 
          params: alchemyParams 
        })
        onClose()
      } else {
        toast('Не удалось найти треки', { type: 'error' })
      }
    } catch (error) {
      console.error('Alchemy error:', error)
      toast('Ошибка генерации', { type: 'error' })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-2xl w-full max-w-xl">
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Song Alchemy
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-sm text-muted-foreground">
            Настройте параметры настроения и получите персональный плейлист
          </div>

          {/* Energy */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                ⚡ Энергия
              </label>
              <span className="text-xs text-muted-foreground">
                {Math.round(alchemyParams.energy * 100)}%
              </span>
            </div>
            <Slider
              value={[alchemyParams.energy]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([value]) => setAlchemyParams(prev => ({ ...prev, energy: value }))}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Спокойная</span>
              <span>Энергичная</span>
            </div>
          </div>

          {/* Danceability */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                💃 Танцевальность
              </label>
              <span className="text-xs text-muted-foreground">
                {Math.round(alchemyParams.danceability * 100)}%
              </span>
            </div>
            <Slider
              value={[alchemyParams.danceability]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([value]) => setAlchemyParams(prev => ({ ...prev, danceability: value }))}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Медленная</span>
              <span>Танцевальная</span>
            </div>
          </div>

          {/* Valence */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                😊 Позитивность
              </label>
              <span className="text-xs text-muted-foreground">
                {Math.round(alchemyParams.valence * 100)}%
              </span>
            </div>
            <Slider
              value={[alchemyParams.valence]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([value]) => setAlchemyParams(prev => ({ ...prev, valence: value }))}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Грустная</span>
              <span>Весёлая</span>
            </div>
          </div>

          {/* Acousticness */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                🎸 Акустичность
              </label>
              <span className="text-xs text-muted-foreground">
                {Math.round(alchemyParams.acousticness * 100)}%
              </span>
            </div>
            <Slider
              value={[alchemyParams.acousticness]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([value]) => setAlchemyParams(prev => ({ ...prev, acousticness: value }))}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Электронная</span>
              <span>Акустическая</span>
            </div>
          </div>

          {/* Preset кнопки */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlchemyParams({
                energy: 0.2,
                danceability: 0.3,
                valence: 0.5,
                acousticness: 0.8,
              })}
            >
              🌙 Расслабление
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlchemyParams({
                energy: 0.8,
                danceability: 0.8,
                valence: 0.7,
                acousticness: 0.2,
              })}
            >
              ⚡ Вечеринка
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAlchemyParams({
                energy: 0.5,
                danceability: 0.5,
                valence: 0.5,
                acousticness: 0.5,
              })}
            >
              🎲 Случайно
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
          >
            {isGenerating ? '⏳ Генерация...' : '🎵 Запустить алхимию'}
          </Button>
        </div>
      </div>
    </div>
  )
}
