/**
 * Хук для обработки событий из трей-меню
 */

import { useEffect } from 'react'
import { toast } from 'react-toastify'
import { usePlayerActions } from '@/store/player.store'
import { useSleepTimer } from '@/store/sleep-timer.store'

export function useTrayEvents() {
  const { setSongList } = usePlayerActions()
  const { enable, disable } = useSleepTimer()

  useEffect(() => {
    if (!window.api) return

    // Обработчик открытия настроек
    const unsubscribeSettings = window.api.onOpenSettings(() => {
      console.log('[Tray] Opening settings...')
      // Открываем настройки через кастомное событие
      window.dispatchEvent(new CustomEvent('open-settings-from-tray'))
    })

    // Обработчик таймера сна
    const unsubscribeSleepTimer = window.api.onSetSleepTimer((minutes: number) => {
      console.log(`[Tray] Setting sleep timer: ${minutes} minutes`)

      if (minutes === 0) {
        // Выключить таймер
        disable()
        toast('Таймер сна выключен', { type: 'info' })
      } else {
        enable(minutes)
        toast(`Таймер сна установлен на ${minutes} мин`, { type: 'success' })
      }
    })

    // Обработчик радио артиста
    const unsubscribeArtistRadio = window.api.onGenerateArtistRadio(async () => {
      console.log('[Tray] Generating artist radio...')

      try {
        toast('Генерация радио артиста...', { type: 'info' })

        // Здесь будет логика генерации радио
        // Пока просто уведомление
        toast('Функция в разработке', { type: 'info' })
      } catch (error) {
        console.error('[Tray] Artist radio error:', error)
        toast('Ошибка при генерации радио', { type: 'error' })
      }
    })

    return () => {
      unsubscribeSettings()
      unsubscribeSleepTimer()
      unsubscribeArtistRadio()
    }
  }, [setSongList, enable, disable])
}
