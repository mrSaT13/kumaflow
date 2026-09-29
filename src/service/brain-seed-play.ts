/**
 * KumaFlow 1.6.6 — Brain seed-радио (W4).
 * POST /api/wave/seed → резолв external_id → играем.
 * Недоступно/пусто → false, вызыватель откатывается на локальное радио.
 */

import { toast } from 'react-toastify'
import { isBrainActive } from '@/store/brain.store'
import { usePlayerStore } from '@/store/player.store'
import { subsonic } from '@/service/subsonic'
import {
  resolveSeedExternalIds,
  waveSeedStart,
} from '@/service/brain-wave'
import type { ISong } from '@/types/responses/song'

export function notifySeedChanged(): void {
  try {
    window.dispatchEvent(new Event('kfbrain-seed-changed'))
  } catch {
    /* ignore */
  }
}

/**
 * Старт радио с мозга по артисту или треку.
 * @param kind 'artist' | 'track'
 * @param ref имя артиста (artist) или song.id Navidrome (track)
 * @returns true = играет волна с мозга; false = откат на локалку
 */
export async function playBrainSeedRadio(
  kind: 'artist' | 'track',
  ref: string,
): Promise<boolean> {
  if (!isBrainActive() || !ref.trim()) return false
  try {
    const started = await waveSeedStart(kind, ref.trim())
    if (!started || started.trackIds.length === 0) return false
    const externalIds = await resolveSeedExternalIds(started.trackIds)
    if (externalIds.length === 0) return false
    const loaded = await Promise.all(
      externalIds.map((id) => subsonic.songs.getSong(id).catch(() => null)),
    )
    const songs = loaded.filter((s): s is ISong => !!s)
    if (songs.length === 0) return false
    usePlayerStore.getState().actions.setSongList(songs, 0)
    notifySeedChanged()
    const label = started.seed?.label || ref.trim()
    toast.success(`📻 Волна по ${label} — ${songs.length}`, { autoClose: 2500 })
    return true
  } catch {
    return false
  }
}
