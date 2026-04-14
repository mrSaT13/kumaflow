/**
 * Импорт подкастов из файлов (RSS, OPML)
 */

import { LocalPodcast } from '@/store/local-podcasts.store'
import { parsePodcastFromRSS, parsePodcastFromRSSContent, parseEpisodesFromRSSContent } from './podcast-rss-parser'

/**
 * Прочитать файл как текст
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = (e) => reject(e)
    reader.readAsText(file)
  })
}

/**
 * Извлечь RSS URL из OPML файла
 */
function extractRSSFromOPML(opmlText: string): string[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(opmlText, 'text/xml')
  
  const outlines = doc.querySelectorAll('outline[xmlUrl]')
  const rssUrls: string[] = []
  
  outlines.forEach((outline) => {
    const xmlUrl = outline.getAttribute('xmlUrl')
    if (xmlUrl && (xmlUrl.includes('rss') || xmlUrl.includes('feed') || xmlUrl.endsWith('.xml'))) {
      rssUrls.push(xmlUrl)
    }
  })
  
  return rssUrls
}

/**
 * Проверить тип файла (RSS или OPML)
 */
function detectFileType(content: string): 'rss' | 'opml' | 'unknown' {
  if (content.includes('<opml')) {
    return 'opml'
  }
  if (content.includes('<rss') || content.includes('<feed')) {
    return 'rss'
  }
  return 'unknown'
}

/**
 * Импортировать подкасты из файла
 */
export async function importPodcastsFromFile(file: File): Promise<{
  type: 'rss' | 'opml'
  podcasts: LocalPodcast[]
  errors: string[]
}> {
  const errors: string[] = []
  const podcasts: LocalPodcast[] = []
  
  try {
    const content = await readFileAsText(file)
    const fileType = detectFileType(content)
    
    if (fileType === 'unknown') {
      throw new Error('Неподдерживаемый формат файла. Используйте RSS или OPML.')
    }
    
    // Для RSS файлов - парсим содержимое напрямую
    if (fileType === 'rss') {
      try {
        console.log('[Import] Parsing RSS file content directly')
        const podcast = await parsePodcastFromRSSContent(content, file.name)
        const episodes = parseEpisodesFromRSSContent(content)
        const now = Date.now()
        
        // Генерируем уникальный ID из содержимого
        const urlHash = content.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0)
          return a & a
        }, 0)
        const id = `local-podcast-${Math.abs(urlHash).toString(36)}-${now.toString(36)}`
        
        console.log('[Import] Parsed podcast:', podcast.title, 'with', episodes.length, 'episodes')
        
        podcasts.push({
          id,
          ...podcast,
          rssUrl: file.name, // Имя файла как идентификатор
          episodeCount: episodes.length, // Сохраняем количество эпизодов
          createdAt: now,
          lastUpdated: now,
        })
        
        // Сохраняем эпизоды в localStorage для последующей загрузки
        localStorage.setItem(`podcast-episodes-${id}`, JSON.stringify(episodes))
        localStorage.setItem(`podcast-cache-time-${id}`, Date.now().toString())
        localStorage.setItem(`podcast-total-episodes-${id}`, episodes.length.toString())
        
        console.log('[Import] Successfully imported podcast:', podcast.title, 'with', episodes.length, 'episodes')
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка'
        console.error('[Import] RSS parse error:', errorMsg)
        errors.push(`Ошибка парсинга RSS: ${errorMsg}`)
      }
    }
    
    return {
      type: fileType,
      podcasts,
      errors,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка'
    errors.push(`Ошибка чтения файла: ${errorMsg}`)
    return {
      type: 'unknown',
      podcasts: [],
      errors,
    }
  }
}

/**
 * Импортировать多个 RSS фидов из URL
 */
export async function importPodcastsFromURLs(urls: string[]): Promise<LocalPodcast[]> {
  const podcasts: LocalPodcast[] = []
  
  for (const url of urls) {
    try {
      const podcast = await parsePodcastFromRSS(url)
      const now = Date.now()
      
      const urlHash = url.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0)
        return a & a
      }, 0)
      const id = `local-podcast-${Math.abs(urlHash).toString(36)}-${now.toString(36)}`
      
      podcasts.push({
        id,
        ...podcast,
        rssUrl: url,
        episodeCount: 0,
        createdAt: now,
        lastUpdated: now,
      })
    } catch (error) {
      console.error('[Import] Failed to import from URL:', url, error)
    }
  }
  
  return podcasts
}
