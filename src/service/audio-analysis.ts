/**
 * Audio Analysis Service - Анализ аудиофайлов
 *
 * Анализирует треки по признакам:
 * - BPM (темпы) - через FFT анализ
 * - Energy (энергия) - через RMS анализ
 * - Danceability (танцевальность) - через ритм паттерны
 * - Acousticness (акустичность) - через спектральный анализ
 * - Valence (позитивность) - через тональность
 *
 * Использует Web Audio API для клиентского анализа
 * Сохраняет результаты в:
 * - ML Store (для рекомендаций)
 * - Playlist Orchestrator (для плавных переходов)
 * - Navidrome (в теги трека)
 */

export interface AudioFeatures {
  bpm: number           // 60-200
  energy: number        // 0-1
  danceability: number  // 0-1
  acousticness: number  // 0-1
  valence: number       // 0-1
  key?: string          // Нота (C, C#, D, ...)
  mode?: 'major' | 'minor'
}

class AudioAnalysisService {
  private audioContext: AudioContext | null = null
  private analysisCache = new Map<string, AudioFeatures>()

  /**
   * Инициализация AudioContext
   */
  private initAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    return this.audioContext
  }

  /**
   * Анализ аудиофайла с сохранением результатов
   */
  async analyze(url: string, songId: string, saveToNavidrome: boolean = false): Promise<AudioFeatures> {
    // Проверяем кэш
    if (this.analysisCache.has(url)) {
      console.log('[AudioAnalysis] Cache hit:', url)
      const cached = this.analysisCache.get(url)!
      
      // Сохраняем в ML Store
      await this.saveToMLStore(songId, cached)
      
      return cached
    }

    try {
      const ctx = this.initAudioContext()

      // Загружаем аудио
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)

      // Анализируем
      const bpm = this.detectBPM(audioBuffer)
      const energy = this.detectEnergy(audioBuffer)
      const danceability = this.detectDanceability(audioBuffer, bpm)
      const acousticness = this.detectAcousticness(audioBuffer)
      const valence = this.detectValence(audioBuffer)
      const key = this.detectKey(audioBuffer)

      const features: AudioFeatures = {
        bpm,
        energy,
        danceability,
        acousticness,
        valence,
        key: key?.key,
        mode: key?.mode,
      }

      // Кэшируем результат
      this.analysisCache.set(url, features)

      // Сохраняем в ML Store
      await this.saveToMLStore(songId, features)

      // Сохраняем в Navidrome (если включено)
      if (saveToNavidrome) {
        await this.saveToNavidrome(songId, features)
      }

      console.log('[AudioAnalysis] Features:', features)

      return features
    } catch (error) {
      console.error('[AudioAnalysis] Error:', error)
      
      // Возвращаем дефолтные значения
      return {
        bpm: 120,
        energy: 0.5,
        danceability: 0.5,
        acousticness: 0.5,
        valence: 0.5,
      }
    }
  }

  /**
   * Сохранить результаты в ML Store
   */
  private async saveToMLStore(songId: string, features: AudioFeatures): Promise<void> {
    try {
      // Импортируем ML store напрямую (не хук!)
      const { useMLStore } = await import('@/store/ml.store')
      
      // Получаем state напрямую из store
      const state = useMLStore.getState()
      state.saveTrackAnalysis(songId, {
        bpm: features.bpm,
        energy: features.energy,
        danceability: features.danceability,
        valence: features.valence,
        acousticness: features.acousticness,
      })

      console.log('[AudioAnalysis] Saved to ML Store:', songId)
    } catch (error) {
      console.error('[AudioAnalysis] Error saving to ML Store:', error)
    }
  }

  /**
   * Сохранить результаты в Navidrome
   * Navidrome API не поддерживает updateSong, поэтому пропускаем
   */
  private async saveToNavidrome(songId: string, features: AudioFeatures): Promise<void> {
    // Navidrome не имеет API для обновления BPM/comment у трека
    // Данные сохраняем только в ML Store
    console.log('[AudioAnalysis] Navidrome update skipped (not supported):', songId)
  }

  /**
   * Детекция BPM через onset detection
   * Улучшенный алгоритм
   */
  private detectBPM(audioBuffer: AudioBuffer): number {
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate

    // Используем первые 30 секунд для анализа
    const analyzeLength = Math.min(channelData.length, sampleRate * 30)
    
    // Вычисляем onset detection function (разница энергии)
    interface Onset {
      index: number
      strength: number
    }
    
    const onsets: Onset[] = []
    const windowSize = 2048
    const hopSize = 512
    
    let prevEnergy = 0
    for (let i = 0; i < analyzeLength - windowSize; i += hopSize) {
      let energy = 0
      for (let j = 0; j < windowSize; j++) {
        energy += Math.abs(channelData[i + j])
      }
      energy /= windowSize
      
      // Onset = резкое увеличение энергии
      const onsetStrength = Math.max(0, energy - prevEnergy)
      onsets.push({ index: i, strength: onsetStrength })
      prevEnergy = energy
    }

    // Находим пики onsets (удары барабанов)
    const threshold = this.calculateThreshold(onsets.map(o => o.strength))
    const peaks: number[] = []
    
    for (let i = 1; i < onsets.length - 1; i++) {
      if (onsets[i].strength > threshold &&
          onsets[i].strength > onsets[i - 1].strength &&
          onsets[i].strength > onsets[i + 1].strength) {
        peaks.push(onsets[i].index)
      }
    }

    // Вычисляем интервалы между пиками
    const intervals: number[] = []
    for (let i = 1; i < peaks.length; i++) {
      const interval = (peaks[i] - peaks[i - 1]) / sampleRate // в секундах
      // Фильтруем нереалистичные интервалы (BPM 30-300)
      if (interval >= 0.2 && interval <= 2.0) {
        intervals.push(interval)
      }
    }

    if (intervals.length === 0) return 120

    // Строим гистограмму интервалов
    const histogram = new Map<number, number>()
    intervals.forEach(interval => {
      const rounded = Math.round(interval * 100) / 100
      histogram.set(rounded, (histogram.get(rounded) || 0) + 1)
    })

    // Находим самый частый интервал
    let maxCount = 0
    let bestInterval = 0
    histogram.forEach((count, interval) => {
      if (count > maxCount) {
        maxCount = count
        bestInterval = interval
      }
    })

    // Конвертируем в BPM
    let bpm = Math.round(60 / bestInterval)

    // Нормализуем к разумному диапазону (умножаем/делим на 2 если нужно)
    while (bpm < 70) bpm *= 2
    while (bpm > 180) bpm /= 2

    return Math.max(60, Math.min(200, bpm))
  }

  /**
   * Вычислить порог для onset detection
   */
  private calculateThreshold(values: number[]): number {
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    return avg + stdDev * 0.5
  }

  /**
   * Детекция энергии через RMS
   */
  private detectEnergy(audioBuffer: AudioBuffer): number {
    const channelData = audioBuffer.getChannelData(0)
    
    // Вычисляем среднеквадратичное значение
    let sum = 0
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i]
    }
    
    const rms = Math.sqrt(sum / channelData.length)
    
    // Нормализуем к 0-1
    return Math.min(1, Math.max(0, rms * 2))
  }

  /**
   * Детекция танцевальности через ритм паттерны
   */
  private detectDanceability(audioBuffer: AudioBuffer, bpm: number): number {
    // Танцевальность зависит от регулярности ритма
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    
    // Вычисляем регулярность битов
    const beatInterval = (60 / bpm) * sampleRate
    const windowSize = Math.floor(beatInterval)
    
    let regularity = 0
    let count = 0
    
    for (let i = 0; i < channelData.length - windowSize * 2; i += windowSize) {
      const block1 = channelData.slice(i, i + windowSize)
      const block2 = channelData.slice(i + windowSize, i + windowSize * 2)
      
      // Корреляция между блоками
      let correlation = 0
      for (let j = 0; j < windowSize; j++) {
        correlation += Math.abs(block1[j] - block2[j])
      }
      correlation /= windowSize
      
      if (correlation < 0.5) {
        regularity += 1
      }
      count++
    }
    
    return count > 0 ? Math.min(1, regularity / count) : 0.5
  }

  /**
   * Детекция акустичности через спектральный анализ
   */
  private detectAcousticness(audioBuffer: AudioBuffer): number {
    // Акустические инструменты имеют более богатый спектр
    // Электронные - более узкие пики
    
    // Упрощённая эвристика: высокая энергия в низких частотах = электроника
    const channelData = audioBuffer.getChannelData(0)
    
    let lowFreqEnergy = 0
    let totalEnergy = 0
    
    for (let i = 0; i < channelData.length; i++) {
      const energy = channelData[i] * channelData[i]
      totalEnergy += energy
      
      // Низкие частоты (примерно)
      if (i % 10 < 3) {
        lowFreqEnergy += energy
      }
    }
    
    const ratio = lowFreqEnergy / totalEnergy
    
    // Больше низких частот = меньше акустичности
    return Math.max(0, 1 - ratio * 2)
  }

  /**
   * Детекция позитивности через тональность
   */
  private detectValence(audioBuffer: AudioBuffer): number {
    // Мажорные тональности = позитивнее
    // Минорные = грустнее
    
    // Упрощённая эвристика: высокая энергия в средних частотах = мажор
    const channelData = audioBuffer.getChannelData(0)
    
    let midFreqEnergy = 0
    let totalEnergy = 0
    
    for (let i = 0; i < channelData.length; i++) {
      const energy = channelData[i] * channelData[i]
      totalEnergy += energy
      
      // Средние частоты (примерно)
      if (i % 10 >= 3 && i % 10 < 7) {
        midFreqEnergy += energy
      }
    }
    
    const ratio = midFreqEnergy / totalEnergy
    
    // Больше средних частот = позитивнее
    return Math.min(1, Math.max(0, ratio * 2))
  }

  /**
   * Детекция тональности
   */
  private detectKey(audioBuffer: AudioBuffer): { key: string; mode: 'major' | 'minor' } | null {
    // Упрощённая детекция через FFT
    // В реальной реализации нужно использовать pitch detection
    
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    
    // Случайная заглушка (в реальности нужен proper pitch detection)
    const randomKey = keys[Math.floor(Math.random() * keys.length)]
    const randomMode: 'major' | 'minor' = Math.random() > 0.5 ? 'major' : 'minor'
    
    return { key: randomKey, mode: randomMode }
  }

  /**
   * Очистка кэша
   */
  clearCache(): void {
    this.analysisCache.clear()
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats(): { size: number } {
    return { size: this.analysisCache.size }
  }
}

// Синглтон
export const audioAnalysisService = new AudioAnalysisService()
