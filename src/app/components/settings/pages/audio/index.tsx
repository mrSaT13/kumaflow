import { LyricsSettings } from './lyrics'
import { ReplayGainConfig } from './replay-gain'
import { ProgressBarSettings } from './progress-bar'

export function Audio() {
  return (
    <div className="space-y-4">
      <ProgressBarSettings />
      <ReplayGainConfig />
      <LyricsSettings />
    </div>
  )
}
