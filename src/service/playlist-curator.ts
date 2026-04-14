/**
 * Playlist Curator — LLM придумывает названия и описания для плейлистов
 */

import type { ListeningPattern } from './user-pattern-detector'

export interface CuratedPattern extends ListeningPattern {
  name: string
  description: string
  emoji: string
}

export class PlaylistCurator {
  private llmUrl: string
  private llmModel: string
  private llmApiKey?: string
  
  constructor(llmConfig: { url: string; model: string; apiKey?: string }) {
    this.llmUrl = llmConfig.url
    this.llmModel = llmConfig.model
    this.llmApiKey = llmConfig.apiKey
  }
  
  /**
   * Обогащаем паттерн названием и описанием от LLM
   */
  async enrichPattern(pattern: ListeningPattern): Promise<CuratedPattern> {
    // Если LLM не настроен — используем fallback
    if (!this.llmUrl) {
      return this.getFallbackPattern(pattern)
    }
    
    try {
      const prompt = this.buildCuratorPrompt(pattern)
      const response = await this.queryLLM(prompt)
      
      if (response) {
        return {
          ...pattern,
          name: response.name || this.getDefaultName(pattern),
          description: response.description || '',
          emoji: response.emoji || this.getDefaultEmoji(pattern),
        }
      }
    } catch (error) {
      console.error('[PlaylistCurator] LLM failed, using fallback:', error)
    }
    
    // Fallback если LLM не ответил
    return this.getFallbackPattern(pattern)
  }
  
  /**
   * Запрос к LLM
   */
  private async queryLLM(prompt: string): Promise<{ name: string; description: string; emoji: string } | null> {
    try {
      const response = await fetch(`${this.llmUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.llmApiKey ? { 'Authorization': `Bearer ${this.llmApiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.llmModel,
          input: prompt,
          temperature: 0.7,
          max_output_tokens: 200,
          stream: false,
        }),
      })
      
      if (!response.ok) {
        throw new Error(`LLM error: ${response.status}`)
      }
      
      const result = await response.json()
      const content = result.output?.[0]?.content || ''
      
      // Парсим JSON
      const firstBrace = content.indexOf('{')
      const lastBrace = content.lastIndexOf('}')
      
      if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonStr = content.substring(firstBrace, lastBrace + 1)
        return JSON.parse(jsonStr)
      }
      
      return null
    } catch (error) {
      console.error('[PlaylistCurator] Query failed:', error)
      return null
    }
  }
  
  /**
   * Строим промт для LLM
   */
  private buildCuratorPrompt(pattern: ListeningPattern): string {
    const timeNames: Record<string, string> = {
      morning: 'утро (6-12)',
      day: 'день (12-18)',
      evening: 'вечер (18-23)',
      night: 'ночь (23-6)',
    }
    
    return `
Ты музыкальный куратор. Придумай креативное название для автоматического плейлиста.

Данные о паттерне:
- Время: ${pattern.timeOfDay ? timeNames[pattern.timeOfDay] : 'любое'}
- Дни недели: ${pattern.daysOfWeek?.length ? pattern.daysOfWeek.join(', ') : 'любые'}
- Средний BPM: ${pattern.avgBpm?.toFixed(0) || 'N/A'}
- Энергия: ${pattern.avgEnergy?.toFixed(2) || 'N/A'} (0=спокойно, 1=энергично)
- Настроение: ${pattern.avgValence?.toFixed(2) || 'N/A'} (0=грустно, 1=весело)
- Жанры: ${pattern.topGenres?.join(', ') || 'N/A'}
- Количество прослушиваний: ${pattern.playCount}

Придумай:
1. Название (2-4 слова, атмосферное, не шаблонное)
2. Описание (1 предложение)
3. Эмодзи (1 символ)

Примеры хороших названий:
- "Ночной неон", "Дождь и винил", "Код под кофе", "Утренний заряд"

Примеры плохих названий:
- "Утренний плейлист", "Музыка для работы", "Вечерние треки"

Верни ТОЛЬКО JSON:
{
  "name": "string",
  "description": "string",
  "emoji": "string"
}
`.trim()
  }
  
  /**
   * Fallback если LLM не ответил
   */
  private getFallbackPattern(pattern: ListeningPattern): CuratedPattern {
    const timeNames: Record<string, string> = {
      morning: 'Утро',
      day: 'День',
      evening: 'Вечер',
      night: 'Ночь',
    }
    
    const emojis: Record<string, string> = {
      morning: '☀️',
      day: '🌤️',
      evening: '🌆',
      night: '🌙',
    }
    
    const energyDesc = pattern.avgEnergy !== undefined
      ? pattern.avgEnergy > 0.7 ? 'энергичная' : pattern.avgEnergy < 0.3 ? 'спокойная' : 'сбалансированная'
      : 'разная'
    
    return {
      ...pattern,
      name: `${timeNames[pattern.timeOfDay || 'day']} ${energyDesc}`,
      description: `${pattern.topGenres?.join(', ') || 'Смесь жанров'} для ${pattern.timeOfDay || 'любого'} времени`,
      emoji: emojis[pattern.timeOfDay || 'day'] || '🎵',
    }
  }
  
  /**
   * Название по умолчанию
   */
  private getDefaultName(pattern: ListeningPattern): string {
    const timeNames: Record<string, string> = {
      morning: 'Утренний вайб',
      day: 'Дневной поток',
      evening: 'Вечерний chill',
      night: 'Ночная волна',
    }
    return timeNames[pattern.timeOfDay || 'day'] || 'Микс дня'
  }
  
  /**
   * Эмодзи по умолчанию
   */
  private getDefaultEmoji(pattern: ListeningPattern): string {
    if (pattern.avgEnergy && pattern.avgEnergy > 0.7) return '🔥'
    if (pattern.avgValence && pattern.avgValence < 0.3) return '🌧️'
    
    const emojis: Record<string, string> = {
      morning: '☀️',
      day: '🌤️',
      evening: '🌆',
      night: '🌙',
    }
    return emojis[pattern.timeOfDay || 'day'] || '🎵'
  }
}
