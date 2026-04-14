import { useState } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { useExternalApiStore } from '@/store/external-api.store'
import { llmService } from '@/service/llm-service'
import type { ISong } from '@/types/responses/song'
import type { MLProfile, TrackRating } from '@/store/ml.store'

interface LLMExplanationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  track: ISong
  profile: MLProfile
  ratings: Record<string, TrackRating>
  timeAdaptivityEnabled?: boolean
}

export function LLMExplanationModal({
  open,
  onOpenChange,
  track,
  profile,
  ratings,
  timeAdaptivityEnabled,
}: LLMExplanationModalProps) {
  const [loading, setLoading] = useState(false)
  const [explanation, setExplanation] = useState<string | null>(null)
  const settings = useExternalApiStore(state => state.settings)

  const generateExplanation = async () => {
    if (!settings.llmEnabled) {
      setExplanation('LLM отключен. Включите в настройках.')
      return
    }

    setLoading(true)
    setExplanation(null)

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
      const result = await llmService.generateExplanation(
        track,
        profile,
        ratings,
        timeAdaptivityEnabled
      )

      if (result) {
        setExplanation(result.text)
      } else {
        setExplanation('Не удалось сгенерировать объяснение. Проверьте подключение.')
      }
    } catch (error) {
      console.error('[LLM] Explanation failed:', error)
      setExplanation(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Кнопка вызова */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onOpenChange(true)
          generateExplanation()
        }}
        className="gap-2"
      >
        <Sparkles className="w-4 h-4 text-purple-500" />
        Почему рекомендовано? (ИИ)
      </Button>

      {/* Модалка с объяснением */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Объяснение ИИ
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Трек */}
            <div className="p-3 rounded-lg bg-muted">
              <div className="font-medium">{track.title}</div>
              <div className="text-sm text-muted-foreground">{track.artist}</div>
            </div>

            {/* Объяснение */}
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Генерирую объяснение...
              </div>
            ) : explanation ? (
              <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 border border-purple-200 dark:border-purple-800">
                <p className="text-sm leading-relaxed">{explanation}</p>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">
                Нажмите кнопку ниже чтобы сгенерировать объяснение
              </div>
            )}

            {/* Кнопка повторной генерации */}
            {!loading && (
              <Button
                onClick={generateExplanation}
                variant="outline"
                className="w-full gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Сгенерировать заново
              </Button>
            )}

            {/* Инфо */}
            <div className="text-xs text-muted-foreground">
              Провайдер: {settings.llmProvider === 'lm-studio' ? '💻 LM Studio' :
                         settings.llmProvider === 'qwen' ? '☁️ Qwen API' :
                         settings.llmProvider === 'ollama' ? '🦙 Ollama' : '❌ Отключен'}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
