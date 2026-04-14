/**
 * Экспорт/Импорт результатов анализа библиотеки
 * 
 * Позволяет переносить аудио-признаки между устройствами
 * без повторного сканирования
 */

import { getTrackAnalysis, saveTrackAnalysis, type TrackAnalysis } from './library-analyzer'

/**
 * Экспортировать все проанализированные треки
 */
export async function exportAnalysisData(): Promise<string> {
  try {
    // Получаем весь кэш анализа
    const cacheData = localStorage.getItem('track_analysis_cache')
    if (!cacheData) {
      return JSON.stringify({ version: '1.5.7', tracks: [], exportedAt: new Date().toISOString() })
    }
    
    const cache = JSON.parse(cacheData)
    
    // Формируем экспорт
    const exportData = {
      version: '1.5.7',
      exportedAt: new Date().toISOString(),
      trackCount: Object.keys(cache).length,
      tracks: cache,
    }
    
    console.log(`[AnalysisExport] Exporting ${exportData.trackCount} tracks`)
    return JSON.stringify(exportData)
  } catch (error) {
    console.error('[AnalysisExport] Error:', error)
    throw error
  }
}

/**
 * Импортировать результаты анализа
 */
export async function importAnalysisData(jsonData: string): Promise<{ imported: number; skipped: number }> {
  try {
    const importData = JSON.parse(jsonData)
    
    if (!importData.tracks || typeof importData.tracks !== 'object') {
      throw new Error('Неверный формат файла')
    }
    
    let imported = 0
    let skipped = 0
    
    // Импортируем каждый трек
    for (const [songId, analysis] of Object.entries(importData.tracks)) {
      const existing = getTrackAnalysis(songId)
      
      if (existing) {
        skipped++
        continue
      }
      
      await saveTrackAnalysis(songId, analysis as TrackAnalysis)
      imported++
    }
    
    console.log(`[AnalysisImport] Imported: ${imported}, Skipped: ${skipped}`)
    return { imported, skipped }
  } catch (error) {
    console.error('[AnalysisImport] Error:', error)
    throw error
  }
}
