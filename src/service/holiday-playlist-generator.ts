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

import { type Holiday } from '@/service/holidays'
import { getAllHolidaysWithCustoms } from '@/service/ics-parser'  // 🆕
import { getRandomSongs, getSongsByGenre } from '@/service/subsonic-api'
import { saveGeneratedPlaylist } from '@/store/generated-playlists.store'
import type { ISong } from '@/types/responses/song'

const STORAGE_KEY = 'holiday-playlists-generated'

/**
 * Минимум треков, при котором плейлист вообще имеет смысл.
 * Ниже — молчаливый мусор в списке, поэтому просто не создаём.
 */
const MIN_TRACKS = 10

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
 * Оценить, насколько трек подходит празднику.
 *
 * Раньше был жёсткий фильтр: жанр должен был совпасть, иначе трек выбрасывался.
 * Из-за этого «Хэллоуин» (metal/rock/industrial) на библиотеке без таких жанров
 * давал 0–9 треков, и плейлист всё равно сохранялся — пустой и без всяких
 * сообщений. Теперь это скоринг: жанр, энергия и настроение складываются,
 * а жёсткое правило одно — трек должен набрать хотя бы единицу.
 *
 * Фичи берём из трека (energy/valence). Если их нет — не штрафуем, а просто
 * не учитываем: иначе на непроанализированной библиотеке отсев всё вырежет.
 */
function scoreTrackForHoliday(track: ISong, holiday: Holiday): number {
  let score = 0

  // 1. Жанр — совпадение по подстроке, как было раньше
  const trackGenre = (track.genre || '').toLowerCase()
  if (trackGenre) {
    const hit = holiday.genres.some((hg) => trackGenre.includes(hg.toLowerCase()))
    if (hit) score += 2
  }

  // 2. Энергия
  const en = track.energy
  if (typeof en === 'number' && holiday.energy) {
    if (en >= holiday.energy.min && en <= holiday.energy.max) score += 1
  }

  // 3. Настроение (valence)
  const va = track.valence
  if (typeof va === 'number' && holiday.valence) {
    if (va >= holiday.valence.min && va <= holiday.valence.max) score += 1
  }

  return score
}

/** Собрать кандидатов и отсортировать по убыванию оценки. */
function filterTracksByHoliday(tracks: ISong[], holiday: Holiday): ISong[] {
  return tracks
    .map((t) => ({ t, s: scoreTrackForHoliday(t, holiday) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t)
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
    const { isHolidayActive } = await import('@/service/holidays')

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
      
      // Кандидаты. Раньше было getRandomSongs(200) — на библиотеке в 79k
      // это 0,25%, и жанровый фильтр почти всегда давал пусто. Теперь берём
      // много больше случайных И отдельно добираем по жанрам праздника.
      const candidates = new Map<string, ISong>()
      const addAll = (rows: ISong[]) => {
        for (const r of rows || []) if (r?.id) candidates.set(r.id, r)
      }

      try {
        addAll(await getRandomSongs(2000))
      } catch (e) {
        console.warn(`[HolidayPlaylist] random songs failed for ${holiday.name}`, e)
      }

      let genreAdded = 0
      for (const g of holiday.genres || []) {
        try {
          const rows = await getSongsByGenre(g, 200)
          const before = candidates.size
          addAll(rows as ISong[])
          genreAdded += candidates.size - before
        } catch {
          /* жанр мог не существовать в библиотеке — не повод падать */
        }
      }
      console.log(
        `[HolidayPlaylist] ${holiday.name}: кандидатов ${candidates.size} ` +
        `(из них по жанрам праздника +${genreAdded})`,
      )

      const allTracks = [...candidates.values()]
      if (allTracks.length === 0) {
        console.warn(`[HolidayPlaylist] ⚠️ ${holiday.name}: нет кандидатов вообще`)
        continue
      }

      // 2. Сортируем по совпадению с праздником
      const filteredTracks = filterTracksByHoliday(allTracks, holiday)

      console.log(
        `[HolidayPlaylist] ${holiday.name}: подошло ${filteredTracks.length} из ${allTracks.length}`,
      )

      // 3. Пустой плейлист не сохраняем. Раньше он всё равно создавался —
      //    пользователь видел карточку без треков и без объяснений.
      if (filteredTracks.length < MIN_TRACKS) {
        console.warn(
          `[HolidayPlaylist] ⏭ ${holiday.name}: подошло только ` +
          `${filteredTracks.length} треков (нужно ${MIN_TRACKS}) — ` +
          `плейлист НЕ создан, уведомления не будет`,
        )
        continue
      }

      // 4. Берём 30 треков
      const selectedTracks = filteredTracks.slice(0, 30)
      
      // 4. Генерируем название и описание
      const name = generateHolidayPlaylistName(holiday)
      const description = generateHolidayPlaylistDescription(holiday)
      
      // 5. Сохраняем плейлист
      // await обязателен: saveGeneratedPlaylist async, и без него
      // savedPlaylist — промис, а savedPlaylist.id был всегда undefined.
      const savedPlaylist = await saveGeneratedPlaylist({
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
      saveGeneratedHolidayPlaylist(holiday.id, savedPlaylist?.id, currentYear)
      
      console.log(`[HolidayPlaylist] ✅ Generated: ${name} (${selectedTracks.length} tracks)`)

      // 🆕 Сообщение пользователю. Раньше генерация была полностью молчаливой:
      // плейлист появлялся в списке без объяснений, а если подходящих треков
      // не нашлось — не появлялось ничего, и непонятно, работает ли фича.
      try {
        const { toast } = await import('react-toastify')
        toast(
          `${holiday.icon || '🎉'} ${holiday.name}: собрали плейлист, ` +
          `${selectedTracks.length} треков — «${name}»`,
          { type: 'success', autoClose: 8000 },
        )
      } catch (e) {
        console.warn('[HolidayPlaylist] toast не показался', e)
      }
      
      // 🆕 Отправляем событие чтобы UI обновился
      window.dispatchEvent(new CustomEvent('holiday-playlist-generated', { 
        detail: { holidayId: holiday.id, playlistId: savedPlaylist?.id }
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
