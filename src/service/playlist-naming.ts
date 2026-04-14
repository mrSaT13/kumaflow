/**
 * Playlist Naming — Умная генерация названий плейлистов
 * 
 * Принцип: Шаблоны + Данные + Эмоции
 * Как в Яндекс Музыке — названия кажутся уникальными, но строятся по шаблонам
 */

// ============================================================
// БАЗА ШАБЛОНОВ
// ============================================================

const TEMPLATES = {
  // Персональные миксы
  dailyMix: [
    "Твой {genre} микс",
    "{genre} для души",
    "{genre} vibes",
    "Заряд {genre}",
    "Погружение в {genre}",
    "{genre} на каждый день",
    "Микс: {genre} & {genre2}",
    "Топ {genre} сегодня",
    "{genre} волна",
    "Лайтовый {genre}",
  ],

  // Моя Волна (сессионные)
  myWave: [
    "Моя волна #{number}",
    "Волна #{number}: {mood}",
    "{mood} настроение",
    "Поток #{number}",
    "Вайб #{number}: {genre}",
    "На одной волне #{number}",
    "{timeOfDay} серфинг",
    "Звуковая волна",
    "Микс настроения",
    "Твоя волна #{number}",
  ],

  // Discover Weekly
  discoverWeekly: [
    "Открытия недели #{week}",
    "Новые горизонты #{week}",
    "Неделя открытий #{week}",
    "Найденное #{week}",
    "Свежий взгляд #{week}",
    "Территория нового #{week}",
    "Неизведанное #{week}",
    "Первооткрыватель #{week}",
    "Новые грани #{week}",
    "Исследование #{week}",
  ],

  // Mood Mix
  moodMix: [
    "{mood} настроение",
    "Для {mood} момента",
    "{mood} vibes",
    "Атмосфера: {mood}",
    "Звуки {mood}",
    "{mood} заряд",
    "В ритме {mood}",
    "{mood} палитра",
    "Настроение: {mood}",
    "{mood} коллекция",
  ],

  // Time Mix
  timeMix: [
    "{timeOfDay} {genre}",
    "{timeOfDay} vibes",
    "Утро с {genre}",
    "Вечерний {genre}",
    "Ночной {genre}",
    "Дневной {genre}",
    "{timeOfDay} микс",
    "Завтрак с {genre}",
    "Полночь и {genre}",
    "{timeOfDay} истории",
  ],

  // Rediscovery
  rediscovery: [
    "Забытые сокровища",
    "Ты это слушал, но забыл",
    "Возвращение легенды",
    "Из архива",
    "Давно не слышал",
    "Ностальгия",
    "Пыльные пластинки",
    "Стые знакомые",
    "Вспомнить всё",
    "Хорошо забытое",
  ],

  // Energy/Activity
  energy: [
    "Энергия: {energyLevel}",
    "{energyLevel} режим",
    "Разгон #{number}",
    "Скорость: {energyLevel}",
    "Пульс #{number}",
    "Драйв #{number}",
    "Мощность: {energyLevel}",
    "Ритм #{number}",
    "Темп: {energyLevel}",
    "Заряд #{number}",
  ],

  // ML Recommendations
  mlrecommendations: [
    "Рекомендации для тебя",
    "ML подобрал #{number}",
    "Умный микс #{number}",
    "ИИ рекомендует",
    "Алгоритм вкуса",
    "Твой AI-микс",
    "Умная подборка",
    "Машинное обучение",
    "Нейро-микс #{number}",
    "AI нашёл для тебя",
  ],

  // Because You Listened
  becauseyoulistened: [
    "Потому что ты слушал",
    "На основе истории",
    "Твои корни #{number}",
    "Из глубины",
    "Звуковая память",
    "След музыки",
    "Музыкальный ДНК",
    "Твои следы #{number}",
    "История в звуках",
    "Зеркало вкуса",
  ],

  // Time of Day
  timeofday: [
    "{timeOfDay} {genre}",
    "{timeOfDay} vibes",
    "Утро с {genre}",
    "Вечерний {genre}",
    "Ночной {genre}",
    "Дневной {genre}",
    "{timeOfDay} микс",
    "Завтрак с {genre}",
    "Полночь и {genre}",
    "{timeOfDay} истории",
  ],

  // Vibe Similarity
  vibesimilarity: [
    "Похожий вайб #{number}",
    "Vibe #{number}",
    "На одной частоте",
    "Звуковой двойник",
    "Похожая энергия",
    "В резонансе",
    "Отражение звука",
    "Параллельные миры",
    "Эхо #{number}",
    "Созвучие",
  ],
} as const

// ============================================================
// ЭМОЦИОНАЛЬНЫЕ МЕТКИ
// ============================================================

const MOOD_LABELS: Record<string, string[]> = {
  calm: ["Спокойствие", "Умиротворение", "Тишина", "Дзен", "Покой", "Нежность"],
  energetic: ["Энергия", "Драйв", "Огонь", "Мощь", "Заряд", "Импульс"],
  happy: ["Радость", "Счастье", "Позитив", "Солнце", "Улыбка", "Лёгкость"],
  sad: ["Грусть", "Меланхолия", "Ностальгия", "Осенние мысли", "Дождь"],
  focused: ["Фокус", "Концентрация", "Поток", "Ясность", "Глубина"],
  romantic: ["Романтика", "Любовь", "Страсть", "Нежность", "Близость"],
  chill: ["Чилл", "Расслабон", "Лаунж", "Вайб", "Атмосфера"],
  workout: ["Тренировка", "Кардио", "Сила", "Выносливость", "Мощь"],
}

const ENERGY_LABELS = ["Лайт", "Средне", "Бодро", "Мощно", "Огонь"]

const TIME_OF_DAY = {
  morning: ["Утро", "Рассвет", "Кофе", "Пробуждение", "Начало"],
  day: ["День", "Обед", "Разгар", "Активность", "Рабочий"],
  evening: ["Вечер", "Закат", "Отдых", "Уют", "Сумерки"],
  night: ["Ночь", "Полночь", "Тишина", "Звёзды", "Темнота"],
}

// ============================================================
// УТИЛИТЫ
// ============================================================

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getGenreName(genre: string): string {
  // Нормализуем жанры для красоты
  const normalizations: Record<string, string> = {
    'rock': 'рок',
    'pop': 'поп',
    'electronic': 'электроника',
    'hip-hop': 'хип-хоп',
    'jazz': 'джаз',
    'classical': 'классика',
    'indie': 'инди',
    'metal': 'метал',
    'folk': 'фолк',
    'blues': 'блюз',
    'r&b': 'R&B',
    'soul': 'соул',
    'funk': 'фанк',
    'reggae': 'регги',
    'punk': 'панк',
    'ambient': 'эмбиент',
    'house': 'хаус',
    'techno': 'техно',
    'trap': 'трэп',
    'lo-fi': 'лоу-фай',
    'alternative': 'альтернатива',
  }
  return normalizations[genre.toLowerCase()] || genre
}

function getMoodFromEnergyAndValence(energy: number, valence: number): string {
  if (energy < 0.3 && valence < 0.4) return 'sad'
  if (energy < 0.4) return 'calm'
  if (energy > 0.7 && valence > 0.6) return 'energetic'
  if (energy > 0.6) return 'happy'
  if (valence > 0.7) return 'chill'
  return 'focused'
}

function getTimeOfDayKey(): keyof typeof TIME_OF_DAY {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'day'
  if (hour >= 18 && hour < 23) return 'evening'
  return 'night'
}

function generateUniqueNumber(seed?: string): number {
  // Генерируем "красивое" число для названия
  if (seed) {
    const hash = seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
    return (hash % 100) + 1
  }
  return Math.floor(Math.random() * 99) + 1
}

// ============================================================
// ГЕНЕРАТОРЫ НАЗВАНИЙ
// ============================================================

export interface PlaylistNamingOptions {
  type: 'dailyMix' | 'myWave' | 'discoverWeekly' | 'moodMix' | 'timeMix' | 'rediscovery' | 'energy' | 'mlrecommendations' | 'becauseyoulistened' | 'timeofday' | 'vibesimilarity'
  genres?: string[]
  artists?: string[]
  energy?: number
  valence?: number
  seed?: string
  weekNumber?: number
}

export interface GeneratedName {
  name: string
  alternatives: string[]
  reason: string
}

/**
 * Сгенерировать название плейлиста
 */
export function generatePlaylistName(options: PlaylistNamingOptions): GeneratedName {
  const { type, genres = [], artists = [], energy = 0.5, valence = 0.5 } = options
  
  const topGenre = genres[0] ? getGenreName(genres[0]) : 'музыка'
  const secondGenre = genres[1] ? getGenreName(genres[1]) : ''
  const topArtist = artists[0] || ''
  const mood = getMoodFromEnergyAndValence(energy, valence)
  const timeKey = getTimeOfDayKey()
  const timeLabel = getRandomItem(TIME_OF_DAY[timeKey])
  const moodLabel = getRandomItem(MOOD_LABELS[mood] || MOOD_LABELS.chill)
  const energyLabel = ENERGY_LABELS[Math.min(4, Math.floor(energy * 5))]
  const num = generateUniqueNumber(options.seed)
  const week = options.weekNumber || Math.ceil(Date.now() / (7 * 24 * 60 * 60 * 1000))

  const templates = TEMPLATES[type] || TEMPLATES.myWave

  // Генерируем варианты
  const alternatives: string[] = []
  for (const template of templates) {
    let filled = template
      .replace('{genre}', topGenre)
      .replace('{genre2}', secondGenre || topGenre)
      .replace('{artist}', topArtist)
      .replace('{mood}', moodLabel)
      .replace('{timeOfDay}', timeLabel)
      .replace('{energyLevel}', energyLabel)
      .replace('{number}', String(num))
      .replace('{week}', String(week))
    alternatives.push(filled)
  }

  // Выбираем случайное (но не последнее, чтобы было разнообразие)
  const name = alternatives[Math.floor(Math.random() * (alternatives.length - 1))]

  return {
    name,
    alternatives: alternatives.slice(0, 3),
    reason: `${type} | ${topGenre} | ${moodLabel} | energy: ${energy.toFixed(2)}`,
  }
}

/**
 * Получить название на основе анализа треков плейлиста
 */
export function generateNameFromSongs(
  type: PlaylistNamingOptions['type'],
  songs: any[]
): GeneratedName {
  if (!songs || songs.length === 0) {
    return generatePlaylistName({ type })
  }

  // Анализируем треки
  const genreCount: Record<string, number> = {}
  const artistCount: Record<string, number> = {}
  let totalEnergy = 0
  let totalValence = 0

  for (const song of songs) {
    if (song.genre) genreCount[song.genre] = (genreCount[song.genre] || 0) + 1
    if (song.artist) artistCount[song.artist] = (artistCount[song.artist] || 0) + 1
    if (song.energy !== undefined) totalEnergy += song.energy
    if (song.valence !== undefined) totalValence += song.valence
  }

  const genres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g)

  const artists = Object.entries(artistCount)
    .sort((a, b) => b[1] - a[1])
    .map(([a]) => a)

  const avgEnergy = songs.length > 0 ? totalEnergy / songs.length : 0.5
  const avgValence = songs.length > 0 ? totalValence / songs.length : 0.5

  return generatePlaylistName({
    type,
    genres: genres.slice(0, 3),
    artists: artists.slice(0, 2),
    energy: avgEnergy,
    valence: avgValence,
    seed: songs[0]?.id || 'default',
  })
}
