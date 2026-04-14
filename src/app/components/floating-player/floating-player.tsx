import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, Minimize2, Maximize2, GripVertical, PictureInPicture2, Radio, Users } from 'lucide-react'
import { usePlayerStore, usePlayerActions } from '@/store/player.store'
import { usePlaybackSettings, usePlaybackActions } from '@/store/playback.store'
import { Button } from '@/app/components/ui/button'
import { Slider } from '@/app/components/ui/slider'
import { cn } from '@/lib/utils'
import { toast } from 'react-toastify'
import { useAutoDJSettings, useAutoDJActions } from '@/store/auto-dj.store'
import { SimpleTooltip } from '@/app/components/ui/simple-tooltip'
import { getSimpleCoverArtUrl } from '@/api/httpClient'

export function FloatingPlayer() {
  const { t } = useTranslation()
  const { settings } = usePlaybackSettings()
  const { setFloatingPlayerEnabled, setFloatingPlayerPosition } = usePlaybackActions()
  const { currentSong, isPlaying, volume } = usePlayerStore()
  const { togglePlayPause, playNextSong, playPrevSong } = usePlayerActions()

  const [isMinimized, setIsMinimized] = useState(false)
  const [localVolume, setLocalVolume] = useState(volume)
  const [isMuted, setIsMuted] = useState(volume === 0)
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState(settings.floatingPlayerPosition || { x: 100, y: 100 })
  const [isPipActive, setIsPipActive] = useState(false)
  const [showArtistSelector, setShowArtistSelector] = useState(false)
  const dragRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const initialPositionRef = useRef({ x: 0, y: 0 })
  const pipWindowRef = useRef<DocumentPictureInPicture | null>(null)
  const artistSelectorRef = useRef<HTMLDivElement>(null)

  // Закрытие выбора артистов при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (artistSelectorRef.current && !artistSelectorRef.current.contains(e.target as Node)) {
        setShowArtistSelector(false)
      }
    }

    if (showArtistSelector) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showArtistSelector])

  // Обработчик выбора артиста (навигация через hash т.к. FloatingPlayer вне Router)
  const handleArtistClick = (artistId: string) => {
    setShowArtistSelector(false)
    // Используем history.pushState для SPA навигации без перезагрузки
    window.history.pushState({}, '', `/library/artists/${artistId}`)
    // Диспатчим событие для react-router
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  // Синхронизация громкости
  useEffect(() => {
    setLocalVolume(volume)
    setIsMuted(volume === 0)
  }, [volume])

  // Обработчики drag'n'drop
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    initialPositionRef.current = { ...position }
    document.body.style.cursor = 'grabbing'
  }

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging) return

    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y

    setPosition({
      x: initialPositionRef.current.x + dx,
      y: initialPositionRef.current.y + dy,
    })
  }

  const handleDragEnd = () => {
    if (isDragging) {
      setIsDragging(false)
      document.body.style.cursor = ''
      setFloatingPlayerPosition(position)
      toast.success('💡 Совет: Позиция плеера сохранена!', {
        autoClose: 2000,
        hideProgressBar: true,
      })
    }
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove)
      window.addEventListener('mouseup', handleDragEnd)
      return () => {
        window.removeEventListener('mousemove', handleDragMove)
        window.removeEventListener('mouseup', handleDragEnd)
      }
    }
  }, [isDragging])

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

  const handleClose = () => {
    setFloatingPlayerEnabled(false)
    if (isPipActive) {
      closePipWindow()
    }
    toast.info('Floating Player отключен. Включите в настройках если нужен.')
  }

  // Picture-in-Picture функция
  const openPipWindow = async () => {
    try {
      // @ts-ignore - Document Picture-in-Picture API
      if (!window.documentPictureInPicture) {
        toast.error('❌ Picture-in-Picture не поддерживается браузером')
        return
      }

      // @ts-ignore
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: isMinimized ? 60 : 280,
      })

      // Копируем стили
      const style = document.createElement('style')
      style.textContent = document.querySelector('style')?.textContent || ''
      pipWindow.document.head.appendChild(style)

      // Создаём мини-плеер в PiP окне
      const container = pipWindow.document.createElement('div')
      container.innerHTML = `
        <div style="
          width: 100%;
          height: 100%;
          background: hsl(var(--card));
          border-radius: 0.5rem;
          overflow: hidden;
          font-family: system-ui, sans-serif;
        ">
          <div style="
            padding: 0.75rem;
            background: linear-gradient(to right, hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.1));
            border-bottom: 1px solid hsl(var(--border));
            cursor: grab;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          ">
            <span style="font-size: 12px; font-weight: bold;">🐻 KumaFlow PiP</span>
          </div>
          <div style="padding: 0.75rem;">
            <p style="font-size: 14px; font-weight: 600; margin: 0 0 0.25rem 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${currentSong?.title || 'Нет трека'}
            </p>
            <p style="font-size: 12px; color: hsl(var(--muted-foreground)); margin: 0 0 0.75rem 0;">
              ${currentSong?.artist || '—'}
            </p>
            <p style="font-size: 10px; color: hsl(var(--muted-foreground));">
              PiP режим - поверх всех окон
            </p>
          </div>
        </div>
      `
      pipWindow.document.body.appendChild(container)
      pipWindow.document.body.style.margin = '0'

      setIsPipActive(true)
      pipWindowRef.current = pipWindow

      // Закрытие при закрытии PiP окна
      pipWindow.addEventListener('pagehide', () => {
        setIsPipActive(false)
        pipWindowRef.current = null
      })

      toast.success('✅ Picture-in-Picture включён!')
    } catch (error) {
      console.error('[PiP] Error:', error)
      toast.error('❌ Ошибка Picture-in-Picture')
    }
  }

  const closePipWindow = () => {
    if (pipWindowRef.current) {
      pipWindowRef.current.close()
      pipWindowRef.current = null
      setIsPipActive(false)
    }
  }

  // Если floating player отключен в настройках или нет трека - не рендерим
  if (!settings.floatingPlayerEnabled || !currentSong) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed z-50 w-80 bg-card rounded-lg shadow-2xl overflow-hidden',
        'transition-shadow duration-200',
        isDragging ? 'shadow-2xl ring-2 ring-primary' : 'border border-border',
        isMinimized ? 'h-14' : 'h-auto'
      )}
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Drag handle - ЗАГОЛОВОК С ГРИПОМ */}
      <div
        ref={dragRef}
        onMouseDown={handleDragStart}
        className={cn(
          'h-12 cursor-grab active:cursor-grabbing flex justify-between items-center px-3',
          'bg-gradient-to-r from-primary/40 via-primary/30 to-primary/40 border-b border-border',
          'hover:from-primary/60 hover:via-primary/50 hover:to-primary/60 transition-all duration-200',
          'group relative overflow-hidden',
          isDragging && 'bg-primary/50 shadow-lg shadow-primary/20'
        )}
        title="💡 ПЕРЕТАСКИВАЙ МЕНЯ! Зажми левую кнопку мыши и тяни"
      >
        {/* Анимированный фон при наведении */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        
        <div className="flex items-center gap-2 relative z-10">
          {/* ГРИП - ВИЗУАЛЬНАЯ ПОДСКАЗКА ДЛЯ ПЕРЕТАСКИВАНИЯ (мигает при наведении) */}
          <div className="flex items-center gap-1 p-1 rounded-md bg-white/10 group-hover:bg-white/20 transition-colors">
            <GripVertical className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
            <GripVertical className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
          </div>
          <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">🐻 KumaFlow</span>
          {isDragging && (
            <span className="text-xs text-primary font-bold animate-pulse">↔️ Перетаскивание...</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-primary/20"
            onClick={(e) => {
              e.stopPropagation()
              openPipWindow()
            }}
            title="Показать поверх всех окон (Picture-in-Picture)"
          >
            <PictureInPicture2 size={16} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-primary/20"
            onClick={(e) => {
              e.stopPropagation()
              setIsMinimized(!isMinimized)
            }}
            title={isMinimized ? 'Развернуть' : 'Свернуть'}
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              handleClose()
            }}
            title="Закрыть"
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <div className="p-3 space-y-3 bg-card">
          {/* Информация о треке */}
          <div className="flex items-start gap-3 relative">
            {currentSong?.coverUrl && (
              <img
                src={currentSong.coverUrl}
                alt={currentSong?.title || 'Cover'}
                className="w-16 h-16 rounded-md object-cover shadow-md"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {currentSong?.title || 'Нет трека'}
              </p>
              
              {/* Артисты - кликабельно если несколько */}
              {(currentSong as any)?.artists?.length > 1 ? (
                <div className="relative">
                  <button
                    onClick={() => setShowArtistSelector(!showArtistSelector)}
                    className="flex items-center gap-1 text-xs text-muted-foreground truncate hover:text-primary transition-colors group"
                    title="Нажмите чтобы выбрать артиста"
                  >
                    <Users size={12} className="group-hover:text-primary transition-colors" />
                    {(currentSong as any).artists.map((a: any, i: number) => (
                      <span key={a.id}>
                        {i > 0 && ' / '}
                        {a.name}
                      </span>
                    ))}
                  </button>

                  {/* Мини-окошко выбора артиста (Glassmorphism) */}
                  {showArtistSelector && (
                    <div
                      ref={artistSelectorRef}
                      className="absolute top-full left-0 mt-2 z-50 w-64 rounded-lg overflow-hidden shadow-xl border backdrop-blur-md"
                      style={{
                        backgroundColor: 'hsla(var(--card) / 0.9)',
                        borderColor: 'hsla(var(--border) / 0.5)',
                      }}
                    >
                      <div className="px-3 py-2 border-b" style={{ borderColor: 'hsla(var(--border) / 0.3)' }}>
                        <p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Выберите артиста:</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {(currentSong as any).artists.map((artist: any) => (
                          <button
                            key={artist.id}
                            onClick={() => handleArtistClick(artist.id)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors group"
                          >
                            {/* Аватарка артиста */}
                            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border" style={{ borderColor: 'var(--border)' }}>
                              {artist.coverArt ? (
                                <img
                                  src={getSimpleCoverArtUrl(artist.coverArt, 'artist', '100')}
                                  alt={artist.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--muted-foreground)' }}>
                                  <Users size={14} />
                                </div>
                              )}
                            </div>
                            {/* Имя артиста */}
                            <span className="text-sm truncate group-hover:text-primary transition-colors" style={{ color: 'var(--foreground)' }}>
                              {artist.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Один артист - обычный текст
                <p className="text-xs text-muted-foreground truncate">
                  {currentSong?.artist || '—'}
                </p>
              )}
              
              {currentSong?.album && (
                <p className="text-xs text-muted-foreground truncate">
                  {currentSong.album}
                </p>
              )}
            </div>
          </div>

          {/* Контролы воспроизведения */}
          <div className="flex items-center justify-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 hover:bg-primary/20"
              onClick={(e) => {
                e.stopPropagation()
                playPrevSong()
              }}
              title="Предыдущий"
            >
              <SkipBack size={18} />
            </Button>
            <Button
              size="icon"
              className="h-12 w-12 rounded-full bg-primary hover:bg-primary/90"
              onClick={(e) => {
                e.stopPropagation()
                togglePlayPause()
              }}
              title={isPlaying ? 'Пауза' : 'Воспроизвести'}
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 hover:bg-primary/20"
              onClick={(e) => {
                e.stopPropagation()
                playNextSong()
              }}
              title="Следующий"
            >
              <SkipForward size={18} />
            </Button>
            <AutoDJFloatingButton />
          </div>

          {/* Громкость */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-primary/20"
              onClick={(e) => {
                e.stopPropagation()
                toggleMute()
              }}
              title={isMuted ? 'Включить звук' : 'Выключить звук'}
            >
              {isMuted || localVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </Button>
            <Slider
              value={[isMuted ? 0 : localVolume]}
              min={0}
              max={100}
              step={1}
              className="flex-1"
              onValueChange={(e) => {
                e.stopPropagation()
                handleVolumeChange(e)
              }}
            />
            <span className="text-xs text-muted-foreground w-8 text-right">
              {isMuted ? 0 : localVolume}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function AutoDJFloatingButton() {
  const settings = useAutoDJSettings()
  const { toggleEnabled } = useAutoDJActions()

  return (
    <SimpleTooltip text={settings.enabled ? 'Авто-микс включен' : 'Авто-микс выключен'}>
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 hover:bg-primary/20"
        onClick={(e) => {
          e.stopPropagation()
          toggleEnabled()
        }}
      >
        <Radio className={cn('w-4 h-4', settings.enabled ? 'text-primary fill-current' : 'text-muted-foreground')} />
      </Button>
    </SimpleTooltip>
  )
}
