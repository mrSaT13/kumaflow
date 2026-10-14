/**
 * Разбор строки исполнителей — порт мобилки (multi_artist_widget.dart):
 * Navidrome склеивает совместки в одну строку "A/B", "A, B", "A feat. B".
 */

export interface ResolvedArtist {
  id: string
  name: string
  coverArt?: string
}

const ARTIST_SPLIT_RE = /\s*[/,;]\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s+&\s+|\s+×\s+/i

export function splitArtistString(raw: string): string[] {
  const parts = raw
    .split(ARTIST_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  // Не дробим "AC/DC": эвристика мобилки против кусков короче 2 символов.
  if (parts.length > 1 && parts.some((p) => p.length < 2)) return [raw.trim()]
  return parts.length > 0 ? parts : [raw.trim()]
}

/**
 * Исполнители трека единым списком:
 * - есть song.artists → раскрываем записи с сепараторами внутри имени;
 * - иначе делим song.artist; id отдаём только первому при точном совпадении;
 * - пусто → один пункт по artistId.
 */
export function resolveSongArtists(song: {
  artists?: { id: string; name: string; coverArt?: string }[] | null
  artist?: string | null
  artistId?: string | null
}): ResolvedArtist[] {
  const { artists, artist, artistId } = song

  if (artists && artists.length > 0) {
    const out: ResolvedArtist[] = []
    for (const a of artists) {
      const parts = splitArtistString(a.name ?? '')
      if (parts.length > 1) {
        for (const p of parts) out.push({ id: '', name: p })
      } else {
        out.push({ id: a.id ?? '', name: a.name ?? '', coverArt: a.coverArt })
      }
    }
    return out.filter((a) => a.name || a.id)
  }

  const name = (artist ?? '').trim()
  if (name) {
    const parts = splitArtistString(name)
    if (parts.length > 1) {
      return parts.map((n, i) => ({
        // id — только первой части, остальные ищутся по имени при тапе.
        id: i === 0 ? (artistId ?? '') : '',
        name: n,
      }))
    }
    return [{ id: artistId ?? '', name }]
  }

  if (artistId) return [{ id: artistId, name: '' }]
  return []
}
