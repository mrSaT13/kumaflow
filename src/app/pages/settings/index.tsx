import { ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { getSettingsOptions } from '@/app/components/settings/options'
import { getSettingsPagePath } from '@/lib/settings-navigation'

export default function SettingsIndexPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const options = getSettingsOptions()

  return (
    <div className="w-full pb-6">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/profile')}
            className="flex size-9 items-center justify-center rounded-full transition-colors active:bg-accent/60"
            aria-label="Назад"
          >
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <Settings className="size-5 shrink-0 text-primary" />
            <h1 className="truncate text-xl font-bold">{t('settings.label')}</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5">
        <div className="overflow-hidden rounded-2xl border bg-background-foreground">
          {options.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => navigate(getSettingsPagePath(item.id))}
                className={[
                  'flex w-full items-center gap-3 px-4 py-3.5 transition-colors active:bg-accent/60',
                  index > 0 ? 'border-t' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left text-[15px] font-medium text-foreground">
                  {t(`settings.options.${item.id}`)}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
