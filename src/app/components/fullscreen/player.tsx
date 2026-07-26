import { CloseFullscreenButton } from './buttons'
import { FullscreenControls, FullscreenLikeButton } from './controls'
import { FullscreenProgress } from './progress'
import { VolumeContainer } from './volume-container'

export function FullscreenPlayer() {
  return (
    <div className="w-full">
      <FullscreenProgress />

      {/* Мобильная раскладка */}
      <div className="mt-3 space-y-2 md:hidden">
        <FullscreenControls compact variant="secondary" />

        <div className="flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <CloseFullscreenButton compact />
          </div>

          <div className="flex min-w-0 flex-1 justify-center">
            <FullscreenControls compact variant="playback" />
          </div>

          <div className="shrink-0">
            <FullscreenLikeButton compact />
          </div>
        </div>
      </div>

      {/* Десктопная раскладка */}
      <div className="mt-5 hidden items-center justify-between gap-4 md:flex">
        <div className="flex w-[200px] items-center justify-start gap-2">
          <CloseFullscreenButton />
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-center gap-1 md:gap-2">
          <FullscreenControls />
        </div>

        <div className="flex w-[200px] items-center justify-end gap-4">
          <VolumeContainer />
        </div>
      </div>
    </div>
  )
}
