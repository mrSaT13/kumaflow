import {
  BarChart3,
  ChevronRight,
  CircleUserRound,
  Clock,
  Database,
  Info,
  LogOut,
  Settings,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AboutDialog } from '@/app/components/about/dialog'
import { useAvatar } from '@/store/avatar.store'
import { useAppData, useAppStore } from '@/store/app.store'

interface ProfileLink {
  label: string
  icon: typeof Database
  route?: string
  onClick?: () => void
  accent?: string
}

interface ProfileSection {
  title: string
  items: ProfileLink[]
}

export default function ProfilePage() {
  const avatar = useAvatar()
  const { username, url, lockUser } = useAppData()
  const setLogoutDialogState = useAppStore(
    (state) => state.actions.setLogoutDialogState,
  )
  const navigate = useNavigate()
  const [aboutOpen, setAboutOpen] = useState(false)

  const sections: ProfileSection[] = [
    {
      title: 'Активность',
      items: [
        { label: 'История', icon: Clock, route: '/history' },
        { label: 'Статистика', icon: BarChart3, route: '/ml/stats' },
      ],
    },
    {
      title: 'Хранилище',
      items: [
        { label: 'Кэш', icon: Database, route: '/cache', accent: 'text-emerald-400' },
      ],
    },
    {
      title: 'Приложение',
      items: [
        { label: 'Настройки', icon: Settings, route: '/settings' },
        { label: 'О программе', icon: Info, onClick: () => setAboutOpen(true) },
      ],
    },
  ]

  const handleItem = (item: ProfileLink) => {
    if (item.onClick) return item.onClick()
    if (item.route) navigate(item.route)
  }

  return (
    <div className="w-full pb-6">
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      {/* Шапка профиля */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600/30 via-blue-600/20 to-purple-600/30 px-5 pt-8 pb-6">
        <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div
            className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/30 bg-white/10"
            style={{
              background: avatar.avatarData
                ? `url(${avatar.avatarData}) center / cover`
                : undefined,
              backgroundPosition: avatar.avatarData
                ? `${avatar.cropX}% ${avatar.cropY}%`
                : undefined,
              backgroundSize: avatar.avatarData
                ? `${avatar.scale * 100}%`
                : undefined,
            }}
          >
            {!avatar.avatarData && (
              <CircleUserRound className="size-8 text-white/80" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold text-foreground">
              {username || 'Пользователь'}
            </h1>
            <p className="truncate text-sm text-muted-foreground">{url}</p>
          </div>
        </div>
      </div>

      {/* Разделы */}
      <div className="space-y-6 px-4 pt-5">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </h2>
            <div className="overflow-hidden rounded-2xl border bg-background-foreground">
              {section.items.map((item, index) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    onClick={() => handleItem(item)}
                    className={cnRow(index)}
                  >
                    <Icon className={`size-5 shrink-0 ${item.accent ?? 'text-muted-foreground'}`} />
                    <span className="flex-1 text-left text-[15px] font-medium text-foreground">
                      {item.label}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Выход */}
        {!lockUser && (
          <button
            onClick={() => setLogoutDialogState(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 py-3.5 text-[15px] font-medium text-red-400 transition-colors active:bg-red-500/20"
          >
            <LogOut className="size-5" />
            Выйти из аккаунта
          </button>
        )}
      </div>
    </div>
  )
}

function cnRow(index: number) {
  return [
    'flex w-full items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent/60',
    index > 0 ? 'border-t' : '',
  ]
    .filter(Boolean)
    .join(' ')
}
