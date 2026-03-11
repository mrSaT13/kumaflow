import { createRef, useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, Settings } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'react-toastify'

interface VisualizerProps {
  expanded?: boolean
  onToggleExpand?: () => void
}

export function Visualizer({ expanded = false, onToggleExpand }: VisualizerProps) {
  const canvasRef = createRef<HTMLDivElement>()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [motion, setMotion] = useState<any>(null)
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const AudioMotionAnalyzerRef = useRef<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [analyserCreated, setAnalyserCreated] = useState(false)

  // Загрузка библиотеки audiomotion-analyzer
  useEffect(() => {
    let isMounted = true

    const loadLibrary = async () => {
      try {
        const module = await import('audiomotion-analyzer')
        if (isMounted) {
          AudioMotionAnalyzerRef.current = module.default
          setLibraryLoaded(true)
        }
      } catch (error) {
        console.error('[Visualizer] Failed to load AudioMotionAnalyzer library:', error)
        setError('Не удалось загрузить библиотеку визуализатора')
      }
    }

    loadLibrary()

    return () => {
      isMounted = false
    }
  }, [])

  // Ищем audio элемент и инициализируем визуализатор
  useEffect(() => {
    if (!libraryLoaded || !canvasRef.current) return

    // Находим audio элемент на странице
    const audio = document.querySelector('audio') as HTMLAudioElement | null
    if (!audio) {
      console.log('[Visualizer] No audio element found')
      setError('Аудио элемент не найден. Включите воспроизведение.')
      return
    }

    audioRef.current = audio

    let audioMotion: any | undefined

    try {
      const AudioMotionAnalyzer = AudioMotionAnalyzerRef.current
      if (!AudioMotionAnalyzer) return

      // Используем встроенный анализатор через source parameter
      // Это работает без создания дополнительного AudioContext
      audioMotion = new AudioMotionAnalyzer(canvasRef.current, {
        bgAlpha: 0,
        showBgColor: false,
        alphaBars: true,
        ansiBands: false,
        barSpace: 1,
        channelLayout: 'single',
        colorMode: 'gradient',
        connectSpeakers: false,
        fadePeaks: true,
        fftSize: 2048,
        fillAlpha: 0.9,
        frequencyScale: 'log',
        gravity: true,
        ledBars: false,
        linearAmplitude: false,
        linearBoost: 0,
        lineWidth: 3,
        loRes: false,
        lumiBars: true,
        maxDecibels: -10,
        maxFPS: 60,
        maxFreq: 20000,
        minDecibels: -90,
        minFreq: 20,
        mirror: true,
        mode: 6,
        noteLabels: false,
        outlineBars: false,
        overlay: true,
        peakFadeTime: 0.5,
        peakHoldTime: 0.2,
        peakLine: false,
        radial: false,
        radialInvert: false,
        radius: 50,
        reflexAlpha: 0.3,
        reflexBright: 1,
        reflexFit: true,
        reflexRatio: 0.3,
        roundBars: true,
        showFPS: false,
        showPeaks: true,
        showScaleX: false,
        showScaleY: false,
        smoothing: 0.8,
        spinSpeed: 0,
        splitGradient: false,
        trueLeds: false,
        volume: 100,
        weightingFilter: 'none',
        gradient: 'classic',
        source: audio, // Передаём audio элемент - audiomotion сам создаст контекст
      })

      console.log('[Visualizer] Initialized with source parameter')
      setMotion(audioMotion)
      setAnalyserCreated(true)
    } catch (err) {
      console.error('[Visualizer] Error initializing:', err)
      setError(`Ошибка инициализации: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`)
    }

    return () => {
      if (audioMotion) {
        audioMotion.destroy()
        setMotion(undefined)
      }
    }
  }, [libraryLoaded])

  const handleToggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand()
    }
  }

  return (
    <div 
      className={cn(
        'relative w-full h-full bg-black overflow-hidden',
        expanded && 'fixed inset-0 z-50'
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Кнопки управления (появляются при наведении) */}
      <div className={cn(
        "absolute top-4 right-4 z-10 flex gap-2 transition-opacity duration-300",
        showControls || expanded ? 'opacity-100' : 'opacity-0'
      )}>
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-all hover:scale-110"
          onClick={handleToggleExpand}
          title={expanded ? 'Свернуть' : 'Развернуть'}
        >
          {expanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-all hover:scale-110"
          onClick={() => {
            if (motion) {
              // Показываем доступные режимы
              const modes = [
                { id: 0, name: 'Off' },
                { id: 1, name: 'Bands' },
                { id: 2, name: 'Bands 2D' },
                { id: 3, name: 'Bands 3D' },
                { id: 4, name: 'Lines' },
                { id: 5, name: 'Lines 2D' },
                { id: 6, name: 'Bars (current)' },
                { id: 7, name: 'Waveform' },
                { id: 8, name: 'Oscilloscope' },
              ]
              const currentMode = motion.options?.mode || 6
              const nextMode = (currentMode + 1) % 9
              motion.setOptions({ mode: nextMode })
              toast.info(`🎨 Режим: ${modes[nextMode].name}`)
            }
          }}
          title="Сменить режим"
        >
          <Settings size={20} />
        </Button>
      </div>

      {/* Canvas для визуализатора */}
      <div
        ref={canvasRef}
        className="w-full h-full"
        style={{ opacity: 1 }}
      />

      {/* Подсказка если библиотека не загружена */}
      {!libraryLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50">
          <p className="text-lg">Загрузка визуализатора...</p>
        </div>
      )}

      {/* Сообщение об ошибке */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-400 p-8 text-center bg-black/80">
          <div>
            <p className="text-lg font-semibold mb-2">⚠️ {error}</p>
            <p className="text-sm text-white/70">
              Включите воспроизведение музыки
            </p>
          </div>
        </div>
      )}

      {/* Градиент снизу для красоты */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      
      {/* Индикатор работы */}
      {analyserCreated && !error && (
        <div className="absolute bottom-4 left-4 text-xs text-white/30 pointer-events-none">
          🎵 Visualizer Active
        </div>
      )}
    </div>
  )
}
