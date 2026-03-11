import { useState } from 'react'
import { useAudiobookshelf } from '@/store/audiobookshelf.store'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Input } from '@/app/components/ui/input'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { toast } from 'react-toastify'

export default function AudiobookshelfSettings() {
  const { config, setEnabled, setUrl, setApiKey, setConnected, testConnection, resetConfig } = useAudiobookshelf()
  
  const [urlInput, setUrlInput] = useState(config.url)
  const [apiKeyInput, setApiKeyInput] = useState(config.apiKey)
  const [isTesting, setIsTesting] = useState(false)

  const handleTestConnection = async () => {
    setIsTesting(true)
    setUrl(urlInput)
    setApiKey(apiKeyInput)
    
    const success = await testConnection()
    
    if (success) {
      toast('✅ Подключение к Audiobookshelf успешно!', { type: 'success' })
      setEnabled(true)
    } else {
      toast('❌ Не удалось подключиться к Audiobookshelf', { type: 'error' })
      setEnabled(false)
    }
    
    setIsTesting(false)
  }

  const handleSave = () => {
    setUrl(urlInput)
    setApiKey(apiKeyInput)
    toast('⚙️ Настройки сохранены', { type: 'success' })
  }

  const handleReset = () => {
    resetConfig()
    setUrlInput('')
    setApiKeyInput('')
    toast('⚙️ Настройки сброшены', { type: 'info' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>📚 Audiobookshelf</CardTitle>
        <CardDescription>
          Интеграция с сервером Audiobookshelf для аудиокниг
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Переключатель */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Включить Audiobookshelf</Label>
            <p className="text-sm text-muted-foreground">
              Синхронизация с вашим сервером Audiobookshelf
            </p>
          </div>
          <Switch
            checked={config.enabled && config.isConnected}
            onCheckedChange={setEnabled}
            disabled={!config.isConnected}
          />
        </div>

        {/* URL сервера */}
        <div className="space-y-2">
          <Label htmlFor="abs-url">URL сервера</Label>
          <Input
            id="abs-url"
            type="url"
            placeholder="http://localhost:13378"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Например: http://localhost:13378 или https://audiobooks.example.com
          </p>
        </div>

        {/* API ключ */}
        <div className="space-y-2">
          <Label htmlFor="abs-apikey">API ключ</Label>
          <Input
            id="abs-apikey"
            type="password"
            placeholder="Введите API ключ"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Создайте API ключ в настройках Audiobookshelf
          </p>
        </div>

        {/* Кнопки */}
        <div className="flex gap-2">
          <Button 
            onClick={handleTestConnection} 
            variant="secondary"
            disabled={isTesting || !urlInput || !apiKeyInput}
            className="flex-1"
          >
            {isTesting ? '⏳ Проверка...' : '🔌 Проверить подключение'}
          </Button>
          
          <Button 
            onClick={handleSave} 
            variant="secondary"
            className="flex-1"
          >
            💾 Сохранить
          </Button>
        </div>

        {/* Статус подключения */}
        {config.isConnected && (
          <div className="text-sm text-green-600 flex items-center gap-2">
            ✅ <span>Подключено к {config.url}</span>
          </div>
        )}

        {!config.isConnected && (config.url || config.apiKey) && (
          <div className="text-sm text-orange-600 flex items-center gap-2">
            ⚠️ <span>Не подключено. Проверьте настройки.</span>
          </div>
        )}

        {/* Кнопка сброса */}
        <div className="pt-4 border-t">
          <Button onClick={handleReset} variant="outline" className="w-full">
            🔄 Сбросить настройки
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
