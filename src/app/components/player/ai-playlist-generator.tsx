import { useState } from 'react'
import { Sparkles, Loader2, Music } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/app/components/ui/dialog'
import { Label } from '@/app/components/ui/label'
import { Textarea } from '@/app/components/ui/textarea'
import { Input } from '@/app/components/ui/input'
import { useExternalApiStore } from '@/store/external-api.store'
import { llmService } from '@/service/llm-service'
import { toast } from 'react-toastify'
import { usePlayerActions } from '@/store/player.store'

export function AIPlaylistGenerator() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [description, setDescription] = useState('')
  const [trackCount, setTrackCount] = useState(25)
  const settings = useExternalApiStore(state => state.settings)
  const { setSongList } = usePlayerActions()

  const generatePlaylist = async () => {
    if (!settings.llmEnabled) {
      toast.error('LLM отключен. Включите в настройках.')
      return
    }

    setLoading(true)

    // Инициализируем LLM сервис
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

    try {
      // TODO: Вызов API для генерации плейлиста
      // Пока заглушка
      toast.info('Генерация плейлиста... (пока заглушка)')
      
      // В будущем здесь будет вызов:
      // const playlist = await llmService.generatePlaylist(description, trackCount)
      // setSongList(playlist.songs, 0)
      
    } catch (error) {
      console.error('[AI Playlist] Generation failed:', error)
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <>
      {/* Кнопка вызова */}
      <Button
        onClick={() => setOpen(true)}
        className="gap-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
      >
        <Sparkles className="w-4 h-4" />
        AI Плейлист
      </Button>

      {/* Модалка генерации */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-500" />
              <DialogTitle>Генератор AI Плейлистов</DialogTitle>
            </div>
            <DialogDescription>
              Создай персонализированный плейлист с помощью ИИ
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Описание */}
            <div className="space-y-2">
              <Label htmlFor="description">
                Опиши какой плейлист хочешь
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Например: Энергичная музыка для тренировки в стиле Modestep и The Prodigy, BPM 140-160"
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            {/* Количество треков */}
            <div className="space-y-2">
              <Label htmlFor="trackCount">Количество треков</Label>
              <Input
                id="trackCount"
                type="number"
                min={10}
                max={100}
                value={trackCount}
                onChange={(e) => setTrackCount(parseInt(e.target.value) || 25)}
              />
            </div>

            {/* Инфо о провайдере */}
            <div className="p-3 rounded-lg bg-muted text-sm">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4" />
                <span>
                  Провайдер: {settings.llmProvider === 'lm-studio' ? '💻 LM Studio' :
                             settings.llmProvider === 'qwen' ? '☁️ Qwen API' :
                             settings.llmProvider === 'ollama' ? '🦙 Ollama' : '❌ Отключен'}
                </span>
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex gap-2">
              <Button
                onClick={generatePlaylist}
                disabled={loading || !description.trim()}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Сгенерировать
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Отмена
              </Button>
            </div>

            {/* Подсказка */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Примеры запросов:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>"Утренняя энергия: рок и метал, BPM 120-140"</li>
                <li>"Вечерний chillout: электроника, energy 0.3-0.5"</li>
                <li>"Тренировка: drum'n'bass, BPM 170+"</li>
                <li>"Ночная поездка: синтвейв, ретро 80х"</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
