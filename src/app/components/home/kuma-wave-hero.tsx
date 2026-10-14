import { BarChart3, Pause, Play, Settings2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface KumaWaveHeroProps {
  onPlay: () => void
  onOpenSettings: () => void
  onOpenStats: () => void
  isGenerating: boolean
  isWaveActive: boolean
  isPlaying: boolean
  waveHint: string
  onClearHint: () => void
  dark?: boolean
  /** Слот handoff («Продолжить с …») — рендерит родитель */
  handoffSlot?: ReactNode
}

/**
 * KumaWaveHero — центрированный hero «Моя волна» + кнопки из старой секции:
 * «▶ Моя волна», пилюля «Настроить», иконка статистики,
 * пилюля активного контекста. «Для вас/Тренды» убраны —
 * они и так есть в «Быстром доступе» ниже.
 */
export function KumaWaveHero({
  onPlay,
  onOpenSettings,
  onOpenStats,
  isGenerating,
  isWaveActive,
  isPlaying,
  waveHint,
  onClearHint,
  dark = false,
  handoffSlot,
}: KumaWaveHeroProps) {
  const title = dark ? 'text-white' : 'text-[#111111]'
  const iconFill = dark ? 'fill-white text-white' : 'fill-[#111111] text-[#111111]'

  return (
    <div className="relative z-10 flex min-h-[440px] flex-col px-8 pb-6 pt-12 sm:min-h-[480px] sm:px-12">
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <button
          onClick={onPlay}
          disabled={isGenerating}
          className={cn(
            'flex items-center gap-3 text-[32px] font-extrabold leading-none tracking-tight transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-70 sm:text-4xl',
            title,
          )}
          title={isWaveActive ? (isPlaying ? 'Пауза' : 'Продолжить') : 'Запустить Мою волну'}
        >
          {isGenerating ? (
            <span
              className={cn(
                'h-7 w-7 rounded-full border-[3px] animate-spin',
                dark ? 'border-white/15 border-t-white' : 'border-black/15 border-t-black',
              )}
            />
          ) : isWaveActive && isPlaying ? (
            <Pause className={cn('h-8 w-8', iconFill)} />
          ) : (
            <Play className={cn('h-8 w-8', iconFill)} />
          )}
          Моя волна
        </button>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={onOpenSettings}
            className={cn(
              'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium shadow-sm transition-colors',
              dark
                ? 'bg-white/10 text-white backdrop-blur-sm hover:bg-white/20'
                : 'bg-[#DCE7F8]/90 text-[#1A2B4A] hover:bg-[#CBDDF5]',
            )}
          >
            <Settings2 className="h-4 w-4" />
            Настроить
          </button>

          {/* Кнопка статистики из старой секции */}
          <button
            onClick={onOpenStats}
            title="Статистика прослушиваний"
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-colors',
              dark
                ? 'bg-white/10 text-white backdrop-blur-sm hover:bg-white/20'
                : 'bg-[#DCE7F8]/90 text-[#1A2B4A] hover:bg-[#CBDDF5]',
            )}
          >
            <BarChart3 className="h-4 w-4" />
          </button>

          {waveHint && (
            <button
              onClick={onClearHint}
              title="Сбросить настройку волны"
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur-sm transition-colors',
                dark
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-black/[0.07] text-[#1A2B4A] hover:bg-black/[0.12]',
              )}
            >
              {waveHint}
              <span className="opacity-60">×</span>
            </button>
          )}
        </div>
      </div>

      {handoffSlot}
    </div>
  )
}
