import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { useSleepTimer } from '@/store/sleep-timer.store'
import { Button } from '@/app/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/popover'
import { Slider } from '@/app/components/ui/slider'
import { cn } from '@/lib/utils'

const PRESET_OPTIONS = [
  { minutes: 0, label: 'До конца трека', mode: 'endOfSong' as const },
  { minutes: 5, label: '5 мин', mode: 'timed' as const },
  { minutes: 10, label: '10 мин', mode: 'timed' as const },
  { minutes: 15, label: '15 мин', mode: 'timed' as const },
  { minutes: 30, label: '30 мин', mode: 'timed' as const },
  { minutes: 45, label: '45 мин', mode: 'timed' as const },
  { minutes: 60, label: '60 мин', mode: 'timed' as const },
  { minutes: 90, label: '90 мин', mode: 'timed' as const },
  { minutes: 120, label: '120 мин', mode: 'timed' as const },
]

export function SleepTimerButton() {
  const { t } = useTranslation()
  const { isEnabled, mode, enable, enableEndOfSong, disable, getRemainingTime, isActive } = useSleepTimer()
  const [customMinutes, setCustomMinutes] = useState(30)

  const handlePresetClick = (minutes: number, modeType: 'timed' | 'endOfSong') => {
    if (modeType === 'endOfSong') {
      enableEndOfSong()
    } else {
      enable(minutes)
    }
  }

  const handleCustomSet = () => {
    enable(customMinutes)
  }

  const remainingTime = getRemainingTime()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'rounded-full w-10 h-10',
            isActive() && 'bg-primary/20 text-primary hover:bg-primary/30'
          )}
        >
          <Clock className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" side="top">
        <div className="flex flex-col">
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold mb-1">
              {t('sleep_timer.title', 'Таймер сна')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isActive() 
                ? `Осталось: ${remainingTime}`
                : 'Выберите время для остановки воспроизведения'}
            </p>
          </div>

          {/* Пресеты */}
          <div className="p-4 grid grid-cols-3 gap-2">
            {PRESET_OPTIONS.map((preset) => (
              <Button
                key={preset.minutes}
                variant={
                  (mode === preset.mode && 
                   ((preset.mode === 'timed' && preset.minutes === Math.floor((isActive() ? parseInt(remainingTime.split(':')[0]) * 60 + parseInt(remainingTime.split(':')[1]) : 0) / 60)) || 
                    preset.mode === 'endOfSong'))
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                onClick={() => handlePresetClick(preset.minutes, preset.mode)}
                className="text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Кастомное время */}
          <div className="p-4 border-t space-y-3">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('sleep_timer.custom', 'Своё время')}</span>
                <span className="font-medium">{customMinutes} мин</span>
              </div>
              <Slider
                value={[customMinutes]}
                min={5}
                max={180}
                step={5}
                onValueChange={([value]) => setCustomMinutes(value)}
              />
            </div>
            
            <Button 
              onClick={handleCustomSet}
              className="w-full"
              size="sm"
            >
              {t('sleep_timer.set', 'Установить')}
            </Button>
          </div>

          {/* Кнопка выключения */}
          {isActive() && (
            <div className="p-4 border-t">
              <Button
                onClick={disable}
                variant="destructive"
                className="w-full"
              >
                {t('sleep_timer.cancel', 'Отменить таймер')}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
