/**
 * Стрик дней подряд.
 *
 * Стрик уже считался в service/listening-insights, но показывался только на
 * /ml/stats — глубокой странице, куда не заходят. Это самый дешёвый механик
 * удержания из возможных: он ничего не просит у пользователя, кроме одного
 * и того же действия (открыть плеер в следующий день), и при этом виден
 * всегда, без навигации.
 *
 * Три размера из одного компонента, потому что логика подсветки одна:
 *   - 'chip'  → в плеер-бар, в один ряд с бейджем качества
 *   - 'hero'  → на главную, inline-пилюля в ряду кнопок «Моя волна»
 *   - 'panel' → standalone-блок, если понадобится где-то ещё
 *
 * 'hero' сделан пилюлей, а не блоком, намеренно: блок в герое добавлял
 * отдельную строку и раздвигал карточку, из-за чего ховер-секция с
 * brain-handoff открывалась заметно ниже.
 */

import { Flame, Snowflake, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useListeningInsights } from '@/app/hooks/use-listening-insights'

/** С какой длины стрика включается «горячий» режим с двойным свечением. */
const HOT_THRESHOLD = 7

export interface StreakWidgetProps {
  variant?: 'chip' | 'hero' | 'panel'
  className?: string
  /** Показывать подпись «рекорд N». */
  showRecord?: boolean
}

export function StreakWidget({
  variant = 'chip',
  className,
  showRecord,
}: StreakWidgetProps) {
  const { currentStreak, longestStreak, activeDays } = useListeningInsights()

  // Новый пользователь: показывать «0 дней подряд» — это наказание за то,
  // что он только начал. Молчаливый ноль честнее.
  if (activeDays === 0) return null

  if (variant === 'panel') {
    return (
      <StreakPanel
        current={currentStreak}
        longest={longestStreak}
        showRecord={showRecord ?? true}
        className={className}
      />
    )
  }

  const hot = currentStreak >= HOT_THRESHOLD
  const record = currentStreak > 0 && currentStreak >= longestStreak
  const isHero = variant === 'hero'

  return (
    <div
      className={cn(
        'streak-chip',
        currentStreak === 0 && 'streak-chip--cold',
        hot && 'streak-chip--hot',
        isHero
          ? // Компакт под иконкой волны: колонка шириной 112/144px, поэтому
            // подпись «подряд» убрана — она в тултипе. Иначе пилюля шире
            // иконки и ломает выравнивание колонки.
            'text-xs px-2.5 py-1 gap-1 shrink-0'
          : 'px-2 py-1 text-xs shrink-0',
        className,
      )}
      title={
        currentStreak === 0
          ? 'Слушали вчера — откройте плеер сегодня, чтобы продолжить'
          : record
            ? `🔥 ${currentStreak} ${plural(currentStreak, 'день', 'дня', 'дней')} подряд — это ваш рекорд!`
            : `🔥 ${currentStreak} ${plural(currentStreak, 'день', 'дня', 'дней')} подряд · рекорд ${longestStreak}`
      }
      data-testid={isHero ? 'home-streak-hero' : 'player-streak-chip'}
    >
      {currentStreak === 0 ? (
        <>
          <Snowflake className={cn(isHero ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5', 'opacity-70')} />
          <span className="opacity-80">{isHero ? 'вчера' : 'Слушали вчера'}</span>
        </>
      ) : (
        <>
          <Flame
            className={cn('w-3.5 h-3.5', hot && 'streak-flame')}
            style={{ color: 'hsl(24 95% 58%)' }}
          />
          <span className="tabular-nums">{currentStreak}</span>
          <span className="opacity-80 font-normal">
            {plural(currentStreak, 'день', 'дня', 'дней')}
          </span>
          {record && currentStreak > 1 && (
            <Trophy className="w-3 h-3 ml-0.5 text-yellow-400" />
          )}
        </>
      )}
    </div>
  )
}

function StreakPanel({
  current,
  longest,
  showRecord,
  className,
}: {
  current: number
  longest: number
  showRecord: boolean
  className?: string
}) {
  const hot = current >= HOT_THRESHOLD
  const isRecord = current > 0 && current >= longest

  return (
    <div
      className={cn(
        'streak-chip',
        current === 0 && 'streak-chip--cold',
        hot && 'streak-chip--hot',
        'flex-col items-start gap-1 px-4 py-3 rounded-2xl',
        className,
      )}
      data-testid="home-streak-panel"
    >
      <div className="flex items-center gap-2">
        {current === 0 ? (
          <Snowflake className="w-5 h-5 opacity-60" />
        ) : (
          <Flame
            className={cn('w-5 h-5', hot && 'streak-flame')}
            style={{ color: 'hsl(24 95% 58%)' }}
          />
        )}
        <span className="text-2xl font-bold tabular-nums leading-none">
          {current}
        </span>
        <span className="text-sm opacity-70 font-normal self-end pb-0.5">
          {plural(current, 'день', 'дня', 'дней')} подряд
        </span>
      </div>

      <p className="text-xs opacity-70 font-normal leading-snug">
        {current === 0
          ? 'Вы слушали вчера. Откройте плеер сегодня — и серия продолжится.'
          : isRecord
            ? 'Это ваш рекорд. Держите темп!'
            : `Рекорд: ${longest}. Осталось ${Math.max(0, longest - current + 1)} до нового.`}
      </p>

      {showRecord && isRecord && current >= HOT_THRESHOLD && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-yellow-300">
          <Trophy className="w-3 h-3" />
          Личный рекорд
        </span>
      )}
    </div>
  )
}

/** Русская плюрализация: 1 день / 2 дня / 5 дней. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
