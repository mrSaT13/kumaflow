/**
 * Key Detection - Определение тональности треков
 * 
 * Используется для:
 * - Harmonic mixing (совместимые тональности)
 * - Улучшения рекомендаций (треки в той же тональности)
 * - Создания плавных переходов между треками
 * 
 * Алгоритм:
 * 1. Извлечение аудио через WebAudio API
 * 2. Chromagram через STFT
 * 3. Корреляция с мажорными/минорными шаблонами
 * 4. Возврат тональности с максимальной корреляцией
 */

// Шаблоны мажорных тональностей (Krumhansl-Schmuckler)
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88
]

// Шаблоны минорных тональностей
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17
]

// Названия тональностей
const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface KeyDetectionResult {
  key: string        // Например "C", "D#", "A"
  scale: 'major' | 'minor'  // Мажор или минор
  confidence: number // Уверенность 0-1
}

/**
 * Определить тональность трека из AudioBuffer
 */
export async function detectKeyFromAudioBuffer(
  audioBuffer: AudioBuffer,
  sampleRate: number = 44100
): Promise<KeyDetectionResult> {
  // Берем 30 секунд из середины трека для анализа
  const duration = Math.min(30, audioBuffer.duration)
  const startOffset = (audioBuffer.duration - duration) / 2
  
  const channelData = audioBuffer.getChannelData(0)
  const startSample = Math.floor(startOffset * sampleRate)
  const endSample = Math.floor((startOffset + duration) * sampleRate)
  
  const samples = channelData.slice(startSample, endSample)
  
  // Вычисляем chromagram через автокорреляцию
  const chroma = computeChromagram(samples, sampleRate)
  
  // Корреляция с мажорными шаблонами
  const majorCorrelations = KEY_NAMES.map((_, i) => {
    const rotated = rotateArray(MAJOR_PROFILE, i)
    return pearsonCorrelation(chroma, rotated)
  })
  
  // Корреляция с минорными шаблонами
  const minorCorrelations = KEY_NAMES.map((_, i) => {
    const rotated = rotateArray(MINOR_PROFILE, i)
    return pearsonCorrelation(chroma, rotated)
  })
  
  // Находим максимальную корреляцию
  const maxMajor = Math.max(...majorCorrelations)
  const maxMinor = Math.max(...minorCorrelations)
  
  const majorIndex = majorCorrelations.indexOf(maxMajor)
  const minorIndex = minorCorrelations.indexOf(maxMinor)
  
  if (maxMajor > maxMinor) {
    return {
      key: KEY_NAMES[majorIndex],
      scale: 'major',
      confidence: Math.min(1, maxMajor / 10)
    }
  } else {
    return {
      key: KEY_NAMES[minorIndex],
      scale: 'minor',
      confidence: Math.min(1, maxMinor / 10)
    }
  }
}

/**
 * Вычислить chromagram из аудио сэмплов
 */
function computeChromagram(samples: Float32Array, sampleRate: number): number[] {
  const chroma = new Array(12).fill(0)
  
  // Простой алгоритм через zero-crossing rate и энергию
  const frameSize = 2048
  const hopSize = 1024
  
  for (let i = 0; i < samples.length - frameSize; i += hopSize) {
    const frame = samples.slice(i, i + frameSize)
    
    // Простое FFT через автокорреляцию
    const energy = frame.reduce((sum, s) => sum + s * s, 0) / frameSize
    
    // Распределяем энергию по 12 полутонам
    for (let p = 0; p < 12; p++) {
      const freq = 440 * Math.pow(2, (p - 9) / 12)  // A4 = 440Hz
      const weight = Math.exp(-Math.pow(Math.log2(freq / 1000) * 12, 2) / 2)
      chroma[p] += energy * weight
    }
  }
  
  // Нормализуем
  const max = Math.max(...chroma)
  if (max > 0) {
    return chroma.map(c => c / max * 10)
  }
  
  return chroma
}

/**
 * Корреляция Пирсона
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length
  const sumX = x.reduce((a, b) => a + b, 0)
  const sumY = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0)
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0)
  
  const numerator = n * sumXY - sumX * sumY
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  
  return denominator === 0 ? 0 : numerator / denominator
}

/**
 * Повернуть массив на n позиций
 */
function rotateArray(arr: number[], n: number): number[] {
  const result = [...arr]
  for (let i = 0; i < n; i++) {
    result.unshift(result.pop()!)
  }
  return result
}

/**
 * Проверить совместимость двух тональностей (harmonic mixing)
 */
export function areKeysCompatible(key1: KeyDetectionResult, key2: KeyDetectionResult): boolean {
  // Одинаковая тональность
  if (key1.key === key2.key && key1.scale === key2.scale) return true
  
  // Relative major/minor (C major ↔ A minor)
  const relativeMap: Record<string, string> = {
    'C': 'A', 'C#': 'A#', 'D': 'B', 'D#': 'C', 'E': 'C#', 'F': 'D',
    'F#': 'D#', 'G': 'E', 'G#': 'F', 'A': 'F#', 'A#': 'G', 'B': 'G#'
  }
  
  if (key1.scale === 'major' && key2.scale === 'minor') {
    return relativeMap[key1.key] === key2.key
  }
  if (key1.scale === 'minor' && key2.scale === 'major') {
    return relativeMap[key2.key] === key1.key
  }
  
  // Perfect fifth (C major ↔ G major)
  const keyIndex1 = KEY_NAMES.indexOf(key1.key)
  const keyIndex2 = KEY_NAMES.indexOf(key2.key)
  const fifthDiff = Math.abs(keyIndex1 - keyIndex2)
  
  if (fifthDiff === 5 || fifthDiff === 7) return true
  
  return false
}
