export const MY_WAVE_PLAYLIST_NAME = 'Моя волна'

export const MY_WAVE_LOOKAHEAD = 5

export function isMyWavePlaylistName(name?: string): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return n.includes('моя волна') || n.includes('mywave') || n.includes('my wave')
}
