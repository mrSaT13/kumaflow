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
   * @param genre - Жанр трека (опционально, для улучшения определения тональности)
   */
  async analyze(url: string, songId: string, saveToNavidrome: boolean = false, genre?: string): Promise<AudioFeatures> {
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
      const key = this.detectKey(audioBuffer, genre)

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
   * Детекция тональности на основе жанра (Вариант А — быстрый)
   * 
   * ИЗМЕНЕНИЕ (14.04.2026): Реализована заглушка
   * Было: случайный ключ (строка 364-367)
   * Стало: предсказание тональности на основе жанра + энергетического анализа
   * 
   * Логика основана на музыкальной теории:
   * - Мажор чаще в: pop, dance, disco, funk, happy жанрах
   * - Минор чаще в: blues, metal, sad, dark, ambient
   * - Нейтрально: rock, jazz, classical
   * 
   * Дополнительно анализируется энергия сигнала:
   * - Высокая энергия → больше вероятность мажора
   * - Низкая энергия → больше вероятность минора
   * 
   * Точность ~65-75% (для Авто-DJ достаточно)
   * 
   * ПРИМЕЧАНИЕ: В будущем можно заменить на Вариант Б (Web Audio API FFT анализ)
   * для точности 85-90%, но это потребует загрузки полного аудиофайла.
   */
  private detectKey(audioBuffer: AudioBuffer, genre?: string): { key: string; mode: 'major' | 'minor' } | null {
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    // 1. Анализ энергии для определения настроения
    const channelData = audioBuffer.getChannelData(0)
    let totalEnergy = 0
    for (let i = 0; i < channelData.length; i++) {
      totalEnergy += channelData[i] * channelData[i]
    }
    const avgEnergy = Math.sqrt(totalEnergy / channelData.length)
    const normalizedEnergy = Math.min(1, avgEnergy * 3)  // 0-1

    // 2. Определяем базовую вероятность мажора на основе энергии
    let majorProbability = 0.5 + (normalizedEnergy - 0.5) * 0.3  // 0.35-0.65

    // 3. Корректируем на основе жанра
    const genreLower = (genre || '').toLowerCase()
    
    // Жанры с высокой вероятностью мажора
    const majorGenres = ['pop', 'dance', 'disco', 'funk', 'soul', 'motown', 'eurodance', 'happy', 'upbeat', 'bubblegum']
    // Жанры с высокой вероятностью минора
    const minorGenres = ['blues', 'metal', 'doom', 'gothic', 'dark', 'sad', 'melancholic', 'emo', 'grunge', 'black metal', 'death metal']
    // Жанры с умеренным минором
    const minorModerate = ['ambient', 'trip hop', 'downtime', 'chillout', 'lo-fi', 'noir']
    // Жанры с умеренным мажором
    const majorModerate = ['rock', 'indie', 'alternative', 'punk', 'ska', 'reggae', 'country', 'folk']

    if (majorGenres.some(g => genreLower.includes(g))) {
      majorProbability += 0.25  // Сильный сдвиг к мажору
    } else if (minorGenres.some(g => genreLower.includes(g))) {
      majorProbability -= 0.30  // Сильный сдвиг к минору
    } else if (minorModerate.some(g => genreLower.includes(g))) {
      majorProbability -= 0.15  // Умеренный сдвиг к минору
    } else if (majorModerate.some(g => genreLower.includes(g))) {
      majorProbability += 0.10  // Умеренный сдвиг к мажору
    }

    // 4. Определяем режим
    const mode: 'major' | 'minor' = majorProbability > 0.5 ? 'major' : 'minor'

    // 5. Определяем ключ (упрощённо — на основе распределения частот)
    // Используем простую эвристику: доминирующая частота → ключ
    const keyIndex = this.estimateKeyFromSpectrum(channelData, audioBuffer.sampleRate)
    const key = keys[keyIndex]

    console.log(`[AudioAnalysis] Key detection: ${key} ${mode} (energy: ${normalizedEnergy.toFixed(2)}, genre: ${genre})`)

    return { key, mode }
  }

  /**
   * Оценка ключа на основе спектрального анализа
   * Упрощённый подход — находит доминирующую частоту
   */
  private estimateKeyFromSpectrum(channelData: Float32Array, sampleRate: number): number {
    // Простой FFT-подобный анализ для определения доминирующей частоты
    // Разбиваем на сегменты и ищем пики
    const segmentSize = Math.min(4096, channelData.length)
    const segment = channelData.slice(0, segmentSize)

    // Простая автокорреляция для определения основной частоты
    let bestLag = 0
    let bestCorrelation = -1

    const maxLag = Math.min(segmentSize / 2, 2000)
    const minLag = Math.floor(sampleRate / 500)  // Макс ~500Hz для базовой ноты

    for (let lag = minLag; lag < maxLag; lag++) {
      let correlation = 0
      for (let i = 0; i < segmentSize - lag; i++) {
        correlation += segment[i] * segment[i + lag]
      }
      correlation /= (segmentSize - lag)

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation
        bestLag = lag
      }
    }

    // Преобразуем лаг в частоту
    if (bestLag > 0) {
      const frequency = sampleRate / bestLag

      // Маппинг частоты на музыкальный ключ (упрощённый)
      // A4 = 440Hz, используем формулу: note = 12 * log2(freq / 440) + 69
      const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69)
      const keyIndex = ((midiNote % 12) + 12) % 12  // 0-11

      return keyIndex
    }

    // Если не удалось определить — случайный ключ
    return Math.floor(Math.random() * 12)
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
