import { usePWA } from '@/app/hooks/use-pwa'
import { Button } from '@/app/components/ui/button'
import { Download } from 'lucide-react'

export function PWAInstallPrompt() {
  const { isInstallable, isInstalled, install } = usePWA()

  // Если уже установлено или нельзя установить - не показываем
  if (isInstalled || !isInstallable) {
    return null
  }

  const handleInstall = async () => {
    await install()
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 p-4 bg-card border border-border rounded-lg shadow-lg max-w-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">
            📦 Установить KumaFlow
          </h3>
          <p className="text-xs text-muted-foreground">
            Установите приложение для быстрого доступа и работы офлайн
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Скрыть подсказку
              localStorage.setItem('pwa-prompt-dismissed', 'true')
            }}
          >
            Позже
          </Button>
          <Button
            size="sm"
            onClick={handleInstall}
          >
            <Download className="w-4 h-4 mr-2" />
            Установить
          </Button>
        </div>
      </div>
    </div>
  )
}
