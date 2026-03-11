/**
 * Wikipedia API Client
 * 
 * Интеграция с Wikipedia для получения:
 * - Биографии артиста
 * - Изображений
 * - Ссылок на соцсети (через Wikidata)
 * 
 * API: https://www.mediawiki.org/wiki/API:Main_page
 */

interface WikipediaPage {
  title: string
  pageid: number
  extract: string
  thumbnail?: {
    source: string
    width: number
    height: number
  }
  originalimage?: {
    source: string
    width: number
    height: number
  }
}

interface WikidataSitelinks {
  enwiki?: { title: string }
  ruwiki?: { title: string }
  commonswiki?: { title: string }
}

interface SocialLinks {
  instagram?: string
  twitter?: string
  facebook?: string
  youtube?: string
  tiktok?: string
  spotify?: string
  website?: string
}

export interface WikipediaArtist {
  name: string
  bio: string
  imageUrl?: string
  wikiUrl?: string
  socialLinks: SocialLinks
}

class WikipediaService {
  private baseUrl: string = 'https://en.wikipedia.org/w/api.php'
  private ruBaseUrl: string = 'https://ru.wikipedia.org/w/api.php'
  private wikidataUrl: string = 'https://www.wikidata.org/w/api.php'
  private commonsUrl: string = 'https://commons.wikimedia.org/w/api.php'  // Wikimedia Commons
  
  /**
   * Получить текущий язык интерфейса
   */
  private getCurrentLanguage(): 'ru' | 'en' {
    const savedLang = localStorage.getItem('i18nextLng') || 'ru'
    return savedLang.startsWith('ru') ? 'ru' : 'en'
  }
  
  /**
   * Поиск статьи об артисте
   */
  async searchArtist(artistName: string): Promise<WikipediaArtist | null> {
    // Сначала пробуем русский язык
    const ruResult = await this.searchArtistInLanguage(artistName, 'ru')
    if (ruResult) {
      return ruResult
    }
    
    // Если не нашли на русском, пробуем английский
    console.log('[Wikipedia] No Russian page found, trying English...')
    return await this.searchArtistInLanguage(artistName, 'en')
  }
  
  /**
   * Поиск статьи в конкретном языке
   */
  private async searchArtistInLanguage(
    artistName: string,
    lang: 'ru' | 'en'
  ): Promise<WikipediaArtist | null> {
    const baseUrl = lang === 'ru' ? this.ruBaseUrl : this.baseUrl
    const wikiDomain = lang === 'ru' ? 'ru.wikipedia.org' : 'en.wikipedia.org'
    
    try {
      console.log('[Wikipedia] Searching for:', artistName, '(lang:', lang + ')')
      
      // 1. Ищем статью в Wikipedia
      const searchUrl = new URL(baseUrl)
      searchUrl.searchParams.set('action', 'query')
      searchUrl.searchParams.set('format', 'json')
      searchUrl.searchParams.set('origin', '*')
      searchUrl.searchParams.set('generator', 'search')
      searchUrl.searchParams.set('gsrsearch', `${artistName} ${lang === 'ru' ? 'группа музыкальный коллектив исполнитель' : 'band musician artist'}`)
      searchUrl.searchParams.set('gsrlimit', '3')  // Ищем 3 статьи
      searchUrl.searchParams.set('prop', 'extracts|pageimages|info')
      searchUrl.searchParams.set('exintro', '1')
      searchUrl.searchParams.set('explaintext', '1')
      searchUrl.searchParams.set('exsentences', '3')
      searchUrl.searchParams.set('piprop', 'original')
      searchUrl.searchParams.set('pilicense', 'free')
      searchUrl.searchParams.set('pithumbsize', '500')  // Размер миниатюры
      searchUrl.searchParams.set('inprop', 'url')
      
      const response = await fetch(searchUrl.toString())
      const data = await response.json()
      
      if (!data.query?.pages) {
        console.log('[Wikipedia] No page found for', artistName)
        return null
      }
      
      const pages = data.query.pages
      const pageIds = Object.keys(pages)
      
      // Ищем наиболее релевантную статью
      for (const pageId of pageIds) {
        if (pageId === '-1') continue
        
        const page: WikipediaPage = pages[pageId]
        
        // Проверяем что статья релевантна (название содержит имя артиста)
        const titleLower = page.title.toLowerCase()
        const artistLower = artistName.toLowerCase()
        
        if (!titleLower.includes(artistLower)) {
          console.log('[Wikipedia] Skipping irrelevant page:', page.title)
          continue
        }
        
        // 2. Получаем изображение если нет в первом запросе
        let imageUrl = page.originalimage?.source || page.thumbnail?.source
        
        if (!imageUrl) {
          // Дополнительный запрос для получения изображения
          imageUrl = await this.getPageImage(page.title, baseUrl)
        }
        
        // 3. Получаем соцсети из Wikidata
        const socialLinks = await this.getSocialLinksFromWikidata(page.title)
        
        return {
          name: page.title,
          bio: page.extract || '',
          imageUrl,
          wikiUrl: `https://${wikiDomain}/wiki/${encodeURIComponent(page.title)}`,
          socialLinks,
        }
      }
      
      console.log('[Wikipedia] No relevant page found for', artistName)
      return null
    } catch (error) {
      console.error('[Wikipedia] Search error:', error)
      return null
    }
  }
  
  /**
   * Получить изображение статьи
   */
  private async getPageImage(title: string, baseUrl: string): Promise<string | undefined> {
    // 1. Пробуем получить из Wikipedia
    try {
      const imageUrl = new URL(baseUrl)
      imageUrl.searchParams.set('action', 'query')
      imageUrl.searchParams.set('format', 'json')
      imageUrl.searchParams.set('origin', '*')
      imageUrl.searchParams.set('titles', title)
      imageUrl.searchParams.set('prop', 'pageimages')
      imageUrl.searchParams.set('piprop', 'original')
      imageUrl.searchParams.set('pithumbsize', '500')
      
      const response = await fetch(imageUrl.toString())
      const data = await response.json()
      
      if (!data.query?.pages) return undefined
      
      const pages = data.query.pages
      const pageId = Object.keys(pages)[0]
      
      if (pageId === '-1') return undefined
      
      const page = pages[pageId]
      const wikiImage = page.originalimage?.source || page.thumbnail?.source
      
      if (wikiImage) {
        console.log('[Wikipedia] Got image from Wikipedia:', wikiImage)
        return wikiImage
      }
    } catch (error) {
      console.error('[Wikipedia] Get image error:', error)
    }
    
    // 2. Если нет в Wikipedia, ищем в Wikimedia Commons
    console.log('[Wikipedia] No image in Wikipedia, trying Wikimedia Commons...')
    return await this.getCommonsImage(title)
  }
  
  /**
   * Получить изображение из Wikimedia Commons
   */
  private async getCommonsImage(artistName: string): Promise<string | undefined> {
    try {
      const searchUrl = new URL(this.commonsUrl)
      searchUrl.searchParams.set('action', 'query')
      searchUrl.searchParams.set('format', 'json')
      searchUrl.searchParams.set('origin', '*')
      searchUrl.searchParams.set('generator', 'search')
      searchUrl.searchParams.set('gsrnamespace', '6')  // 6 = File namespace (изображения)
      searchUrl.searchParams.set('gsrsearch', `${artistName} band musician artist`)
      searchUrl.searchParams.set('gsrlimit', '10')  // Ищем 10 файлов
      searchUrl.searchParams.set('prop', 'imageinfo')
      searchUrl.searchParams.set('iiprop', 'url|mime')
      searchUrl.searchParams.set('iiurlwidth', '500')
      
      const response = await fetch(searchUrl.toString())
      const data = await response.json()
      
      if (!data.query?.pages) {
        console.log('[Wikimedia Commons] No image found for', artistName)
        return undefined
      }
      
      const pages = data.query.pages
      const pageIds = Object.keys(pages)
      
      // Ищем изображение (не PDF!)
      for (const pageId of pageIds) {
        if (pageId === '-1') continue
        
        const page = pages[pageId]
        const imageInfo = page.imageinfo?.[0]
        
        if (!imageInfo) continue
        
        // Проверяем MIME тип - только изображения!
        const mimeType = imageInfo.mime || ''
        if (!mimeType.startsWith('image/')) {
          console.log('[Wikimedia Commons] Skipping non-image:', mimeType, page.title)
          continue
        }
        
        // Проверяем расширение файла
        const url = imageInfo.url
        if (url.endsWith('.pdf') || url.endsWith('.djvu') || url.endsWith('.psd')) {
          console.log('[Wikimedia Commons] Skipping unsupported format:', url)
          continue
        }
        
        console.log('[Wikimedia Commons] Got image:', url, '(', mimeType, ')')
        return url
      }
      
      console.log('[Wikimedia Commons] No valid image found for', artistName)
      return undefined
    } catch (error) {
      console.error('[Wikimedia Commons] Get image error:', error)
      return undefined
    }
  }
  
  /**
   * Получить соцсети из Wikidata
   */
  private async getSocialLinksFromWikidata(title: string): Promise<SocialLinks> {
    try {
      // Ищем элемент Wikidata по названию статьи
      const searchUrl = new URL(this.wikidataUrl)
      searchUrl.searchParams.set('action', 'wbgetentities')
      searchUrl.searchParams.set('format', 'json')
      searchUrl.searchParams.set('origin', '*')
      searchUrl.searchParams.set('sites', 'enwiki')
      searchUrl.searchParams.set('titles', title)
      searchUrl.searchParams.set('props', 'sitelinks|claims')
      
      const response = await fetch(searchUrl.toString())
      const data = await response.json()
      
      if (!data.entities) {
        return {}
      }
      
      const entityId = Object.keys(data.entities)[0]
      const entity = data.entities[entityId]
      
      const socialLinks: SocialLinks = {}
      
      // Извлекаем соцсети из claims
      const claims = entity.claims || {}
      
      // Instagram (P2003)
      if (claims.P2003) {
        socialLinks.instagram = `https://instagram.com/${claims.P2003[0].mainsnak.datavalue.value}`
      }
      
      // Twitter (P2002)
      if (claims.P2002) {
        socialLinks.twitter = `https://twitter.com/${claims.P2002[0].mainsnak.datavalue.value}`
      }
      
      // Facebook (P2013)
      if (claims.P2013) {
        socialLinks.facebook = claims.P2013[0].mainsnak.datavalue.value
      }
      
      // YouTube (P2397)
      if (claims.P2397) {
        socialLinks.youtube = `https://youtube.com/${claims.P2397[0].mainsnak.datavalue.value}`
      }
      
      // TikTok (P11002)
      if (claims.P11002) {
        socialLinks.tiktok = `https://tiktok.com/@${claims.P11002[0].mainsnak.datavalue.value}`
      }
      
      // Spotify (P1953)
      if (claims.P1953) {
        socialLinks.spotify = `https://open.spotify.com/artist/${claims.P1953[0].mainsnak.datavalue.value}`
      }
      
      // Official website (P856)
      if (claims.P856) {
        socialLinks.website = claims.P856[0].mainsnak.datavalue.value
      }
      
      return socialLinks
    } catch (error) {
      console.error('[Wikidata] Error:', error)
      return {}
    }
  }
  
  /**
   * Открыть Wikipedia статью в новом окне
   */
  openWikiPage(url: string) {
    window.open(url, '_blank')
  }
}

// Синглтон
export const wikipediaService = new WikipediaService()
