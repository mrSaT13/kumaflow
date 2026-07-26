import { getSongStreamUrl } from '@/api/httpClient'
import { usePlayerStore } from '@/store/player.store'

let preloadEl: HTMLAudioElement | null = null
let preloadedId: string | null = null

export function preloadNextMyWaveTrack(): void {
  const { isMyWaveActive } = usePlayerStore.getState().playerState
  if (!isMyWaveActive) {
    preloadedId = null
    return
  }

  const { currentList, currentSongIndex } = usePlayerStore.getState().songlist
  const next = currentList[currentSongIndex + 1]
  if (!next?.id || next.isLocal) return
  if (next.id === preloadedId) return

  if (!preloadEl) {
    preloadEl = document.createElement('audio')
    preloadEl.preload = 'auto'
    preloadEl.setAttribute('aria-hidden', 'true')
    preloadEl.style.display = 'none'
    document.body.appendChild(preloadEl)
  }

  preloadedId = next.id
  preloadEl.src = getSongStreamUrl(next.id)
  preloadEl.load()
}

export function clearMyWavePreload(): void {
  preloadedId = null
  if (preloadEl) {
    preloadEl.removeAttribute('src')
    preloadEl.load()
  }
}
