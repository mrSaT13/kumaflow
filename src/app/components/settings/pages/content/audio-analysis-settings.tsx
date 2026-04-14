import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Progress } from '@/app/components/ui/progress'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { useBackgroundAudioAnalysis } from '@/app/hooks/use-background-audio-analysis'
import { usePlaybackSettings, usePlaybackActions } from '@/store/playback.store'
import { toast } from 'react-toastify'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { BarChart3, Circle, Activity } from 'lucide-react'

export function AudioAnalysisSettings() {
  const { isAnalyzing, queueLength, analyzedCount, totalInPlaylist } = useBackgroundAudioAnalysis()
  const [analysisEnabled, setAnalysisEnabled] = useState(true)
  const { settings } = usePlaybackSettings()
  const { setProgressBarType, setAutoColorByGenre } = usePlaybackActions()

  const progress = totalInPlaylist > 0 ? Math.round((analyzedCount / totalInPlaylist) * 100) : 0

  const handlePauseAnalysis = () => {
    setAnalysisEnabled(false)
    toast.info('⏸️ Анализ приостановлен. Рекомендации могут стать менее точными.', {
      type: 'warning',
      autoClose: 5000,
    })
  }

  const handleResumeAnalysis = () => {
    setAnalysisEnabled(true)
    toast.success('▶️ Анализ возобновлен')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🎵 Анализ аудио</CardTitle>
        <CardDescription>
          Автоматический анализ BPM, энергии и настроения треков
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Статус анализа */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Статус анализа</Label>
            <div className="text-sm text-muted-foreground">
              {isAnalyzing ? '🔄 Анализирует...' : '⏸️ На паузе'}
            </div>
          </div>

          <Progress value={progress} className="h-2" />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Проанализировано: {analyzedCount} из {totalInPlaylist}</span>
            <span>{progress}%</span>
          </div>

          {queueLength > 0 && (
            <div className="text-xs text-blue-600">
              В очереди: {queueLength} треков
            </div>
          )}
        </div>

        {/* Управление */}
        <div className="flex items-center justify-between">
          <div>
            <Label>Включить анализ</Label>
            <p className="text-sm text-muted-foreground">
              {analysisEnabled 
                ? 'Треки анализируются в фоне' 
                : '⚠️ Рекомендации станут менее точными'}
            </p>
          </div>
          <Switch
            checked={analysisEnabled}
            onCheckedChange={analysisEnabled ? handlePauseAnalysis : handleResumeAnalysis}
          />
        </div>

        {/* Информация */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Анализируются только треки из текущего плейлиста</p>
          <p>• Данные сохраняются в ML Store для улучшения рекомендаций</p>
          <p>• Анализ происходит после запуска трека, не мешает воспроизведению</p>
        </div>
      </CardContent>
    </Card>
  )
}
