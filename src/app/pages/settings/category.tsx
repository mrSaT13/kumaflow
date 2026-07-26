import { ChevronLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Pages } from '@/app/components/settings/pages'
import { isValidSettingsPage } from '@/lib/settings-navigation'
import { useAppSettings } from '@/store/app.store'

export default function SettingsCategoryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pageId = '' } = useParams()
  const { setCurrentPage } = useAppSettings()

  useEffect(() => {
    if (!isValidSettingsPage(pageId)) {
      navigate('/settings', { replace: true })
      return
    }
    setCurrentPage(pageId)
  }, [pageId, navigate, setCurrentPage])

  if (!isValidSettingsPage(pageId)) return null

  return (
    <div className="w-full pb-8">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/settings')}
            className="flex size-9 items-center justify-center rounded-full transition-colors active:bg-accent/60"
            aria-label="Назад"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="min-w-0 truncate text-xl font-bold">
            {t(`settings.options.${pageId}`)}
          </h1>
        </div>
      </div>

      <div className="px-4 pt-5 md:px-6">
        <Pages page={pageId} />
      </div>
    </div>
  )
}
