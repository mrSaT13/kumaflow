/**
 * Импорт/Экспорт списка подкастов
 * Сохранение и восстановление подписок на подкасты
 */

import { LocalPodcast } from '@/store/local-podcasts.store'

/**
 * Экспорт списка подкастов в JSON
 */
export function exportPodcasts(podcasts: LocalPodcast[]): string {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    podcasts: podcasts.map(p => ({
      id: p.id,
      title: p.title,
      author: p.author,
      description: p.description,
      imageUrl: p.imageUrl,
      rssUrl: p.rssUrl,
      episodeCount: p.episodeCount,
    }))
  }
  
  return JSON.stringify(exportData, null, 2)
}

/**
 * Импорт списка подкастов из JSON
 */
export async function importPodcasts(jsonData: string): Promise<{
  podcasts: LocalPodcast[]
  errors: string[]
}> {
  const errors: string[] = []
  const podcasts: LocalPodcast[] = []
  
  try {
    const data = JSON.parse(jsonData)
    
    if (!data.podcasts || !Array.isArray(data.podcasts)) {
      throw new Error('Неверный формат файла')
    }
    
    for (const podcast of data.podcasts) {
      try {
        // Проверяем обязательные поля
        if (!podcast.rssUrl || !podcast.title) {
          errors.push(`Пропущены поля для ${podcast.title || 'unknown'}`)
          continue
        }
        
        // Создаём подкаст с новыми ID
        const now = Date.now()
        const urlHash = podcast.rssUrl.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0)
          return a & a
        }, 0)
        
        podcasts.push({
          id: `local-podcast-${Math.abs(urlHash).toString(36)}-${now.toString(36)}`,
          title: podcast.title,
          author: podcast.author || '',
          description: podcast.description || '',
          imageUrl: podcast.imageUrl || '',
          rssUrl: podcast.rssUrl,
          episodeCount: 0,
          createdAt: now,
          lastUpdated: now,
        })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка'
        errors.push(`Ошибка импорта ${podcast.title || 'unknown'}: ${errorMsg}`)
      }
    }
    
    return { podcasts, errors }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Неизвестная ошибка'
    errors.push(`Ошибка чтения файла: ${errorMsg}`)
    return { podcasts: [], errors }
  }
}

/**
 * Скачать файл экспорта
 */
export function downloadPodcastsExport(podcasts: LocalPodcast[]) {
  const json = exportPodcasts(podcasts)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `kumaflow-podcasts-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Открыть диалог импорта
 */
export function showPodcastImportDialog(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0] || null
      resolve(file)
    }
    
    input.click()
  })
}

/**
 * Прочитать файл импорта
 */
export async function readImportFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = (e) => reject(e)
    reader.readAsText(file)
  })
}
