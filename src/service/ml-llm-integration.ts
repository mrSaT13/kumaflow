/**
 * ML + LLM Integration Service
 * 
 * Интеграция ML (подбор треков) + LLM (анализ и одобрение)
 * для создания умных плейлистов
 * 
 * Архитектура:
 * 1. ML подбирает треки на основе паттернов
 * 2. LLM анализирует плейлист и даёт обратную связь
 * 3. ML переподбирает треки с учётом замечаний
 * 4. Orchestrator создаёт плавные переходы
 * 5. Финальный плейлист пользователю
 */

import type { ISong } from '@/types/responses/song'
import { llmService } from '@/service/llm-service'
import { useExternalApiStore } from '@/store/external-api.store'

export interface PlaylistFeedback {
  tooSimilar: boolean      // Слишком однообразно
  bpmJumps: boolean        // Резкие скачки BPM
  energyFlat: boolean      // Энергия слишком плоская
  needsMoreVariety: boolean  // Нужно больше разнообразия
  suggestion: string       // Рекомендация что изменить
  approved: boolean        // Одобрено ли
}

export interface MLPlaylistConfig {
  pattern: string
  limit: number
  useLLM: boolean
  maxIterations: number
}

/**
 * Сервис интеграции ML + LLM
 */
class MLLLMIntegrationService {
  private isInitialized = false

  /**
   * Инициализация сервиса
   */
  initialize(): void {
    const state = useExternalApiStore.getState()
    this.isInitialized = state.llmEnabled && state.llmLmStudioUrl !== ''
    
    console.log('[ML-LLM] Initialized:', this.isInitialized)
  }

  /**
   * Умная генерация плейлиста с LLM анализом
   * 
   * @param tracks - Треки от ML
   * @param pattern - Паттерн для генерации
   * @returns Обратная связь от LLM
   */
  async reviewPlaylist(
    tracks: ISong[],
    pattern: string
  ): Promise<PlaylistFeedback> {
    // Если LLM не включен - возвращаем одобрение
    if (!this.isInitialized) {
      return {
        tooSimilar: false,
        bpmJumps: false,
        energyFlat: false,
        needsMoreVariety: false,
        suggestion: '',
        approved: true,
      }
    }

    try {
      // Анализируем плейлист
      const analysis = await this.analyzePlaylist(tracks, pattern)
      
      // Генерируем обратную связь
      const feedback = await this.generateFeedback(analysis, tracks)
      
      console.log('[ML-LLM] Playlist feedback:', feedback)
      
      return feedback
    } catch (error) {
      console.error('[ML-LLM] Review failed:', error)
      
      // При ошибке возвращаем одобрение
      return {
        tooSimilar: false,
        bpmJumps: false,
        energyFlat: false,
        needsMoreVariety: false,
        suggestion: '',
        approved: true,
      }
    }
  }

  /**
   * Анализ плейлиста
   */
  private async analyzePlaylist(
    tracks: ISong[],
    pattern: string
  ): Promise<string> {
    // Считаем статистику
    const avgBpm = tracks.reduce((sum, t) => sum + (t.bpm || 0), 0) / tracks.length
    const avgEnergy = tracks.reduce((sum, t) => {
      const energy = parseFloat(t.energy as any) || 0.5
      return sum + energy
    }, 0) / tracks.length
    
    const uniqueArtists = new Set(tracks.map(t => t.artist)).size
    const uniqueGenres = new Set(tracks.map(t => t.genre)).size
    
    // Считаем скачки BPM
    let bpmJumps = 0
    for (let i = 1; i < tracks.length; i++) {
      const diff = Math.abs((tracks[i].bmp || 0) - (tracks[i-1].bpm || 0))
      if (diff > 30) bpmJumps++
    }
    
    // Формируем промт для LLM
    const prompt = `
Проанализируй плейлист из ${tracks.length} треков для паттерна "${pattern}":

Статистика:
- Средний BPM: ${avgBpm.toFixed(0)}
- Средняя энергия: ${avgEnergy.toFixed(2)}
- Уникальных артистов: ${uniqueArtists} из ${tracks.length}
- Уникальных жанров: ${uniqueGenres}
- Скачков BPM (>30): ${bpmJumps}

Первые 5 треков:
${tracks.slice(0, 5).map((t, i) => `${i+1}. ${t.artist} - ${t.title} (BPM: ${t.bpm}, Energy: ${t.energy})`).join('\n')}

Последние 5 треков:
${tracks.slice(-5).map((t, i) => `${i+1}. ${t.artist} - ${t.title} (BPM: ${t.bpm}, Energy: ${t.energy})`).join('\n')}

Проблемы для проверки:
1. Слишком однообразно? (меньше 5 уникальных артистов или 1 жанр доминирует)
2. Резкие переходы? (больше 3 скачков BPM)
3. Скучно? (энергия слишком плоская 0.4-0.6)
4. Нужно ли больше разнообразия?

Верни JSON:
{
  "tooSimilar": true/false,
  "bpmJumps": true/false,
  "energyFlat": true/false,
  "needsMoreVariety": true/false,
  "suggestion": "конкретная рекомендация",
  "approved": true/false
}
`.trim()

      // Запрашиваем анализ у LLM
      const response = await llmService.query(prompt)
      
      return response
    }

  /**
   * Генерация обратной связи из JSON
   */
  private async generateFeedback(
    analysis: string,
    tracks: ISong[]
  ): Promise<PlaylistFeedback> {
    try {
      // Парсим JSON из ответа
      const firstBrace = analysis.indexOf('{')
      const lastBrace = analysis.lastIndexOf('}')
      
      if (firstBrace === -1 || lastBrace === -1) {
        return {
          tooSimilar: false,
          bpmJumps: false,
          energyFlat: false,
          needsMoreVariety: false,
          suggestion: '',
          approved: true,
        }
      }
      
      const jsonStr = analysis.substring(firstBrace, lastBrace + 1)
      const parsed = JSON.parse(jsonStr)
      
      return {
        tooSimilar: parsed.tooSimilar || false,
        bpmJumps: parsed.bpmJumps || false,
        energyFlat: parsed.energyFlat || false,
        needsMoreVariety: parsed.needsMoreVariety || false,
        suggestion: parsed.suggestion || '',
        approved: parsed.approved !== false,  // По умолчанию true
      }
    } catch (error) {
      console.error('[ML-LLM] Failed to parse feedback:', error)
      
      return {
        tooSimilar: false,
        bpmJumps: false,
        energyFlat: false,
        needsMoreVariety: false,
        suggestion: '',
        approved: true,
      }
    }
  }

  /**
   * Генерация плейлиста с циклом обратной связи
   * 
   * @param mlGenerator - Функция генерации от ML
   * @param config - Конфигурация
   * @returns Финальный плейлист
   */
  async generatePlaylistWithFeedback(
    mlGenerator: () => Promise<ISong[]>,
    config: MLPlaylistConfig
  ): Promise<ISong[]> {
    let tracks = await mlGenerator()
    let iterations = 0
    
    console.log('[ML-LLM] Starting generation with feedback loop...')
    
    // Цикл обратной связи (максимум maxIterations)
    while (iterations < config.maxIterations) {
      iterations++
      console.log(`[ML-LLM] Iteration ${iterations}/${config.maxIterations}`)
      
      // Анализируем плейлист
      const feedback = await this.reviewPlaylist(tracks, config.pattern)
      
      // Если одобрено - возвращаем
      if (feedback.approved) {
        console.log('[ML-LLM] Playlist approved!')
        return tracks
      }
      
      // Если есть замечания - переподбираем
      console.log('[ML-LLM] Feedback:', feedback)
      
      if (feedback.tooSimilar || feedback.needsMoreVariety) {
        // Нужно больше разнообразия - меняем параметры
        console.log('[ML-LLM] Regenerating for more variety...')
        tracks = await mlGenerator()
        continue
      }
      
      if (feedback.bpmJumps) {
        // Нужно сгладить BPM - используем orchestrator
        console.log('[ML-LLM] Smoothing BPM transitions...')
        // TODO: Вызвать orchestrator с параметром smoothBpm
        break
      }
      
      // Если не понятно что делать - выходим
      break
    }
    
    console.log('[ML-LLM] Generation complete after', iterations, 'iterations')
    return tracks
  }
}

// Экспортируем единственный экземпляр
export const mlLlmIntegration = new MLLLMIntegrationService()
