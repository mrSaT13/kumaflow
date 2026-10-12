import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { Separator } from '@/app/components/ui/separator'
import { toast } from 'react-toastify'
import { RefreshCw, ExternalLink, Download, CheckCircle2, AlertCircle, Github } from 'lucide-react'
import { getAppInfo } from '@/utils/appName'

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest'; latest: string }
  | { status: 'available'; latest: string; notes: string; htmlUrl: string }
  | { status: 'error'; message: string }

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

// Что нового в текущей версии — коротко, подробности в CHANGES.md / GitHub Releases
const WHATS_NEW_1_7_2 = [
  '🔑 Remote больше не просит пароль Navidrome — берётся из текущего аккаунта',
  '🎨 Новый вид Remote-страницы: обложка с управлением поверх, очередь-шторка',
  '📲 PWA: иконка во вкладке, установка как приложение',
  '🔒 PIN-код задаётся в плеере: секция в настройках Remote Control',
  '📱 QR и ссылка не пропадают после перезапуска',
  '🔢 Версия в загрузочном окне берётся из package.json (1.7.2)',
]

export function AboutSettings() {
  const { name, version, url, releaseUrl, description } = getAppInfo()
  const [state, setState] = useState<CheckState>({ status: 'idle' })

  const checkForUpdates = async () => {
    setState({ status: 'checking' })
    try {
      // 1) Пробуем встроенный механизм Electron (работает в собранном приложении)
      try {
        const api = (window as any)?.api
        if (api?.checkForUpdates) {
          const result = await api.checkForUpdates()
          const ver = result?.updateInfo?.version
          if (ver && compareVersions(ver, version) > 0) {
            setState({
              status: 'available',
              latest: ver,
              notes: typeof result.updateInfo?.releaseNotes === 'string' ? result.updateInfo.releaseNotes : '',
              htmlUrl: releaseUrl,
            })
            toast.success(`Доступна новая версия ${ver}!`, { autoClose: 4000 })
            return
          }
          if (result && !result.devMode && !result.error && result.updateInfo) {
            // апдейтер ответил, но версия не новее — всё равно сверимся с GitHub ниже
          }
        }
      } catch {
        // игнорируем и идём к GitHub API
      }

      // 2) Прямая проверка GitHub Releases (работает и в dev, и в браузере)
      const repoPath = new URL(url).pathname.replace(/^\//, '').replace(/\/$/, '')
      const res = await fetch(`https://api.github.com/repos/${repoPath}/releases/latest`)
      if (!res.ok) throw new Error(`GitHub API: ${res.status}`)
      const data = await res.json()
      const latest = String(data.tag_name || data.name || '').replace(/^v/, '')

      if (!latest) throw new Error('Не удалось определить версию релиза')

      if (compareVersions(latest, version) > 0) {
        setState({
          status: 'available',
          latest,
          notes: String(data.body || '').slice(0, 2000),
          htmlUrl: data.html_url || releaseUrl,
        })
        toast.success(`Доступна новая версия ${latest}!`, { autoClose: 4000 })
      } else {
        setState({ status: 'latest', latest })
        toast.info('Установлена последняя версия', { autoClose: 3000 })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка проверки обновлений'
      setState({ status: 'error', message })
      toast.error(message, { autoClose: 4000 })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          ℹ️ О программе
        </CardTitle>
        <CardDescription>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Версия */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{name}</span>
          <Badge variant="outline" className="font-mono">v{version}</Badge>
        </div>

        <Separator />

        {/* GitHub */}
        <div className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <Github className="w-4 h-4" />
            Репозиторий
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => window.open(url, '_blank')}>
              <Github className="w-4 h-4 mr-1" />
              GitHub
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(releaseUrl, '_blank')}>
              <Download className="w-4 h-4 mr-1" />
              Релизы
              <ExternalLink className="w-3 h-3 ml-1" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground break-all">{url}</p>
        </div>

        <Separator />

        {/* Что нового */}
        <div className="space-y-2">
          <div className="text-sm font-medium">✨ Что нового в v{version}</div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {WHATS_NEW_1_7_2.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => window.open(`${url}/blob/main/CHANGES.md`, '_blank')}
          >
            Полный список изменений (CHANGES.md)
            <ExternalLink className="w-3 h-3 ml-1" />
          </Button>
        </div>

        <Separator />

        {/* Проверка обновлений */}
        <div className="space-y-3">
          <div className="text-sm font-medium">🔄 Обновления</div>
          <Button
            variant="default"
            size="sm"
            onClick={checkForUpdates}
            disabled={state.status === 'checking'}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${state.status === 'checking' ? 'animate-spin' : ''}`} />
            {state.status === 'checking' ? 'Проверка...' : 'Проверить обновления сейчас'}
          </Button>

          {state.status === 'latest' && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-sm">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span>Установлена последняя версия (v{version})</span>
            </div>
          )}

          {state.status === 'available' && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-md space-y-2">
              <p className="text-sm font-medium text-primary">
                Доступна новая версия {state.latest}!
              </p>
              <p className="text-xs text-muted-foreground">Ваша версия: v{version}</p>
              {state.notes && (
                <pre className="text-xs text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap font-sans">
                  {state.notes}
                </pre>
              )}
              <div className="flex gap-2">
                <Button variant="default" size="sm" onClick={() => window.open(state.htmlUrl, '_blank')}>
                  <Download className="w-4 h-4 mr-1" />
                  Скачать с GitHub
                </Button>
              </div>
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm">
              <AlertCircle className="w-5 h-5 text-destructive" />
              <span>{state.message}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Проверка выполняется через GitHub Releases репозитория.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
