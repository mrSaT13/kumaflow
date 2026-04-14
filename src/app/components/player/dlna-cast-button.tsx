import { useState } from 'react'
import { Cast, X } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { toast } from 'react-toastify'
import { usePlayerStore } from '@/store/player.store'
import { DLNAModal } from './dlna-modal'

interface DLNADevice {
  id: string
  name: string
  type: 'tv' | 'speaker' | 'gamepad' | 'other'
  icon: string
  descriptionUrl: string
  controlUrl: string
}

export function DLNACastButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const [currentDevice, setCurrentDevice] = useState<DLNADevice | null>(null)

  const currentSong = usePlayerStore((state) => state.songlist.currentSong)

  const stopCasting = async () => {
    try {
      await window.api.dlna.stop()
      setCurrentDevice(null)
      toast.success('Воспроизведение остановлено')
    } catch (error) {
      console.error('[DLNA] Stop error:', error)
      toast.error('Ошибка остановки')
    }
  }

  return (
    <>
      {currentDevice ? (
        <Button
          variant="default"
          size="sm"
          className="gap-2 bg-primary hover:bg-primary/90"
          onClick={stopCasting}
          title="Остановить трансляцию"
        >
          <Cast className="w-4 h-4" />
          <span className="hidden md:inline">{currentDevice.name}</span>
          <X className="w-4 h-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setModalOpen(true)}
          title="Отправить на устройство (DLNA)"
        >
          <Cast className="w-5 h-5" />
        </Button>
      )}

      <DLNAModal 
        open={modalOpen} 
        onOpenChange={(open) => {
          setModalOpen(open)
          // Если закрыли окно и устройство подключено - обновляем состояние
          if (!open && currentDevice) {
            // Проверяем не остановлено ли воспроизведение
            const device = window.api.dlna.getCurrentDevice?.()
            if (!device) {
              setCurrentDevice(null)
            }
          }
        }} 
      />
    </>
  )
}
