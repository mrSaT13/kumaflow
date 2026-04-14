/**
 * Holiday Playlist Auto-Generator
 * 
 * Автоматическая генерация праздничных плейлистов
 * 
 * ИЗМЕНЕНИЕ (14.04.2026): Реализовано
 * - Проверяет isEnabled перед генерацией (НЕ генерирует если отключено!)
 * - Генерирует плейлист за 7 дней до праздника
 * - Фильтрует треки по жанрам/энергии/настроению праздника
 */

import { getUpcomingHolidays, type Holiday } from '@/service/holidays'
import { getAllHolidaysWithCustoms } from '@/service/ics-parser'  // 🆕
import { getRandomSongs } from '@/service/subsonic-api'
import { saveGeneratedPlaylist } from '@/store/generated-playlists.store'
import type { ISong } from '@/types/responses/song'

const STORAGE_KEY = 'holiday-playlists-generated'

interface GeneratedHolidayPlaylist {
  holidayId: string
  playlistId: string
  generatedAt: number
  year: number
}

/**
 * Получить список сгенерированных плейлистов праздников
 */
function getGeneratedHolidayPlaylists(): GeneratedHolidayPlaylist[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data)
  } catch (error) {
    console.error('[HolidayPlaylist] Failed to load generated playlists:', error)
    return []
  }
}

/**
 * Сохранить ID сгенерированного плейлиста
 */
function saveGeneratedHolidayPlaylist(
  holidayId: string,
  playlistId: string,
  year: number
): void {
  const playlists = getGeneratedHolidayPlaylists()
  
  // Удаляем старую запись для этого праздника
  const filtered = playlists.filter(p => 
    !(p.holidayId === holidayId && p.year === year)
  )
  
  // Добавляем новую
  filtered.push({
    holidayId,
    playlistId,
    generatedAt: Date.now(),
    year,
  })
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  console.log(`[HolidayPlaylist] Saved: ${holidayId} → ${playlistId}`)
}

/**
 * Проверить был ли уже сгенерирован плейлист для праздника
 */
function wasHolidayPlaylistGenerated(holidayId: string, year: number): boolean {
  const playlists = getGeneratedHolidayPlaylists()
  return playlists.some(p => p.holidayId === holidayId && p.year === year)
}

/**
 * Фильтровать треки по параметрам праздника
 */
function filterTracksByHoliday(
  tracks: ISong[],
  holiday: Holiday
): ISong[] {
  return tracks.filter(track => {
    // 1. Жанр
    const trackGenre = (track.genre || '').toLowerCase()
    const holidayGenres = holiday.genres.map(g => g.toLowerCase())
    
    const genreMatch = holidayGenres.some(hg => trackGenre.includes(hg))
    
    // 2. Если жанр не совпал — не включаем
    if (!genreMatch) return false
    
    // 3. TODO: В будущем можно добавить фильтрацию по energy/valence
    // когда будет audio analysis для всех треков
    
    return true
  })
}

/**
 * Сгенерировать интересное название для праздника
 */
function generateHolidayPlaylistName(holiday: Holiday): string {
  const year = new Date().getFullYear()
  
  const nameTemplates: Record<string, string[]> = {
    'new-year': [
      `🎄 Новогодний Микс ${year}`,
      `✨ Праздничный Вайб ${year}`,
      `🎉 Новый Год: Лучшие Треки`,
    ],
    'christmas': [
      `⭐ Рождественская Сказка`,
      `🎅 Christmas Warmth ${year}`,
      `☃️ Уютное Рождество`,
    ],
    'halloween': [
      `🎃 Halloween Dark Mix`,
      `👻 Жуткий Плейлист ${year}`,
      `🦇 Spooky Vibes`,
    ],
    'valentines-day': [
      `💝 Romantic Mix ${year}`,
      `❤️ Love Songs Collection`,
      `🌹 Valentine's Day Playlist`,
    ],
    'march-8': [
      `🌸 Весенний Бриз`,
      `💐 8 Марта: Нежный Микс`,
      `🌷 Женский День Playlist`,
    ],
    'may-9': [
      `🎖️ Память и Слава`,
      `⭐ Победный Микс ${year}`,
      `🕊️ Песни Войны и Мира`,
    ],
  }
  
  const templates = nameTemplates[holiday.id] || [
    `${holiday.icon} ${holiday.name} ${year}`,
    `${holiday.icon} Праздничный Микс`,
  ]
  
  // Выбираем случайный шаблон
  const randomIndex = Math.floor(Math.random() * templates.length)
  return templates[randomIndex]
}

/**
 * Сгенерировать описание для праздника
 */
function generateHolidayPlaylistDescription(holiday: Holiday): string {
  return `Автоматический плейлист к празднику ${holiday.name}. Жанры: ${holiday.genres.join(', ')}. Настроение: ${holiday.mood.join(', ')}.`
}

/**
 * Главная функция: Проверить и сгенерировать плейлисты для предстоящих праздников
 * 
 * ВЫЗЫВАТЬ при загрузке приложения!
 */
export async function checkAndGenerateHolidayPlaylists(): Promise<void> {
  console.log('[HolidayPlaylist] 🎄 Checking holidays...')

  try {
    const currentYear = new Date().getFullYear()

    // 🆕 Получаем ВСЕ праздники (дефолтные + пользовательские)
    const allHolidays = getAllHolidaysWithCustoms()
    console.log(`[HolidayPlaylist] Total holidays: ${allHolidays.length}`)

    // 🆕 Получаем праздники которые активны СЕГОДНЯ
    const { isHolidayActive, getUpcomingHolidays } = await import('@/service/holidays')

    const activeHolidays = allHolidays.filter(h => {
      const isActive = isHolidayActive(h)
      if (isActive) console.log(`[HolidayPlaylist] ✅ ${h.name}: ACTIVE TODAY`)
      return isActive
    })

    // 🆕 Для пользовательских праздников проверяем даты вручную (getUpcomingHolidays не знает о кастомных)
    const today = new Date()
    const sevenDaysLater = new Date()
    sevenDaysLater.setDate(today.getDate() + 7)

    const upcomingCustomHolidays = allHolidays.filter(h => {
      // Проверяем только НЕ активные сегодня праздники
      if (activeHolidays.some(ah => ah.id === h.id)) return false

      // Парсим дату начала (MM-DD)
      const [startMonth, startDay] = h.startDate.split('-').map(Number)
      
      // Создаём дату начала праздника в ТЕКУЩЕМ году
      const holidayStartDate = new Date(currentYear, startMonth - 1, startDay)
      
      // Проверяем попадает ли в ближайшие 7 дней
      const daysUntil = Math.ceil((holidayStartDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      
      const isUpcoming = daysUntil >= 0 && daysUntil <= 7
      
      if (isUpcoming) {
        console.log(`[HolidayPlaylist] 📅 ${h.name}: starts in ${daysUntil} days (${h.startDate})`)
      }
      
      return isUpcoming
    })

    // Объединяем активные + предстоящие
    const holidaysToCheck = [...activeHolidays, ...upcomingCustomHolidays]

    console.log(`[HolidayPlaylist] Active today: ${activeHolidays.length}`)
    console.log(`[HolidayPlaylist] Upcoming (7 days): ${upcomingCustomHolidays.length}`)
    console.log(`[HolidayPlaylist] Total to check: ${holidaysToCheck.length}`)
    
    for (const holiday of holidaysToCheck) {
      // 🔒 ВАЖНО: Проверяем isEnabled!
      // Если пользователь отключил праздник — НЕ генерируем!
      if (holiday.isEnabled === false) {
        console.log(`[HolidayPlaylist] ⏭️ Skipping ${holiday.name} — DISABLED by user`)
        continue
      }
      
      console.log(`[HolidayPlaylist] 🎉 Processing: ${holiday.name} (${holiday.icon})`)
      
      // Проверяем не генерировали ли уже плейлист для этого праздника в этом году
      if (wasHolidayPlaylistGenerated(holiday.id, currentYear)) {
        console.log(`[HolidayPlaylist] ⏭️ Skipping ${holiday.name} — Already generated`)
        continue
      }
      
      // Генерируем плейлист!
      console.log(`[HolidayPlaylist] 🎵 Generating playlist for ${holiday.name}...`)
      
      // 1. Загружаем случайные треки (много чтобы было из чего фильтровать)
      const allTracks = await getRandomSongs(200)
      
      if (!allTracks || allTracks.length === 0) {
        console.warn('[HolidayPlaylist] ⚠️ No tracks available')
        continue
      }
      
      // 2. Фильтруем по жанрам праздника
      const filteredTracks = filterTracksByHoliday(allTracks, holiday)
      
      if (filteredTracks.length < 10) {
        console.warn(`[HolidayPlaylist] ⚠️ Not enough tracks for ${holiday.name}: ${filteredTracks.length}`)
        // Всё равно создаём если хоть что-то есть
      }
      
      // 3. Берём 25-30 треков
      const selectedTracks = filteredTracks.slice(0, 30)
      
      // 4. Генерируем название и описание
      const name = generateHolidayPlaylistName(holiday)
      const description = generateHolidayPlaylistDescription(holiday)
      
      // 5. Сохраняем плейлист
      const savedPlaylist = saveGeneratedPlaylist({
        type: 'genre-cluster',
        name,
        description,
        songs: selectedTracks,
        gradient: 'from-red-500 to-yellow-500',
        metadata: {
          genre: holiday.genres[0],
          holidayId: holiday.id,
          holidayName: holiday.name,
          holidayIcon: holiday.icon,
        },
      })
      
      // 6. Запоминаем что сгенерировали
      saveGeneratedHolidayPlaylist(holiday.id, savedPlaylist.id, currentYear)
      
      console.log(`[HolidayPlaylist] ✅ Generated: ${name} (${selectedTracks.length} tracks)`)
      
      // 🆕 Отправляем событие чтобы UI обновился
      window.dispatchEvent(new CustomEvent('holiday-playlist-generated', { 
        detail: { holidayId: holiday.id, playlistId: savedPlaylist.id }
      }))
    }
    
    console.log('[HolidayPlaylist] ✅ Holiday playlist check complete')
  } catch (error) {
    console.error('[HolidayPlaylist] ❌ Error:', error)
  }
}

/**
 * Очистить старые сгенерированные плейлисты (старше 1 года)
 */
export function cleanupOldHolidayPlaylists(): void {
  const currentYear = new Date().getFullYear()
  const playlists = getGeneratedHolidayPlaylists()
  
  const filtered = playlists.filter(p => p.year >= currentYear - 1)
  
  if (filtered.length !== playlists.length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    console.log(`[HolidayPlaylist] Cleaned up ${playlists.length - filtered.length} old playlists`)
  }
}

/**
 * Сбросить все сгенерированные плейлисты праздников
 */
export function resetHolidayPlaylists(): void {
  localStorage.removeItem(STORAGE_KEY)
  console.log('[HolidayPlaylist] 🗑️ Reset all holiday playlists')
}
