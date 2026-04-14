import { useState, useEffect } from 'react'
import { Cast, Tv, Speaker, Gamepad2, X, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/app/components/ui/dialog'
import { toast } from 'react-toastify'
import { usePlayerStore } from '@/store/player.store'

interface DLNADevice {
  id: string
  name: string
  type: 'tv' | 'speaker' | 'gamepad' | 'other'
  icon: string
  descriptionUrl: string
  controlUrl: string
}

interface DLNAModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DLNAModal({ open, onOpenChange }: DLNAModalProps) {
  const [devices, setDevices] = useState<DLNADevice[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [currentDevice, setCurrentDevice] = useState<DLNADevice | null>(null)
  const [scanProgress, setScanProgress] = useState(0)

  const currentSong = usePlayerStore((state) => state.songlist.currentSong)

  // Сбрасываем устройства при открытии
  useEffect(() => {
    if (open) {
      setDevices([])
      setScanProgress(0)
      scanDevices()
    }
  }, [open])

  const scanDevices = async () => {
    console.log('[DLNA Modal] Scan started')
    setIsScanning(true)
    setScanProgress(0)
    setDevices([])

    try {
      // Запускаем DLNA сервер если не запущен
      console.log('[DLNA Modal] Starting DLNA server...')
      const started = await window.api.dlna.start(8080)
      console.log('[DLNA Modal] Server started:', started)

      // Прогресс бар
      const progressInterval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 300)

      // Сканируем устройства
      console.log('[DLNA Modal] Calling window.api.dlna.scan()')
      const found = await window.api.dlna.scan()
      console.log('[DLNA Modal] Found devices:', found)

      clearInterval(progressInterval)
      setScanProgress(100)
      setDevices(found)

      if (found.length === 0) {
        toast.info('Устройства не найдены. Убедитесь что они включены и в той же сети.', {
          autoClose: 5000,
        })
      } else {
        toast.success(`Найдено устройств: ${found.length}`, {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('[DLNA] Scan error:', error)
      toast.error('Ошибка сканирования устройств: ' + String(error))
    } finally {
      setIsScanning(false)
      setTimeout(() => setScanProgress(0), 500)
    }
  }

  const castToDevice = async (device: DLNADevice) => {
    if (!currentSong) {
      toast.error('Сначала выберите трек')
      return
    }

    try {
      const success = await window.api.dlna.cast(device, currentSong.id)

      if (success) {
        setCurrentDevice(device)
        toast.success(`Воспроизведение на ${device.name}`)
        onOpenChange(false)  // Закрываем модальное окно
      } else {
        toast.error('Не удалось отправить на устройство')
      }
    } catch (error) {
      console.error('[DLNA] Cast error:', error)
      toast.error('Ошибка отправки на устройство')
    }
  }

  const stopCasting = async () => {
    try {
      await window.api.dlna.stop()
      setCurrentDevice(null)
      toast.success('Воспроизведение остановлено')
      onOpenChange(false)
    } catch (error) {
      console.error('[DLNA] Stop error:', error)
      toast.error('Ошибка остановки')
    }
  }

  const getDeviceIcon = (type: DLNADevice['type']) => {
    switch(type) {
      case 'tv': return <Tv className="w-6 h-6" />
      case 'speaker': return <Speaker className="w-6 h-6" />
      case 'gamepad': return <Gamepad2 className="w-6 h-6" />
      default: return <Cast className="w-6 h-6" />
    }
  }

  const getDeviceColor = (type: DLNADevice['type']) => {
    switch(type) {
      case 'tv': return 'from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
      case 'speaker': return 'from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700'
      case 'gamepad': return 'from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
      default: return 'from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-background border-border">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cast className="w-6 h-6 text-primary" />
              <DialogTitle>Устройства в сети</DialogTitle>
            </div>
            {currentDevice && (
              <Button
                variant="ghost"
                size="sm"
                onClick={stopCasting}
                className="text-destructive hover:text-destructive"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          <DialogDescription className="text-sm">
            {currentDevice 
              ? `Подключено: ${currentDevice.name}`
              : 'Выберите устройство для воспроизведения'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Прогресс сканирования */}
          {isScanning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Поиск устройств...</span>
                <span className="text-muted-foreground">{scanProgress}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Кнопка повторного сканирования */}
          {!isScanning && devices.length === 0 && !currentDevice && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <WifiOff className="w-12 h-12 text-muted-foreground" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Устройства не найдены</p>
                <p className="text-xs text-muted-foreground">
                  Убедитесь что устройства включены и в той же WiFi сети
                </p>
              </div>
              <Button
                variant="outline"
                onClick={scanDevices}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Повторить поиск
              </Button>
            </div>
          )}

          {/* Список устройств */}
          {devices.length > 0 && !currentDevice && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {devices.map(device => (
                <Button
                  key={device.id}
                  variant="outline"
                  className={`w-full justify-start gap-3 h-16 transition-all ${getDeviceColor(device.type)}`}
                  onClick={() => castToDevice(device)}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-background/20">
                    {getDeviceIcon(device.type)}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium text-foreground">
                      {device.name}
                    </div>
                    <div className="text-xs text-foreground/70 capitalize">
                      {device.type === 'gamepad' ? 'Игровая консоль' : 
                       device.type === 'speaker' ? 'Аудио устройство' :
                       device.type === 'tv' ? 'Телевизор' : 'Устройство'}
                    </div>
                  </div>
                  <Cast className="w-4 h-4 text-foreground/50" />
                </Button>
              ))}
            </div>
          )}

          {/* Текущее устройство */}
          {currentDevice && (
            <div className="py-8 flex flex-col items-center justify-center space-y-4">
              <div className={`p-6 rounded-full bg-gradient-to-br ${getDeviceColor(currentDevice.type)}`}>
                {getDeviceIcon(currentDevice.type)}
              </div>
              <div className="text-center space-y-1">
                <p className="text-lg font-medium">{currentDevice.name}</p>
                <p className="text-sm text-muted-foreground">Воспроизведение активно</p>
              </div>
              {currentSong && (
                <div className="text-sm text-muted-foreground">
                  {currentSong.title} — {currentSong.artist}
                </div>
              )}
            </div>
          )}

          {/* Подсказки */}
          {!currentDevice && devices.length === 0 && !isScanning && (
            <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
              <p><strong>Поддерживаемые устройства:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Smart TV (Samsung, LG, Sony)</li>
                <li>DLNA/UPnP колонки</li>
                <li>PlayStation / Xbox</li>
                <li>Умные дисплеи</li>
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
