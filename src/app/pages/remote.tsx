/**
 * Remote Control Page - Управление плеером с телефона
 * Улучшенная версия с repeat, shuffle, seek и красивым дизайном
 */

import { useState, useEffect, useRef } from 'react'
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Heart,
  Repeat,
  Shuffle,
  ListMusic,
  Music2,
} from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Slider } from '@/app/components/ui/slider'
import { Card } from '@/app/components/ui/card'

interface PlayerState {
  isPlaying: boolean
  title: string
  artist: string
  album: string
  coverArt: string
  duration: number
  progress: number
  volume: number
  isLiked: boolean
  isShuffle: boolean
  repeatMode: 'off' | 'all' | 'one'
}

interface QueueItem {
  id: string
  title: string
  artist: string
  album: string
  active: boolean
}

export default function RemoteControlPage() {
  const [connected, setConnected] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [showQueue, setShowQueue] = useState(false)
  // PIN-доступ: required — сервер ждёт PIN, ok — управляем, failed — неверный
  const [auth, setAuth] = useState<'unknown' | 'required' | 'ok' | 'failed'>('unknown')
  const [pin, setPin] = useState('')
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    title: 'Нет трека',
    artist: '',
    album: '',
    coverArt: '',
    duration: 0,
    progress: 0,
    volume: 50,
    isLiked: false,
    isShuffle: false,
    repeatMode: 'off',
  })

  const wsRef = useRef<WebSocket | null>(null)
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [])

  const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.hostname}:${window.location.port}/remote-ws`

    console.log('[Remote] Connecting to WebSocket:', wsUrl)

    try {
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        console.log('[Remote] Connected to WebSocket')
        setConnected(true)
        setAuth('unknown')
        send('get-state')
      }

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          handleMessage(message)
        } catch (error) {
          console.error('[Remote] Parse error:', error)
        }
      }

      wsRef.current.onclose = () => {
        console.log('[Remote] Disconnected')
        setConnected(false)
        setTimeout(connect, 3000)
      }

      wsRef.current.onerror = (error) => {
        console.error('[Remote] WebSocket error:', error)
        setConnected(false)
      }
    } catch (error) {
      console.error('[Remote] Connection error:', error)
      setConnected(false)
    }
  }

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  const handleMessage = (message: any) => {
    try {
      const parsed = typeof message === 'string' ? JSON.parse(message) : message

      switch (parsed.event) {
        case 'connected':
          console.log('[Remote] Connected:', parsed.data)
          setAuth('ok')
          break

        case 'auth-required':
          setAuth((a) => (a === 'ok' ? a : 'required'))
          break

        case 'auth-ok':
          setAuth('ok')
          send('get-state')
          break

        case 'auth-fail':
          setAuth('failed')
          break

        case 'state-update':
          setState(prev => ({ ...prev, ...parsed.data }))
          if (!isSeeking) {
            setSeekValue(parsed.data.progress || 0)
          }
          break

        case 'queue-update':
          if (Array.isArray(parsed.data)) setQueue(parsed.data)
          break

        default:
          console.log('[Remote] Message:', parsed)
      }
    } catch (error) {
      console.error('[Remote] Parse error:', error)
    }
  }

  const send = (event: string, data?: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, ...data }))
    }
  }

  const handleToggle = () => send('toggle')
  const handleNext = () => send('next')
  const handlePrev = () => send('prev')

  const handleVolumeChange = (value: number[]) => {
    setState(prev => ({ ...prev, volume: value[0] }))
    send('volume', { value: value[0] })
  }

  const handleSeekStart = () => {
    setIsSeeking(true)
  }

  const handleSeekChange = (value: number[]) => {
    setSeekValue(value[0])
  }

  const handleSeekEnd = (value: number[]) => {
    setIsSeeking(false)
    send('seek', { value: value[0] })
  }

  const handleLike = () => {
    setState(prev => ({ ...prev, isLiked: !prev.isLiked }))
    send('like', { songId: 'current' })
  }

  const handleShuffle = () => {
    setState(prev => ({ ...prev, isShuffle: !prev.isShuffle }))
    send('shuffle', { enabled: !state.isShuffle })
  }

  const handleRepeat = () => {
    const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one']
    const currentIndex = modes.indexOf(state.repeatMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    setState(prev => ({ ...prev, repeatMode: nextMode }))
    send('repeat', { mode: nextMode })
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getRepeatIcon = () => {
    switch (state.repeatMode) {
      case 'all':
        return <Repeat className="w-5 h-5" />
      case 'one':
        return <Repeat className="w-5 h-5" />
      default:
        return <Repeat className="w-5 h-5 opacity-50" />
    }
  }

  const repeatTitle =
    state.repeatMode === 'one'
      ? 'Повтор одного трека'
      : state.repeatMode === 'all'
        ? 'Повтор всей очереди'
        : 'Повтор выключен'

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md mx-4 border-0 shadow-lg">
          <div className="p-8 text-center space-y-4">
            <div className="animate-pulse text-6xl">📡</div>
            <h2 className="text-xl font-bold">Подключение...</h2>
            <p className="text-sm text-muted-foreground">
              Соединение с плеером
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Если долго не подключается:</p>
              <p>• Проверь что Remote Control включён</p>
              <p>• Телефон в той же WiFi сети</p>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const submitPin = () => {
    if (!pin.trim()) return
    send('auth', { pin: pin.trim() })
  }

  if (auth !== 'ok') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md mx-4 border-0 shadow-lg">
          <div className="p-8 text-center space-y-4">
            <div className="text-6xl">🔐</div>
            <h2 className="text-xl font-bold">PIN доступа</h2>
            <p className="text-sm text-muted-foreground">
              {auth === 'failed'
                ? 'Неверный PIN — попробуй ещё раз'
                : 'Плеер защищён PIN-кодом (задаётся в настройках Remote Control)'}
            </p>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitPin()}
              placeholder="••••"
              autoFocus
              className="w-full text-center text-2xl tracking-[0.5em] rounded-xl border border-border bg-background px-4 py-3 outline-none"
            />
            <Button onClick={submitPin} className="w-full" disabled={!pin.trim()}>
              Подключиться
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4 pb-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* Заголовок */}
        <div className="text-center space-y-1 pt-4">
          <div className="flex items-center justify-center gap-2">
            <Music2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Kumaflow Remote</h1>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-xs text-muted-foreground">Подключено</p>
          </div>
        </div>

        {/* Обложка через прокси плеера (/getCoverArt) — сохранённый пароль подставляется сам */}
        <div className="relative group aspect-square bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl overflow-hidden shadow-2xl border border-border/50 flex items-center justify-center">
          {state.coverArt ? (
            <img
              src={state.coverArt}
              alt={state.album}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
                const parent = e.target.parentElement
                if (parent) {
                  parent.classList.add('flex', 'items-center', 'justify-center')
                  const placeholder = parent.querySelector('.placeholder')
                  if (placeholder) placeholder.classList.remove('hidden')
                }
              }}
            />
          ) : null}
          <div className="placeholder absolute inset-0 flex items-center justify-center">
            <Music2 className="w-32 h-32 text-muted-foreground/30" />
          </div>
          {/* Индикатор воспроизведения */}
          {state.isPlaying && (
            <div className="absolute bottom-4 right-4 flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-primary/80 rounded-full animate-pulse"
                  style={{
                    height: `${12 + Math.random() * 8}px`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Информация о треке */}
        <div className="text-center space-y-1 px-4">
          <h2 className="text-lg font-bold truncate">{state.title || 'Нет трека'}</h2>
          <p className="text-sm text-muted-foreground truncate">{state.artist || '—'}</p>
          {state.album && (
            <p className="text-xs text-muted-foreground truncate">{state.album}</p>
          )}
        </div>

        {/* Прогресс */}
        <div className="space-y-2 px-2">
          <Slider
            value={[isSeeking ? seekValue : state.progress]}
            max={state.duration || 100}
            step={1}
            onValueStart={handleSeekStart}
            onValueChange={handleSeekChange}
            onValueEnd={handleSeekEnd}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground font-mono">
            <span>{formatTime(isSeeking ? seekValue : state.progress)}</span>
            <span>{formatTime(state.duration)}</span>
          </div>
        </div>

        {/* Основные кнопки управления */}
        <div className="flex items-center justify-center gap-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePrev}
            className="w-12 h-12 rounded-full"
          >
            <SkipBack className="w-6 h-6" />
          </Button>

          <Button
            variant="default"
            size="icon"
            onClick={handleToggle}
            className="w-16 h-16 rounded-full shadow-lg"
          >
            {state.isPlaying ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="w-12 h-12 rounded-full"
          >
            <SkipForward className="w-6 h-6" />
          </Button>
        </div>

        {/* Дополнительные кнопки */}
        <div className="flex items-center justify-center gap-6 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLike}
            className="w-10 h-10 rounded-full"
          >
            <Heart
              className="w-5 h-5"
              fill={state.isLiked ? 'currentColor' : 'none'}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleShuffle}
            className={`w-10 h-10 rounded-full ${state.isShuffle ? 'text-primary' : ''}`}
          >
            <Shuffle className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleRepeat}
            title={repeatTitle}
            className={`w-10 h-10 rounded-full relative ${state.repeatMode !== 'off' ? 'text-primary' : ''}`}
          >
            {getRepeatIcon()}
            {state.repeatMode === 'one' && (
              <span className="absolute -top-1 -right-1 text-[8px] font-bold">1</span>
            )}
            {state.repeatMode === 'all' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (!showQueue) send('get-queue')
              setShowQueue((v) => !v)
            }}
            title="Очередь"
            className={`w-10 h-10 rounded-full ${showQueue ? 'text-primary' : ''}`}
          >
            <ListMusic className="w-5 h-5" />
          </Button>
        </div>

        {/* Очередь плеера */}
        {showQueue && (
          <div className="space-y-1 px-1 max-h-80 overflow-y-auto">
            {queue.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Очередь пуста — запросили у плеера…
              </p>
            ) : (
              queue.map((q) => (
                <div
                  key={q.id || `${q.title}-${q.artist}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${q.active ? 'bg-primary/10 font-semibold' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{q.title}</div>
                    {q.artist && (
                      <div className="truncate text-xs text-muted-foreground">{q.artist}</div>
                    )}
                  </div>
                  {q.active && <span className="text-xs text-primary shrink-0">▶</span>}
                </div>
              ))
            )}
          </div>
        )}

        {/* Громкость */}
        <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-xl">
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 shrink-0"
            onClick={() => handleVolumeChange([state.volume > 0 ? 0 : 50])}
          >
            {state.volume === 0 ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </Button>
          <Slider
            value={[state.volume]}
            max={100}
            step={1}
            onValueChange={handleVolumeChange}
            className="flex-1"
          />
          <span className="text-xs font-mono w-8 text-right">{state.volume}%</span>
        </div>

        {/* Футер */}
        <div className="text-center pt-4">
          <p className="text-xs text-muted-foreground">
            Kumaflow Remote Control v1.6.7
          </p>
        </div>
      </div>
    </div>
  )
}
