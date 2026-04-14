/**
 * Данные — Экспорт/Импорт настроек, бэкапы, подкасты
 */

import { SettingsExportImport } from '@/app/components/settings/pages/content/export-import'
import { Separator } from '@/app/components/ui/separator'
import { Button } from '@/app/components/ui/button'
import { Download, Upload } from 'lucide-react'
import { toast } from 'react-toastify'
import { useLocalPodcastsStore } from '@/store/local-podcasts.store'
import {
  downloadPodcastsExport,
  importPodcasts,
  showPodcastImportDialog,
  readImportFile,
} from '@/service/podcast-export'

export function DataTab() {
  const localPodcasts = useLocalPodcastsStore((state) => state.podcasts)
  const { addPodcast: addLocalPodcast } = useLocalPodcastsStore()

  const handleExportPodcasts = () => {
    if (localPodcasts.length === 0) {
      toast.info('Нет подкастов для экспорта')
      return
    }
    downloadPodcastsExport(localPodcasts)
    toast.success(`Экспортировано ${localPodcasts.length} подкаст(ов)`)
  }

  const handleImportPodcasts = async () => {
    try {
      const file = await showPodcastImportDialog()
      if (!file) return

      const json = await readImportFile(file)
      const result = await importPodcasts(json)

      if (result.podcasts.length > 0) {
        result.podcasts.forEach(podcast => addLocalPodcast(podcast))
        toast.success(`Импортировано ${result.podcasts.length} подкаст(ов)`)
      }

      if (result.errors.length > 0) {
        toast.warning(`Ошибки: ${result.errors.join(', ')}`)
      }
    } catch (error) {
      console.error('[Data] Podcast import error:', error)
      toast.error('Ошибка импорта подкастов')
    }
  }

  return (
    <div className="space-y-6">
      {/* Экспорт/Импорт настроек */}
      <div>
        <h3 className="text-lg font-semibold mb-3">⚙️ Настройки приложения</h3>
        <SettingsExportImport />
      </div>

      <Separator />

      {/* Импорт/Экспорт подкастов */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🎙️ Подкасты</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportPodcasts}
          >
            <Upload className="w-4 h-4 mr-2" />
            Импорт подкастов
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPodcasts}
            disabled={localPodcasts.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Экспорт подкастов ({localPodcasts.length})
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Импорт/экспорт списка подписок на подкасты в формате JSON
        </p>
      </div>
    </div>
  )
}
