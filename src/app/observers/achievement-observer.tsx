import { useEffect, useRef } from 'react'
import { Award, Compass, Heart, ListMusic, Music } from 'lucide-react'
import { toast } from 'react-toastify'

import { useAchievementsStore } from '@/store/achievements.store'

const ICONS = {
  music: Music,
  heart: Heart,
  playlist: ListMusic,
  discovery: Compass,
} as const

const RARITY: Record<string, { label: string; className: string }> = {
  listening: { label: 'Прослушивание', className: 'text-sky-300' },
  likes: { label: 'Лайки', className: 'text-rose-300' },
  playlists: { label: 'Плейлисты', className: 'text-violet-300' },
  discovery: { label: 'Открытия', className: 'text-emerald-300' },
}

/**
 * Праздник при разблокировке достижения.
 *
 * Раньше разблокировка писалась только в console.log — награда была
 * невидимой, то есть её просто не существовало для пользователя.
 * Теперь это момент: тост, иконка, цвет категории и задержка закрытия,
 * пропорциональная ценности награды.
 */
export function AchievementObserver() {
  const justUnlocked = useAchievementsStore((state) => state.justUnlocked)
  const clearJustUnlocked = useAchievementsStore((state) => state.clearJustUnlocked)
  const shownRef = useRef<string | null>(null)

  useEffect(() => {
    if (!justUnlocked) return

    // Защита от повторного показа того же достижения (React StrictMode
    // в dev монтирует эффекты дважды).
    const key = `${justUnlocked.id}:${justUnlocked.unlockedAt ?? ''}`
    if (shownRef.current === key) return
    shownRef.current = key

    const Icon = ICONS[justUnlocked.icon as keyof typeof ICONS] ?? Award
    const rarity = RARITY[justUnlocked.category] ?? RARITY.listening

    // Крупные награды (тысячи прослушиваний) живут на экране дольше.
    const big = justUnlocked.maxProgress >= 1000
    const autoClose = big ? 8000 : 5500

    toast(
      <div className="flex items-start gap-3">
        {/* achievement-icon — хук для кольца-вспышки в .achievement-toast */}
        <span className="achievement-icon mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-white/10 animate-in zoom-in-75 duration-300">
          <Icon className={`size-5 ${rarity.className}`} />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider opacity-60">
            Достижение открыто
          </div>
          <div className="font-semibold leading-tight">{justUnlocked.title}</div>
          <div className="text-xs opacity-70 leading-snug">
            {justUnlocked.description}
          </div>
        </div>
      </div>,
      {
        toastId: `achievement-${justUnlocked.id}`,
        autoClose,
        closeOnClick: true,
        draggable: false,
        className: 'achievement-toast',
      },
    )

    const timer = setTimeout(() => {
      clearJustUnlocked()
      shownRef.current = null
    }, autoClose)

    return () => clearTimeout(timer)
  }, [justUnlocked, clearJustUnlocked])

  return null
}