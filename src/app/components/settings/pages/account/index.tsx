import { AvatarSettings } from './avatar'
import { DualUrlSettings } from './dual-url'

export function Account() {
  return (
    <div className="space-y-4">
      <AvatarSettings />
      <DualUrlSettings />
    </div>
  )
}
