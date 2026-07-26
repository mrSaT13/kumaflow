import { CircleUserRound, Home, Library, Sparkles } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { usePlayerFullscreen } from '@/store/player.store'

interface BottomNavTab {
  label: string
  to: string
  icon: typeof Home
  isActive: (pathname: string) => boolean
}

const tabs: BottomNavTab[] = [
  {
    label: 'Главная',
    to: '/',
    icon: Home,
    isActive: (p) => p === '/',
  },
  {
    label: 'Для вас',
    to: '/ml/for-you',
    icon: Sparkles,
    isActive: (p) => p.startsWith('/ml'),
  },
  {
    label: 'Библиотека',
    to: '/library',
    icon: Library,
    isActive: (p) =>
      p.startsWith('/library') ||
      p.startsWith('/artists') ||
      p.startsWith('/albums') ||
      p.startsWith('/genres') ||
      p.startsWith('/audiobooks'),
  },
  {
    label: 'Профиль',
    to: '/profile',
    icon: CircleUserRound,
    isActive: (p) => p.startsWith('/profile'),
  },
]

export function BottomNav() {
  const { pathname } = useLocation()
  const { isFullscreen } = usePlayerFullscreen()

  if (isFullscreen) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-[calc(var(--bottomnav-height)+env(safe-area-inset-bottom))] border-t bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((tab) => {
        const active = tab.isActive(pathname)
        const Icon = tab.icon

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className="flex flex-1 flex-col items-center justify-center gap-1.5 pt-2 transition-colors active:bg-accent/40"
          >
            <Icon
              className={cn(
                'size-7 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
              strokeWidth={active ? 2.5 : 2}
            />
            <span
              className={cn(
                'text-xs font-medium leading-none transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {tab.label}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}
