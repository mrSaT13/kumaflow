import { useEffect, useMemo, useState } from 'react'
import { Flame, Gauge, SkipForward, TrendingUp } from 'lucide-react'

import {
  readInsights,
  type ListeningInsights,
  type DailyBucket,
} from '@/service/listening-insights'

interface Props {
  /** Ключ, меняющийся при навигации — форсирует пересчёт. */
  refreshKey?: string | number
}

/**
 * Видимые инсайты по прослушиванию: стрик, реальные минуты, паттерн скипов.
 *
 * Всё это уже было посчитано, но не показывалось — у пользователя не было
 * ни повода вернуться завтра, ни ощущения, что его вкус кто-то изучает.
 */
export function ListeningInsightsCard({ refreshKey }: Props) {
  const [data, setData] = useState<ListeningInsights | null>(null)

  useEffect(() => {
    setData(readInsights())
  }, [refreshKey])

  const maxPlays = useMemo(
    () => (data?.days.length ? Math.max(...data.days.map((d) => d.plays)) : 0),
    [data],
  )

  // Не показываем пустую карточку: у нового пользователя событий ещё нет.
  if (!data || data.activeDays === 0) return null

  const last14 = data.days.slice(-14)

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide opacity-70">
          Как вы слушаете
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<Flame className="size-4" />}
          value={String(data.currentStreak)}
          label="дней подряд"
          accent={data.currentStreak > 0}
          hint={
            data.longestStreak > data.currentStreak
              ? `рекорд ${data.longestStreak}`
              : undefined
          }
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          value={formatMinutes(data.totalMinutes)}
          label="всего прослушано"
        />
        <Stat
          icon={<Gauge className="size-4" />}
          value={formatMinutes(data.minutesLast7Days)}
          label="за 7 дней"
        />
        <Stat
          icon={<SkipForward className="size-4" />}
          value={String(data.skipPattern?.total ?? 0)}
          label="скипов"
        />
      </div>

      {data.currentStreak >= 2 && (
        <p className="text-sm">
          <Flame className="size-4 inline mr-1.5 -mt-0.5" />
          {data.currentStreak} {plural(data.currentStreak, 'день', 'дня', 'дней')}
          подряд. Ещё {data.currentStreak + 1} — и это будет ваш новый рекорд.
        </p>
      )}

      {data.skipPattern && (
        <p className="text-sm opacity-80">
          <SkipForward className="size-4 inline mr-1.5 -mt-0.5" />
          {data.skipPattern.headline}
        </p>
      )}

      <div>
        <div className="text-xs opacity-60 mb-2">Последние 14 дней</div>
        <div className="flex items-end gap-1 h-16">
          {last14.map((day) => (
            <DayBar key={day.date} day={day} max={maxPlays} />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayBar({ day, max }: { day: DailyBucket; max: number }) {
  const heightPct = max > 0 ? Math.max(8, (day.plays / max) * 100) : 8
  const title = `${day.date}: ${day.plays} прослушиваний, ${Math.round(day.listenedSec / 60)} мин`
  return (
    <div
      className="flex-1 min-w-1 rounded-sm bg-primary/70"
      style={{ height: `${heightPct}%` }}
      title={title}
    />
  )
}

function Stat({
  icon,
  value,
  label,
  hint,
  accent,
}: {
  icon: React.ReactNode
  value: string
  label: string
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs opacity-60">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={`text-xl font-semibold mt-0.5 ${accent ? 'text-orange-400' : ''}`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] opacity-50">{hint}</div>}
    </div>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 24) return m === 0 ? `${h} ч` : `${h} ч ${m} мин`
  const days = Math.floor(h / 24)
  return `${days} дн ${h % 24} ч`
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}