/**
 * Утилита для парсинга артистов из строки
 * 
 * Проблема: Сервер отдаёт треки в "сыром" виде:
 * - artist: "Исполнитель1/Исполнитель2/Исполнитель3"
 * - title: "Исполнитель1/Исполнитель2 - Название трека"
 * 
 * Решение: Парсим строку и извлекаем массив артистов
 */

export interface ParsedArtists {
  artists: string[]        // Список всех артистов
  isCollab: boolean        // Это совместный трек?
  mainArtist: string       // Основной артист (первый)
}

/**
 * Разделить строку артистов на массив
 * Поддерживаемые разделители: /, &, x, ×, ,, feat., featuring, ft., +
 */
export function parseArtistsFromString(raw: string): ParsedArtists {
  if (!raw || raw.trim() === '') {
    return { artists: [], isCollab: false, mainArtist: '' }
  }

  const trimmed = raw.trim()

  // Разделители артистов (порядок важен - сначала более специфичные)
  const separators = [
    /\s+(?:feat\.?|featuring|ft\.)\s+/i,  // "feat.", "featuring", "ft."
    /\s*[/&×+]\s*/,                         // "/", "&", "×", "+"
    /\s*,\s*/,                              // ","
    /\s+x\s+/i,                            // " x " (коллаборация)
  ]

  let artists: string[] = [trimmed]

  // Пробуем каждый разделитель
  for (const separator of separators) {
    const parts = trimmed.split(separator).map(a => a.trim()).filter(Boolean)
    if (parts.length > 1) {
      artists = parts
      break
    }
  }

  // Очищаем имена артистов от лишних символов
  artists = artists.map(artist => 
    artist
      .replace(/^\s*[-–—]\s*/, '')  // Убираем тире в начале
      .replace(/\s*[-–—]\s*$/, '')  // Убираем тире в конце
      .trim()
  ).filter(Boolean)

  return {
    artists,
    isCollab: artists.length > 1,
    mainArtist: artists[0] || '',
  }
}

/**
 * Проверить является ли трек совместным
 */
export function isCollaboration(artistString?: string): boolean {
  if (!artistString) return false
  return parseArtistsFromString(artistString).isCollab
}

/**
 * Получить ID артиста из названия (для поиска в базе)
 * Нормализует имя для сравнения
 */
export function normalizeArtistName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\sа-яё]/gi, '')  // Убираем спецсимволы
    .replace(/\s+/g, ' ')           // Нормализуем пробелы
    .trim()
}

/**
 * Сравнить два имени артиста (с учётом нормализации)
 */
export function artistsMatch(name1: string, name2: string): boolean {
  return normalizeArtistName(name1) === normalizeArtistName(name2)
}
