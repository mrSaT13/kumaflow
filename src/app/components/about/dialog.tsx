import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { AppIcon } from '@/app/components/app-icon'
import { toast } from 'react-toastify'
import { MultiBadge } from '@/app/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import githubIcon from '@/assets/icons/github-mark-white.svg'
import { subsonic } from '@/service/subsonic'
import { getAppInfo } from '@/utils/appName'
import { queryKeys } from '@/utils/queryKeys'
import { useElectronAPI } from '@/app/hooks/use-electron-api'

interface AboutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const { t } = useTranslation()
  const { name, version, url, originalUrl, description, features } = getAppInfo()
  const electronAPI = useElectronAPI()
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)

  const { data: server, isLoading } = useQuery({
    queryKey: [queryKeys.update.serverInfo],
    queryFn: subsonic.ping.pingInfo,
  })

  const checkForUpdates = async () => {
    if (!electronAPI) return
    
    setCheckingUpdate(true)
    try {
      const result = await electronAPI.checkForUpdates()
      
      // Проверка на ошибку
      if ((result as any)?.error) {
        console.warn('Update check error:', (result as any).error)
        toast.error('Не удалось проверить обновления')
        setCheckingUpdate(false)
        return
      }
      
      if (result?.updateInfo) {
        setUpdateAvailable(true)
        setUpdateInfo(result.updateInfo)
        toast.success('Доступна новая версия!')
      } else {
        toast.info('Установлена последняя версия')
      }
    } catch (error: any) {
      console.error('Failed to check for updates:', error.message)
      toast.error(error.message || 'Ошибка проверки обновлений')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const downloadUpdate = () => {
    if (!electronAPI) return
    setDownloading(true)
    electronAPI.downloadUpdate()
  }

  const installUpdate = () => {
    if (!electronAPI) return
    electronAPI.quitAndInstall()
  }

  // Обработчики событий обновлений
  useEffect(() => {
    if (!electronAPI) return

    const unsubscribeProgress = electronAPI.onDownloadProgress((progress) => {
      setDownloadProgress(progress.percent)
    })

    const unsubscribeDownloaded = electronAPI.onUpdateDownloaded((info) => {
      console.log('[About] Update downloaded:', info)
      setDownloading(false)
      setUpdateDownloaded(true)
      toast.success('Обновление загружено! Перезапустите приложение.')
    })

    return () => {
      unsubscribeProgress()
      unsubscribeDownloaded()
    }
  }, [electronAPI])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-hidden gap-0 max-w-2xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{t('menu.about')}</DialogTitle>
        <DialogHeader>
          <div className="flex gap-2 items-center justify-start w-full py-4 px-6 bg-background-foreground border-b border-border">
            <AppIcon className="size-8" />
            <div className="flex flex-col">
              <h1 className="font-medium text-lg">{name}</h1>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="w-full h-full p-6 gap-6 flex flex-col max-h-[60vh] overflow-y-auto">
          {/* Версия и проверка обновлений */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 h-full text-sm">
              <span className="text-xs font-medium">{t('about.client')}</span>
              <div className="flex flex-col gap-1 justify-center text-muted-foreground">
                <div className="flex gap-2 items-center">
                  <MultiBadge label={t('about.version')}>{version}</MultiBadge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkForUpdates}
                    disabled={checkingUpdate}
                    className="h-6 text-xs"
                  >
                    {checkingUpdate ? 'Проверка...' : 'Проверить обновления'}
                  </Button>
                </div>
                {updateAvailable && updateInfo && !downloading && !updateDownloaded && (
                  <div className="mt-2 p-3 bg-primary/10 border border-primary/20 rounded-md">
                    <p className="text-sm font-medium text-primary mb-2">
                      Доступна новая версия {updateInfo.version}!
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Ваша версия: {version}
                    </p>
                    {updateInfo.releaseNotes && (
                      <div className="text-xs text-muted-foreground mb-3 max-h-32 overflow-y-auto">
                        {typeof updateInfo.releaseNotes === 'string'
                          ? updateInfo.releaseNotes
                          : String(updateInfo.releaseNotes)}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={downloadUpdate}
                        className="flex-1"
                      >
                        Скачать и установить
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(getAppInfo().releaseUrl, '_blank')}
                        className="flex-1"
                      >
                        Скачать вручную
                      </Button>
                    </div>
                  </div>
                )}

                {downloading && !updateDownloaded && (
                  <div className="mt-2 p-3 bg-primary/10 border border-primary/20 rounded-md">
                    <p className="text-sm font-medium text-primary mb-2">
                      ⏳ Загрузка обновления...
                    </p>
                    <div className="w-full bg-muted rounded-full h-2 mb-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      {downloadProgress.toFixed(0)}%
                    </p>
                  </div>
                )}

                {updateDownloaded && (
                  <div className="mt-2 p-3 bg-green-100 border border-green-300 rounded-md dark:bg-green-900/20 dark:border-green-700">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                      ✅ Обновление загружено!
                    </p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Требуется перезапуск приложения
                    </p>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={installUpdate}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      🔄 Перезапустить и установить
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 h-full text-sm">
              <span className="text-xs font-medium">{t('about.server')}</span>
              {isLoading && <p>{t('generic.loading')}</p>}
              {server && !isLoading && (
                <div className="flex gap-2 flex-wrap">
                  <MultiBadge label={t('about.type')}>{server.type}</MultiBadge>
                  <MultiBadge label={t('about.version')}>
                    {server.serverVersion}
                  </MultiBadge>
                  <MultiBadge label={t('about.apiVersion')}>
                    {server.version}
                  </MultiBadge>
                </div>
              )}
            </div>
          </div>

          {/* Функции приложения */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium">✨ Возможности KumaFlow</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start gap-2">
                  <span className="text-xs mt-0.5">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="w-full border-t border-border px-6 py-4 bg-background-foreground">
          <div className="flex justify-end gap-2">
            <a
              className="px-3 py-1.5 rounded-md bg-primary/40 hover:bg-primary/50 text-foreground border border-primary/40 text-sm font-medium flex items-center justify-center transition-colors"
              href={url}
              target="_blank"
              rel="nofollow noreferrer"
            >
              <img src={githubIcon} alt="Github" className="size-4 mr-2" />
              KumaFlow
            </a>
            <a
              className="px-3 py-1.5 rounded-md bg-secondary/40 hover:bg-secondary/50 text-muted-foreground border border-secondary/40 text-sm font-medium flex items-center justify-center transition-colors"
              href={originalUrl}
              target="_blank"
              rel="nofollow noreferrer"
              title="Оригинальный проект Aonsoku"
            >
              <img src={githubIcon} alt="Github" className="size-4 mr-2" />
              Aonsoku (Original)
            </a>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
