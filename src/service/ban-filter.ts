/**
 * Единая проверка бана артиста (десктоп).
 *
 * Формат записей в profile.bannedArtists:
 *  - голый ID Navidrome ("abc123...") — исторические записи бана из плеера;
 *  - "name:<имя>" — имена, подтянутые с мозга (sync-to-mobile) или
 *    зарезолвленные локально. Префикс нужен, чтобы не путать ID с именами.
 *
 * Семантика строго аддитивна к старой:
 *  - совпадение по ID — как раньше;
 *  - старая ветка "нет artistId → includes по имени" — сохранена как была;
 *  - сверху: именные записи проверяются всегда (а не только без artistId).
 */
export const BAN_NAME_PREFIX = 'name:'

export function banDisplayName(entry: string): string {
  const b = (entry ?? '').trim()
  return b.startsWith(BAN_NAME_PREFIX) ? b.slice(BAN_NAME_PREFIX.length).trim() : b
}

export function isArtistBanned(
  artistId: string | undefined | null,
  artistName: string | undefined | null,
  banned: string[] | undefined | null,
): boolean {
  if (!banned || banned.length === 0) return false
  const id = (artistId ?? '').trim()
  const nm = (artistName ?? '').trim().toLowerCase()
  if (!id && !nm) return false
  for (const raw of banned) {
    const b = (raw ?? '').trim()
    if (!b) continue
    if (b.startsWith(BAN_NAME_PREFIX)) {
      const n = b.slice(BAN_NAME_PREFIX.length).trim().toLowerCase()
      if (!n || !nm) continue
      if (nm === n || nm.includes(n) || n.includes(nm)) return true
      continue
    }
    // голая запись: ID (или старое имя) — точное совпадение как раньше
    if (id && b === id) return true
    if (nm && b.toLowerCase() === nm) return true
    // legacy-ветка: у трека нет artistId — подстрока, как было
    if (!id && nm && nm.includes(b.toLowerCase())) return true
  }
  return false
}
