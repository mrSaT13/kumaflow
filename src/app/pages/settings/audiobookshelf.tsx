import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Input } from '@/app/components/ui/input'
import { Stack } from '@/shared/components/stack/stack'

export default function AudiobookshelfSettings() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  const handleConnect = () => {
    // TODO: Подключение к Audiobookshelf API
    console.log('Connecting to:', serverUrl, username)
    setIsConnected(true)
    alert('Подключено к Audiobookshelf!')
  }

  const handleDisconnect = () => {
    setEnabled(false)
    setIsConnected(false)
    setServerUrl('')
    setUsername('')
    setPassword('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Audiobookshelf</h2>
        <p className="text-muted-foreground">
          Интеграция с сервером аудиокниг Audiobookshelf
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Подключение к Audiobookshelf</CardTitle>
          <CardDescription>
            Настройте подключение к вашему серверу Audiobookshelf
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Включить Audiobookshelf</div>
              <div className="text-sm text-muted-foreground">
                Отображать вкладку "Книги" в боковой панели
              </div>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={isConnected}
            />
          </div>

          {!isConnected ? (
            <Stack gap="4" className="pt-4">
              <div className="space-y-2">
                <Label htmlFor="server-url">URL сервера</Label>
                <Input
                  id="server-url"
                  placeholder="https://audiobookshelf.example.com"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Логин</Label>
                <Input
                  id="username"
                  placeholder="your-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button 
                onClick={handleConnect}
                disabled={!serverUrl || !username}
                className="w-full"
              >
                🔗 Подключиться
              </Button>

              <div className="text-xs text-muted-foreground">
                <p>Примеры URL:</p>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>https://audiobookshelf.example.com</li>
                  <li>http://192.168.1.100:13378</li>
                  <li>https://ab.your-domain.com</li>
                </ul>
              </div>
            </Stack>
          ) : (
            <div className="space-y-4 pt-4">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✅</span>
                  <div>
                    <p className="font-medium text-green-600">Подключено</p>
                    <p className="text-sm text-muted-foreground">{serverUrl}</p>
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleDisconnect}
                variant="destructive"
                className="w-full"
              >
                🚫 Отключиться
              </Button>

              <Button 
                onClick={() => window.location.hash = '/audiobooks'}
                className="w-full"
              >
                📚 Открыть библиотеку книг
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>О Audiobookshelf</CardTitle>
          <CardDescription>
            Информация об интеграции
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            <strong className="text-foreground">Audiobookshelf</strong> — это 
            самохостируемый сервер для аудиокниг и подкастов с открытым исходным кодом.
          </p>
          <ul className="list-disc list-inside ml-2 text-muted-foreground">
            <li>Автоматическое сохранение прогресса</li>
            <li>Поддержка нескольких пользователей</li>
            <li>Синхронизация между устройствами</li>
            <li>Поддержка форматов: MP3, M4B, FLAC и др.</li>
          </ul>
          <div className="pt-2">
            <a 
              href="https://github.com/advplyr/audiobookshelf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              📖 Узнать больше на GitHub
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
