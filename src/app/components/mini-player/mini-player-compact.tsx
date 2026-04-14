import { useState, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Heart, MoreHorizontal, ListMusic, Volume2, VolumeX } from 'lucide-react'
import { usePlayerStore, usePlayerActions, usePlayerSongStarred } from '@/store/player.store'
import { useML } from '@/store/ml.store'
import { Button } from '@/app/components/ui/button'
import { Slider } from '@/app/components/ui/slider'
import { cn } from '@/lib/utils'
import { toast } from 'react-toastify'

interface MiniPlayerCompactProps {
  className?: string
}

export function MiniPlayerCompact({ className }: MiniPlayerCompactProps) {
  const { currentSong, isPlaying, volume } = usePlayerStore()
  const { togglePlayPause, playNextSong, playPrevSong, starCurrentSong } = usePlayerActions()
  const isLiked = usePlayerSongStarred()
  const { rateSong } = useML()
  
  const [localVolume, setLocalVolume] = useState(volume)
  const [isMuted, setIsMuted] = useState(volume === 0)
  const [showControls, setShowControls] = useState(false)
  const [progress, setProgress] = useState(0)

  // Синхронизация громкости
  useEffect(() => {
    setLocalVolume(volume)
    setIsMuted(volume === 0)
  }, [volume])

  // Обновление прогресса
  useEffect(() => {
    const interval = setInterval(() => {
      // TODO: получить реальный прогресс из player store
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
      <div className="w-full h-[500px] bg-card flex items-center justify-center">
        <p className="text-muted-foreground">Нет трека</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative w-full h-[500px] overflow-hidden',
        'bg-card transition-all duration-500',
        className
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* ФОНОВАЯ ОБЛОЖКА С РАЗМЫТИЕМ */}
      <div className="absolute inset-0 overflow-hidden">
        {currentSong?.coverUrl ? (
          <>
            {/* Основная обложка с размытием */}
            <img
              src={currentSong.coverUrl}
              alt={currentSong.title}
              className="w-full h-full object-cover blur-2xl scale-110 opacity-60"
            />
            {/* Затемнение */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
            {/* Виньетка */}
            <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/50" />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-background to-secondary/20" />
        )}
        {/* Затемнение */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
        {/* Виньетка */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/50" />
      </div>

      {/* КОНТЕНТ */}
      <div className="relative z-10 h-full flex flex-col items-center justify-between p-6">
        {/* ВЕРХНЯЯ ЧАСТЬ - МЕНЮ И ОЧЕРЕДЬ */}
        <div className="w-full flex justify-between items-start opacity-0 transition-opacity duration-300"
             style={{ opacity: showControls ? 1 : 0 }}>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-110"
            onClick={() => toast.info('Меню')}
          >
            <MoreHorizontal size={18} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-110"
            onClick={() => toast.info('Очередь')}
          >
            <ListMusic size={18} />
          </Button>
        </div>

        {/* ЦЕНТРАЛЬНАЯ ЧАСТЬ - КНОПКИ УПРАВЛЕНИЯ */}
        <div className="flex flex-col items-center gap-6">
          {/* Кнопки управления */}
          <div className="flex items-center gap-4">
            {/* Skip Back */}
            <Button
              size="icon"
              variant="ghost"
              className="h-12 w-12 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-white/20"
              onClick={playPrevSong}
            >
              <SkipBack size={20} strokeWidth={2.5} />
            </Button>

            {/* Play/Pause - ЦВЕТ ТЕМЫ */}
            <Button
              size="icon"
              className={cn(
                'h-16 w-16 rounded-full transition-all duration-300',
                'bg-primary hover:bg-primary/90 text-primary-foreground',
                'shadow-lg shadow-primary/40 hover:shadow-primary/60 hover:scale-105'
              )}
              onClick={togglePlayPause}
            >
              {isPlaying ? (
                <Pause size={28} strokeWidth={2.5} />
              ) : (
                <Play size={28} strokeWidth={2.5} className="ml-1" />
              )}
            </Button>

            {/* Skip Forward */}
            <Button
              size="icon"
              variant="ghost"
              className="h-12 w-12 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-white/20"
              onClick={playNextSong}
            >
              <SkipForward size={20} strokeWidth={2.5} />
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

        {/* НИЖНЯЯ ЧАСТЬ - ИНФОРМАЦИЯ И ПРОГРЕСС */}
        <div className="w-full space-y-3">
          {/* Информация о треке */}
          <div className="text-center space-y-1">
            <h3 className="text-xl font-bold text-white truncate drop-shadow-lg px-4">
              {currentSong.title}
            </h3>
            <p className="text-sm text-white/80 truncate drop-shadow px-4">
              {currentSong.artist}
            </p>
            {currentSong.album && (
              <p className="text-xs text-white/60 truncate px-4">
                {currentSong.album}
              </p>
            )}
          </div>

          {/* Прогресс бар */}
          <div className="space-y-1">
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div 
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-white/60">
              <span>1:23</span>
              <span>3:45</span>
            </div>
          </div>

          {/* Громкость (появляется при наведении) */}
          <div className={cn(
            'transition-all duration-300 overflow-hidden',
            showControls ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0'
          )}>
            <div className="flex items-center gap-2">
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
                className="flex-1 [&>div]:bg-white/20 [&>div>div]:bg-primary"
                onValueChange={handleVolumeChange}
              />
              <span className="text-xs text-white/60 w-8 text-right">{isMuted ? 0 : localVolume}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
