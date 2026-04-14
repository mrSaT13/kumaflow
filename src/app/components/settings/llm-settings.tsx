import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useExternalApiStore } from '@/store/external-api.store'
import { llmService } from '@/service/llm-service'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card'
import { Button } from '@/app/components/ui/button'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Badge } from '@/app/components/ui/badge'
import { toast } from 'react-toastify'

export function LLMSettings() {
  const { t } = useTranslation()
  const settings = useExternalApiStore(state => state.settings)
  const { 
    setLlmEnabled, 
    setLlmProvider, 
    setLlmLmStudioUrl,
    setLlmModel,
    setLlmApiKey,
    setLlmQwenApiKey,
    setLlmQwenModel,
    setLlmOllamaUrl,
    setLlmOllamaModel,
    setLlmAllowMLAccess,
    setLlmAllowOrchestratorAccess,
    setLlmAllowPlaylistAccess,
    setLlmAllowPlayerAccess,
    setLlmCustomPrompt,
  } = useExternalApiStore()

  const [testingConnection, setTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleTestConnection = async () => {
    setTestingConnection(true)
    setConnectionStatus('idle')

    llmService.initialize({
      enabled: settings.llmEnabled,
      provider: settings.llmProvider,
      lmStudioUrl: settings.llmLmStudioUrl,
      qwenApiKey: settings.llmQwenApiKey,
      qwenModel: settings.llmQwenModel,
      ollamaUrl: settings.llmOllamaUrl,
      ollamaModel: settings.llmOllamaModel,
      allowMLAccess: settings.llmAllowMLAccess,
      allowOrchestratorAccess: settings.llmAllowOrchestratorAccess,
      allowPlaylistAccess: settings.llmAllowPlaylistAccess,
      allowPlayerAccess: settings.llmAllowPlayerAccess,
      customSystemPrompt: settings.llmCustomPrompt,
    })

    const result = await llmService.testConnection()

    if (result.success) {
      setConnectionStatus('success')
      toast.success('Подключение успешно!')
    } else {
      setConnectionStatus('error')
      toast.error(`Ошибка: ${result.error}`)
    }

    setTestingConnection(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">🧠 LLM Интеграция</CardTitle>
            <CardDescription>
              Умные объяснения и генерация с помощью ИИ
            </CardDescription>
          </div>
          <Switch
            checked={settings.llmEnabled}
            onCheckedChange={setLlmEnabled}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider Selection */}
        <div className="space-y-3">
          <Label>Провайдер</Label>
          <Select
            value={settings.llmProvider}
            onValueChange={(val) => setLlmProvider(val as any)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Выберите провайдера" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lm-studio">💻 LM Studio (локально, бесплатно)</SelectItem>
              <SelectItem value="qwen">☁️ Qwen API (облако, $0.0004/1K)</SelectItem>
              <SelectItem value="ollama">🦙 Ollama (локально, бесплатно)</SelectItem>
              <SelectItem value="none">❌ Отключено</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* LM Studio Settings */}
        {settings.llmProvider === 'lm-studio' && (
          <div className="space-y-3">
            <Label htmlFor="lm-studio-url">LM Studio URL</Label>
            <Input
              id="lm-studio-url"
              value={settings.llmLmStudioUrl}
              onChange={(e) => setLlmLmStudioUrl(e.target.value)}
              placeholder="http://localhost:1234"
            />
            
            <Label htmlFor="lm-studio-model">Модель LM Studio</Label>
            <Input
              id="lm-studio-model"
              value={settings.llmModel || ''}
              onChange={(e) => setLlmModel(e.target.value)}
              placeholder="qwen/qwen3-4b-2507"
            />
            <p className="text-xs text-muted-foreground">
              Пример: qwen/qwen3-4b-2507
            </p>
            
            <Label htmlFor="lm-studio-api-key">API Key (опционально)</Label>
            <Input
              id="lm-studio-api-key"
              type="password"
              value={settings.llmApiKey || ''}
              onChange={(e) => setLlmApiKey(e.target.value)}
              placeholder="Оставь пустым если не требуется"
            />
            <p className="text-xs text-muted-foreground">
              1. Скачай https://lmstudio.ai/<br/>
              2. Установи модель (например qwen3-4b)<br/>
              3. Запусти локальный сервер<br/>
              4. API ключ нужен только если включена аутентификация
            </p>
          </div>
        )}

        {/* Qwen API Settings */}
        {settings.llmProvider === 'qwen' && (
          <>
            <div className="space-y-3">
              <Label htmlFor="qwen-api-key">Qwen API Key</Label>
              <Input
                id="qwen-api-key"
                type="password"
                value={settings.llmQwenApiKey}
                onChange={(e) => setLlmQwenApiKey(e.target.value)}
                placeholder="sk-..."
              />
              <p className="text-xs text-muted-foreground">
                Получи ключ на{' '}
                <a
                  href="https://dashscope.console.aliyun.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  dashscope.console.aliyun.com
                </a>
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="qwen-model">Модель</Label>
              <Input
                id="qwen-model"
                value={settings.llmQwenModel}
                onChange={(e) => setLlmQwenModel(e.target.value)}
                placeholder="qwen-max"
              />
            </div>
          </>
        )}

        {/* Ollama Settings */}
        {settings.llmProvider === 'ollama' && (
          <>
            <div className="space-y-3">
              <Label htmlFor="ollama-url">Ollama URL</Label>
              <Input
                id="ollama-url"
                value={settings.llmOllamaUrl}
                onChange={(e) => setLlmOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            </div>

            <div className="space-y-3">
              <Label htmlFor="ollama-model">Модель</Label>
              <Input
                id="ollama-model"
                value={settings.llmOllamaModel}
                onChange={(e) => setLlmOllamaModel(e.target.value)}
                placeholder="llama3"
              />
              <p className="text-xs text-muted-foreground">
                Установи: ollama pull llama3
              </p>
            </div>
          </>
        )}

        {/* Access Control */}
        <div className="space-y-3 pt-4 border-t">
          <Label>Доступ LLM к данным</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center space-x-2">
              <Switch
                id="ml-access"
                checked={settings.llmAllowMLAccess}
                onCheckedChange={setLlmAllowMLAccess}
              />
              <Label htmlFor="ml-access" className="text-sm">🎵 ML Профиль</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="orchestrator-access"
                checked={settings.llmAllowOrchestratorAccess}
                onCheckedChange={setLlmAllowOrchestratorAccess}
              />
              <Label htmlFor="orchestrator-access" className="text-sm">🔀 Оркестратор</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="playlist-access"
                checked={settings.llmAllowPlaylistAccess}
                onCheckedChange={setLlmAllowPlaylistAccess}
              />
              <Label htmlFor="playlist-access" className="text-sm">📝 Плейлисты</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="player-access"
                checked={settings.llmAllowPlayerAccess}
                onCheckedChange={setLlmAllowPlayerAccess}
              />
              <Label htmlFor="player-access" className="text-sm">▶️ Плеер</Label>
            </div>
          </div>
        </div>

        {/* Custom Prompt */}
        <div className="space-y-3 pt-4 border-t">
          <Label htmlFor="custom-prompt">Системный промт</Label>
          <Textarea
            id="custom-prompt"
            value={settings.llmCustomPrompt || ''}
            onChange={(e) => setLlmCustomPrompt(e.target.value)}
            placeholder="Ты персональный музыкальный рекомендатель Kumaflow..."
            rows={4}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Этот промт будет использоваться для генерации объяснений и плейлистов
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLlmCustomPrompt(
              'Ты персональный музыкальный рекомендатель Kumaflow с ИИ.\n\n' +
              'Твоя задача:\n' +
              '1. Объяснять почему пользователю понравится трек\n' +
              '2. Генерировать персонализированные плейлисты\n' +
              '3. Анализировать музыкальные предпочтения\n\n' +
              'Правила:\n' +
              '- Отвечай кратко (2-3 предложения)\n' +
              '- Используй конкретные факты из профиля\n' +
              '- Учитывай время суток и настроение\n' +
              '- Пиши на русском языке'
            )}
          >
            📋 Предустановленный промт
          </Button>
        </div>

        {/* Test Connection */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button
            onClick={handleTestConnection}
            disabled={testingConnection || settings.llmProvider === 'none'}
            variant="outline"
          >
            {testingConnection ? 'Проверка...' : 'Проверить подключение'}
          </Button>

          {connectionStatus === 'success' && (
            <Badge variant="default" className="bg-green-500">
              ✅ Подключено
            </Badge>
          )}

          {connectionStatus === 'error' && (
            <Badge variant="destructive">
              ❌ Ошибка
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
