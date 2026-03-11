// Карта цветов для жанров
export const GENRE_COLORS: Record<string, string> = {
  // Красные оттенки
  'Рок': '#ef4444',
  'Metal': '#dc2626',
  'Hard Rock': '#b91c1c',
  'Punk': '#991b1b',
  
  // Оранжевые оттенки
  'Поп': '#f97316',
  'Dance': '#ea580c',
  'Disco': '#c2410c',
  
  // Желтые оттенки
  'Электронная': '#eab308',
  'EDM': '#ca8a04',
  'Techno': '#a16207',
  'House': '#854d0e',
  
  // Зеленые оттенки
  'Хип-хоп': '#22c55e',
  'Rap': '#16a34a',
  'Trap': '#15803d',
  'R&B': '#14532d',
  
  // Голубые оттенки
  'Джаз': '#06b6d4',
  'Blues': '#0891b2',
  'Soul': '#0e7490',
  'Funk': '#155e75',
  
  // Синие оттенки
  'Классика': '#3b82f6',
  'Classical': '#2563eb',
  'Opera': '#1d4ed8',
  'Instrumental': '#1e40af',
  
  // Фиолетовые оттенки
  'Инди': '#a855f7',
  'Alternative': '#9333ea',
  'Grunge': '#7e22ce',
  'Indie': '#6b21a8',
  
  // Розовые оттенки
  'K-Pop': '#ec4899',
  'J-Pop': '#db2777',
  'Pop Rock': '#be185d',
  
  // Бирюзовые оттенки
  'Регги': '#14b8a6',
  'Ska': '#0d9488',
  'Dub': '#0f766e',
  
  // Спокойные оттенки
  'Амбиент': '#64748b',
  'Chillout': '#475569',
  'Lounge': '#334155',
  'Downtempo': '#1e293b',
  
  // Кантри и Фолк
  'Кантри': '#84cc16',
  'Фолк': '#65a30d',
  'Bluegrass': '#4d7c0f',
  'Celtic': '#3f6212',
  
  // Латина
  'Латина': '#f43f5e',
  'Salsa': '#e11d48',
  'Bachata': '#be123c',
  'Reggaeton': '#9f1239',
  
  // Новые жанры
  'Lo-Fi': '#fbbf24',
  'Synthwave': '#f472b6',
  'Vaporwave': '#c084fc',
  'Post-Rock': '#6366f1',
  'Shoegaze': '#818cf8',
  'Dream Pop': '#a78bfa',
}

/**
 * Получить цвет для жанра
 */
export function getGenreColor(genre: string): string {
  // Прямое совпадение
  if (GENRE_COLORS[genre]) {
    return GENRE_COLORS[genre]
  }
  
  // Поиск по частичному совпадению (case-insensitive)
  const genreLower = genre.toLowerCase()
  for (const [key, color] of Object.entries(GENRE_COLORS)) {
    if (key.toLowerCase().includes(genreLower) || genreLower.includes(key.toLowerCase())) {
      return color
    }
  }
  
  // Цвет по умолчанию (градиент серый)
  return '#64748b'
}

/**
 * Получить градиент на основе списка жанров
 */
export function generateGradientFromGenres(genres: string[], weights: Record<string, number> = {}): string {
  if (genres.length === 0) {
    return 'from-yellow-400 via-orange-400 to-pink-500'
  }

  // Сортируем жанры по весу (если есть) или берем первые
  const sortedGenres = genres.sort((a, b) => {
    const weightA = weights[a] || 0
    const weightB = weights[b] || 0
    return weightB - weightA
  }).slice(0, 3) // Берем топ 3 жанра

  // Получаем цвета для жанров
  const colors = sortedGenres.map(genre => getGenreColor(genre).replace('#', ''))

  // Генерируем Tailwind классы для градиента
  if (colors.length === 1) {
    return `from-${colors[0]} via-${colors[0]} to-${colors[0]}`
  } else if (colors.length === 2) {
    return `from-${colors[0]} via-${colors[1]} to-${colors[0]}`
  } else {
    return `from-${colors[0]} via-${colors[1]} to-${colors[2]}`
  }
}

/**
 * Получить CSS градиент для inline стилей
 */
export function generateCSSGradient(genres: string[], weights: Record<string, number> = {}): string {
  if (genres.length === 0) {
    return 'linear-gradient(135deg, #fbbf24 0%, #f97316 50%, #ec4899 100%)'
  }

  const sortedGenres = genres.sort((a, b) => {
    const weightA = weights[a] || 0
    const weightB = weights[b] || 0
    return weightB - weightA
  }).slice(0, 3)

  const colors = sortedGenres.map(genre => getGenreColor(genre))

  if (colors.length === 1) {
    return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[0]}50 100%)`
  } else if (colors.length === 2) {
    return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[0]} 100%)`
  } else {
    return `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`
  }
}
