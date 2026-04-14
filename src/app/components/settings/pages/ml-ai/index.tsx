/**
 * ML / ИИ — ML плейлисты, MAB, LLM, анализ, праздники
 */

import { MLPlaylistsContent } from '@/app/components/settings/pages/content/ml-playlists'
import { LLMSettings } from '@/app/components/settings/llm-settings'
import { HolidayPlaylistsSettings } from '@/app/components/settings/holiday-playlists'
import { AudioAnalysisSettings } from '@/app/components/settings/pages/content/audio-analysis-settings'
import { Separator } from '@/app/components/ui/separator'

export function MLIIntelligence() {
  return (
    <div className="space-y-6">
      {/* ML Плейлисты */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🧠 ML Плейлисты</h3>
        <MLPlaylistsContent />
      </div>

      <Separator />

      {/* Анализ библиотеки */}
      <div>
        <h3 className="text-lg font-semibold mb-3">📊 Анализ библиотеки</h3>
        <AudioAnalysisSettings />
      </div>

      <Separator />

      {/* LLM */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🤖 LLM (ИИ-координатор)</h3>
        <LLMSettings />
      </div>

      <Separator />

      {/* Праздничные плейлисты */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🎄 Праздничные плейлисты</h3>
        <HolidayPlaylistsSettings />
      </div>
    </div>
  )
}
