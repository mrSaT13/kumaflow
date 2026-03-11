import { useState, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Heart, Maximize2, Volume2, VolumeX } from 'lucide-react'
import { usePlayerStore, usePlayerActions, usePlayerSongStarred } from '@/store/player.store'
import { useML } from '@/store/ml.store'
import { Button } from '@/app/components/ui/button'
import { Slider } from '@/app/components/ui/slider'
import { cn } from '@/lib/utils'
import { toast } from 'react-toastify'

export function MiniPlayerFullscreen() {
  const { currentSong, isPlaying, volume } = usePlayerStore()
  const { togglePlayPause, playNextSong, playPrevSong, starCurrentSong } = usePlayerActions()
  const isLiked = usePlayerSongStarred()
  const { rateSong } = useML()
  
  const [localVolume, setLocalVolume] = useState(volume)
  const [isMuted, setIsMuted] = useState(volume === 0)
  const [showInfo, setShowInfo] = useState(false)
  const [progress, setProgress] = useState(0)

  // Выход по ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        localStorage.setItem('miniPlayerFullscreen', 'false')
        window.dispatchEvent(new CustomEvent('mini-player-exit'))
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  // Синхронизация громкости
  useEffect(() => {
    setLocalVolume(volume)
    setIsMuted(volume === 0)
  }, [volume])

  // Обновление прогресса
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => prev >= 100 ? 0 : prev + 0.5)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const handleVolumeChange = (val: number[]) => {
    const newVolume = val[0]
    setLocalVolume(newVolume)
    if (newVolume === 0) {
      setIsMuted(true)
    } else {
      setIsMuted(false)
    }
  }

  const toggleMute = () => {
    if (isMuted) {
      setLocalVolume(volume > 0 ? volume : 50)
      setIsMuted(false)
    } else {
      setLocalVolume(0)
      setIsMuted(true)
    }
  }

  const handleLike = () => {
    if (currentSong?.id) {
      starCurrentSong()
      rateSong(currentSong.id, !isLiked, {
        title: currentSong.title,
        artist: currentSong.artist,
        artistId: currentSong.artistId,
        genre: currentSong.genre,
        album: currentSong.album,
      })
      toast.success(isLiked ? '❌ Удалено из любимых' : '❤️ Добавлено в любимые')
    }
  }

  if (!currentSong) {
    return (
      <div className="w-full h-full bg-card flex items-center justify-center">
        <p className="text-muted-foreground">Нет трека</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'fixed inset-0 w-full h-full overflow-hidden z-[100]',
        'bg-black'
      )}
      onMouseEnter={() => setShowInfo(true)}
      onMouseLeave={() => setShowInfo(false)}
    >
      {/* ФОНОВАЯ ОБЛОЖКА НА ВЕСЬ ЭКРАН */}
      <div className="absolute inset-0 overflow-hidden">
        {currentSong.coverUrl ? (
          <>
            {/* Основная обложка */}
            <img
              src={currentSong.coverUrl}
              alt={currentSong.title}
              className="w-full h-full object-cover blur-xl scale-110 opacity-50"
            />
            {/* Затемнение */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/60 to-black/90" />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 via-background to-secondary/30" />
        )}
      </div>

      {/* КНОПКА ВЫХОДА - ВСЕГДА ВИДНА */}
      <div className="absolute top-4 right-4 z-[110]">
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 rounded-full bg-black/60 hover:bg-red-600/80 text-white backdrop-blur-md border border-white/20"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            localStorage.setItem('miniPlayerFullscreen', 'false')
            window.dispatchEvent(new CustomEvent('mini-player-exit'))
          }}
          title="Выйти из мини-режима (ESC)"
        >
          <Maximize2 size={18} />
        </Button>
      </div>

      {/* КОНТЕНТ */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center p-8">
        {/* ЦЕНТРАЛЬНЫЕ КНОПКИ */}
        <div className="flex flex-col items-center gap-6">
          {/* Кнопки управления */}
          <div className="flex items-center gap-4">
            {/* Skip Back */}
            <Button
              size="icon"
              variant="ghost"
              className="h-14 w-14 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-white/20"
              onClick={playPrevSong}
            >
              <SkipBack size={22} strokeWidth={2.5} />
            </Button>

            {/* Play/Pause - ЦВЕТ ТЕМЫ */}
            <Button
              size="icon"
              className={cn(
                'h-20 w-20 rounded-full transition-all duration-300',
                'bg-primary hover:bg-primary/90 text-primary-foreground',
                'shadow-lg shadow-primary/40 hover:shadow-primary/60 hover:scale-105'
              )}
              onClick={togglePlayPause}
            >
              {isPlaying ? (
                <Pause size={32} strokeWidth={2.5} />
              ) : (
                <Play size={32} strokeWidth={2.5} className="ml-1" />
              )}
            </Button>

            {/* Skip Forward */}
            <Button
              size="icon"
              variant="ghost"
              className="h-14 w-14 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-white/20"
              onClick={playNextSong}
            >
              <SkipForward size={22} strokeWidth={2.5} />
            </Button>
          </div>

          {/* Like кнопка */}
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              'h-12 w-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md',
              'transition-all duration-300 hover:scale-110',
              isLiked ? 'text-red-500 hover:text-red-400' : 'text-white hover:text-red-400'
            )}
            onClick={handleLike}
          >
            <Heart size={20} className={cn(isLiked && 'fill-red-500')} strokeWidth={2} />
          </Button>
        </div>

        {/* ИНФОРМАЦИЯ О ТРЕКЕ (появляется при наведении) */}
        <div className={cn(
          'absolute bottom-20 left-0 right-0 transition-all duration-500',
          showInfo ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-2'
        )}>
          <div className="text-center space-y-2 px-8">
            <h3 className={cn(
              'text-2xl font-bold truncate drop-shadow-lg transition-colors duration-300',
              showInfo ? 'text-white' : 'text-white/70'
            )}>
              {currentSong.title}
            </h3>
            <p className={cn(
              'text-lg truncate drop-shadow transition-colors duration-300',
              showInfo ? 'text-white/90' : 'text-white/50'
            )}>
              {currentSong.artist}
            </p>
            {currentSong.album && (
              <p className={cn(
                'text-sm truncate transition-colors duration-300',
                showInfo ? 'text-white/70' : 'text-white/40'
              )}>
                {currentSong.album}
              </p>
            )}
          </div>

          {/* Прогресс бар */}
          <div className="mt-6 px-8">
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div 
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Громкость (появляется только при наведении) */}
          <div className={cn(
            'mt-4 flex items-center justify-center gap-2 transition-all duration-300',
            showInfo ? 'opacity-100 max-h-10' : 'opacity-0 max-h-0 overflow-hidden'
          )}>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md"
              onClick={toggleMute}
            >
              {isMuted || localVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </Button>
            <Slider
              value={[isMuted ? 0 : localVolume]}
              min={0}
              max={100}
              step={1}
              className="w-32 [&>div]:bg-white/20 [&>div>div]:bg-primary"
              onValueChange={handleVolumeChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
