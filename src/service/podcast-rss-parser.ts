/**
 * Сервис для парсинга RSS фидов и HTML страниц подкастов
 */

import { LocalPodcast } from '@/store/local-podcasts.store'

export interface PodcastFromRSS {
  title: string
  author: string
  description: string
  imageUrl: string
  rssUrl: string
}

/**
 * Распарсить RSS фид подкаста или HTML страницу
 */
export async function parsePodcastFromRSS(rssUrl: string): Promise<PodcastFromRSS> {
  try {
    // Используем fetch через Electron для обхода CORS
    const response = await fetchPodcastRSS(rssUrl)
    
    if (!response) {
      throw new Error('Failed to fetch RSS feed')
    }

    // Проверяем, это HTML или XML
    const isHTML = response.trim().startsWith('<!DOCTYPE html') || 
                   response.trim().startsWith('<html') ||
                   response.includes('<head>') ||
                   response.includes('<body>')

    if (isHTML) {
      return parsePodcastFromHTML(response, rssUrl)
    }

    return parsePodcastFromXML(response, rssUrl)
  } catch (error) {
    console.error('[PodcastRSS] Parse error:', error)
    throw error
  }
}

/**
 * Распарсить RSS из содержимого (не URL)
 */
export async function parsePodcastFromRSSContent(content: string, fileName: string): Promise<PodcastFromRSS> {
  try {
    console.log('[PodcastRSS] Parsing content directly, length:', content.length)
    
    // Проверяем, это HTML или XML
    const isHTML = content.trim().startsWith('<!DOCTYPE html') || 
                   content.trim().startsWith('<html') ||
                   content.includes('<head>') ||
                   content.includes('<body>')

    if (isHTML) {
      return parsePodcastFromHTML(content, fileName)
    }

    return parsePodcastFromXML(content, fileName)
  } catch (error) {
    console.error('[PodcastRSS] Parse content error:', error)
    throw error
  }
}

/**
 * Распарсить HTML страницу подкаста (Castbox, Spotify и т.д.)
 */
function parsePodcastFromHTML(html: string, url: string): PodcastFromRSS {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  // Извлекаем данные из HTML
  const title = doc.querySelector('h1')?.textContent?.trim() ||
                doc.querySelector('title')?.textContent?.trim() ||
                'Unknown Podcast'
  
  const author = doc.querySelector('[rel="author"]')?.textContent ||
                 doc.querySelector('.author')?.textContent ||
                 doc.querySelector('[itemprop="name"]')?.textContent ||
                 title
  
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
                      doc.querySelector('[itemprop="description"]')?.textContent ||
                      doc.querySelector('.description')?.textContent ||
                      ''
  
  // Изображение
  let imageUrl = ''
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
  const twitterImage = doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
  const img = doc.querySelector('img[alt*="podcast"], img[alt*="Podcast"]')
  
  if (ogImage) {
    imageUrl = ogImage
  } else if (twitterImage) {
    imageUrl = twitterImage
  } else if (img?.getAttribute('src')) {
    imageUrl = img.getAttribute('src')!
  }

  return {
    title,
    author,
    description,
    imageUrl,
    rssUrl: url,
  }
}

/**
 * Распарсить XML RSS фид
 */
function parsePodcastFromXML(xml: string, url: string): PodcastFromRSS {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xml, 'text/xml')
  
  const channel = xmlDoc.querySelector('channel')
  
  if (!channel) {
    throw new Error('Invalid RSS feed')
  }

  // Извлекаем данные из RSS
  const title = channel.querySelector('title')?.textContent || 'Unknown Podcast'
  const author = channel.querySelector('author')?.textContent || 
                 channel.querySelector('itunes\\:author')?.textContent ||
                 channel.querySelector('dc\\:creator')?.textContent ||
                 'Unknown Author'
  const description = channel.querySelector('description')?.textContent || 
                      channel.querySelector('itunes\\:summary')?.textContent ||
                      ''
  
  // Изображение
  let imageUrl = ''
  const image = channel.querySelector('image')
  const itunesImage = channel.querySelector('itunes\\:image')
  const podcastImage = channel.querySelector('podcast\\:image')
  
  if (itunesImage?.getAttribute('href')) {
    imageUrl = itunesImage.getAttribute('href')!
  } else if (podcastImage?.getAttribute('href')) {
    imageUrl = podcastImage.getAttribute('href')!
  } else if (image?.querySelector('url')?.textContent) {
    imageUrl = image.querySelector('url')!.textContent!
  }

  return {
    title,
    author,
    description,
    imageUrl,
    rssUrl: url,
  }
}

/**
 * Получить RSS фид через proxy (для обхода CORS)
 */
async function fetchPodcastRSS(url: string): Promise<string | null> {
  try {
    // Пробуем через Electron fetch-external если доступен
    const electronAPI = (window as any).electronAPI
    if (electronAPI?.fetchExternal) {
      const result = await electronAPI.fetchExternal(url)
      return result._raw || result
    }

    // Фоллбэк: обычный fetch (может не работать из-за CORS)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return await response.text()
  } catch (error) {
    console.error('[PodcastRSS] Fetch error:', error)
    return null
  }
}

/**
 * Создать локальный подкаст из RSS
 */
export async function createPodcastFromRSS(rssUrl: string): Promise<LocalPodcast> {
  const podcastData = await parsePodcastFromRSS(rssUrl)
  
  // Генерируем уникальный ID из полного URL + timestamp
  // Используем hash чтобы ID был короче и уникальнее
  const urlHash = rssUrl.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0)
    return a & a
  }, 0)
  const id = `local-podcast-${Math.abs(urlHash).toString(36)}-${Date.now().toString(36)}`
  
  const now = Date.now()
  
  return {
    id,
    ...podcastData,
    episodeCount: 0, // Будет обновлено при загрузке эпизодов
    createdAt: now,
    lastUpdated: now,
  }
}

/**
 * Распарсить эпизоды из RSS содержимого
 */
export function parseEpisodesFromRSSContent(rssContent: string) {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(rssContent, 'text/xml')
  
  const items = xmlDoc.querySelectorAll('channel item')
  
  console.log('[PodcastRSS] Found', items.length, 'episodes in RSS content')
  
  return Array.from(items).map((item, index) => {
    const title = item.querySelector('title')?.textContent || 'Unknown Episode'
    const description = item.querySelector('description')?.textContent || 
                        item.querySelector('itunes\\:summary')?.textContent ||
                        ''
    const pubDate = item.querySelector('pubDate')?.textContent || ''
    const duration = item.querySelector('itunes\\:duration')?.textContent || ''
    
    // Audio enclosure
    const enclosure = item.querySelector('enclosure')
    const audioUrl = enclosure?.getAttribute('url') || ''
    const audioType = enclosure?.getAttribute('type') || ''
    
    return {
      id: `local-ep-${index}-${Date.now()}`,
      title,
      description,
      pubDate,
      duration,
      audioUrl,
      audioType,
      isLocal: true,
    }
  })
}

/**
 * Распарсить эпизоды из RSS (для обратной совместимости)
 */
export function parseEpisodesFromRSS(rssContent: string) {
  return parseEpisodesFromRSSContent(rssContent)
}
