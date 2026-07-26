import { useRef, useState, useEffect } from 'react'
import { Download, Upload, RotateCcw, Trash2 } from 'lucide-react'
import {
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from '@/app/components/settings/settings-layout'
import { Button } from '@/app/components/ui/button'
import { toast } from 'react-toastify'
import {
  exportSettings,
  importSettings,
  getBackups,
  restoreFromBackup,
  clearBackups,
} from '@/service/settings-export'

export function SettingsExportImport() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [backups, setBackups] = useState<Array<{ key: string; date: string }>>([])

  useEffect(() => {
    setBackups(getBackups())

    const handleStorageChange = () => {
      setBackups(getBackups())
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  const handleExport = async () => {
    await exportSettings()
    setTimeout(() => {
      setBackups(getBackups())
    }, 600)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      await importSettings(file)
      setTimeout(() => {
        setBackups(getBackups())
      }, 1000)
    } catch (error) {
      console.error('[Import] Error:', error)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRestoreBackup = async (backupKey: string) => {
    const confirmed = confirm('Восстановить настройки из этой резервной копии?')
    if (!confirmed) return

    await restoreFromBackup(backupKey)
  }

  const handleClearBackups = async () => {
    const confirmed = confirm('Удалить все резервные копии настроек?')
    if (!confirmed) return

    clearBackups()
    setBackups([])
    toast.success('Резервные копии удалены')
  }

  return (
    <SettingsCard
      title="Экспорт и импорт"
      description="Сохраните все настройки в файл или восстановите из резервной копии"
    >
      <SettingsSection>
        <SettingsRow
          label="Экспортировать настройки"
          description="Сохранить все настройки в JSON файл"
          children={
            <Button onClick={handleExport} variant="outline" size="sm" className="w-full sm:w-auto">
              <Download className="mr-2 size-4" />
              Экспорт
            </Button>
          }
        />

        <SettingsRow
          label="Импортировать настройки"
          description="Восстановить настройки из JSON файла"
          children={
            <>
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                <Upload className="mr-2 size-4" />
                Импорт
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </>
          }
        />
      </SettingsSection>

      {backups.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Резервные копии</p>
              <p className="text-xs text-muted-foreground">
                Доступно копий: {backups.length}
              </p>
            </div>
            <Button onClick={handleClearBackups} variant="ghost" size="sm" className="w-full sm:w-auto">
              <Trash2 className="mr-2 size-4" />
              Очистить
            </Button>
          </div>

          <div className="max-h-48 space-y-2 overflow-y-auto">
            {backups.map((backup) => (
              <div
                key={backup.key}
                className="flex flex-col gap-2 rounded-lg bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-muted-foreground">{backup.date}</span>
                <Button
                  onClick={() => handleRestoreBackup(backup.key)}
                  variant="ghost"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <RotateCcw className="mr-2 size-4" />
                  Восстановить
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
        <p className="text-xs text-muted-foreground">
          Экспортируйте настройки регулярно — так их можно быстро восстановить
          при переустановке или на новом устройстве.
        </p>
      </div>
    </SettingsCard>
  )
}
