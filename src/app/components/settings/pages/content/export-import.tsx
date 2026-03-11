import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Upload, RotateCcw, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Label } from '@/app/components/ui/label'
import { toast } from 'react-toastify'
import {
  exportSettings,
  importSettings,
  getBackups,
  restoreFromBackup,
  clearBackups,
} from '@/service/settings-export'

export function SettingsExportImport() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [backups, setBackups] = useState<Array<{ key: string; date: string }>>([])

  // Обновляем список резервных копий при монтировании и при изменении localStorage
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
    // Обновляем список после экспорта (с задержкой чтобы backup успел создаться)
    setTimeout(() => {
      const backups = getBackups()
      console.log('[Export] Current backups after export:', backups.length)
      setBackups(backups)
    }, 600)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    console.log('[Import] File selected:', file.name)

    try {
      await importSettings(file)
      console.log('[Import] Import completed, checking backups...')
      // Обновляем список после импорта (с задержкой чтобы backup успел создаться)
      setTimeout(() => {
        const backups = getBackups()
        console.log('[Import] Current backups:', backups.length)
        setBackups(backups)
      }, 1000)
    } catch (error) {
      console.error('[Import] Error:', error)
    }

    // Сбрасываем input
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
    toast.success('✅ Резервные копии удалены')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>💾 Экспорт/Импорт настроек</CardTitle>
        <CardDescription>
          Сохраните все настройки в файл или восстановите из резервной копии
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Экспорт */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Экспортировать настройки</Label>
              <p className="text-sm text-muted-foreground">
                Сохранить все настройки в JSON файл
              </p>
            </div>
            <Button onClick={handleExport} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Экспорт
            </Button>
          </div>
        </div>

        {/* Импорт */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Импортировать настройки</Label>
              <p className="text-sm text-muted-foreground">
                Восстановить настройки из JSON файла
              </p>
            </div>
            <Button onClick={() => fileInputRef.current?.click()} variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Импорт
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {/* Резервные копии */}
        {backups.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label>Резервные копии</Label>
                <p className="text-sm text-muted-foreground">
                  Доступно копий: {backups.length}
                </p>
              </div>
              <Button onClick={handleClearBackups} variant="ghost" size="sm">
                <Trash2 className="w-4 h-4 mr-2" />
                Очистить
              </Button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {backups.map((backup) => (
                <div
                  key={backup.key}
                  className="flex items-center justify-between p-2 bg-muted rounded-md"
                >
                  <span className="text-sm text-muted-foreground">{backup.date}</span>
                  <Button
                    onClick={() => handleRestoreBackup(backup.key)}
                    variant="ghost"
                    size="sm"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Восстановить
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Информация */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-md">
          <p className="text-sm text-blue-400">
            💡 <strong>Совет:</strong> Экспортируйте настройки регулярно и храните файл 
            в надёжном месте. Это позволит быстро восстановить все настройки при 
            переустановке приложения или переходе на новое устройство.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
