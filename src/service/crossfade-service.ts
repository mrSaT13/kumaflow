/**
 * Crossfade Playback Service
 * Плавные переходы между треками (fade out / fade in)
 * 
 * Inspired by music_assistant Crossfade Playback
 * https://github.com/music-assistant/music-assistant
 */

export interface CrossfadeOptions {
  duration: number // Длительность crossfade в секундах (по умолчанию 5)
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

export class CrossfadeService {
  private currentAudio: HTMLAudioElement | null = null
  private nextAudio: HTMLAudioElement | null = null
  private isFading: boolean = false
  private fadeTimeout: NodeJS.Timeout | null = null
  private options: CrossfadeOptions = {
    duration: 5,
    easing: 'ease-in-out',
  }
  
  // Callback для переключения трека после crossfade
  private onCrossfadeComplete: (() => void) | null = null

  /**
   * Инициализация сервиса
   */
  public init(audioElement: HTMLAudioElement) {
    this.currentAudio = audioElement
  }

  /**
   * Настройка параметров crossfade
   */
  public configure(options: Partial<CrossfadeOptions>) {
    this.options = {
      ...this.options,
      ...options,
    }
    console.log(`[Crossfade] Configured: ${this.options.duration}s, ${this.options.easing}`)
  }

  /**
   * Подготовка следующего трека для crossfade
   * Вызывается когда текущий трек близок к завершению
   */
  public async prepareNextTrack(src: string): Promise<HTMLAudioElement> {
    console.log('[Crossfade] Preparing next track...')
    
    // Создаем второй audio элемент для следующего трека
    this.nextAudio = new Audio()
    this.nextAudio.preload = 'auto'
    this.nextAudio.src = src
    this.nextAudio.muted = true // Начинаем с muted
    
    // Ждем загрузки
    await new Promise<void>((resolve, reject) => {
      if (!this.nextAudio) return reject(new Error('No audio element'))
      
      const handleCanPlay = () => {
        console.log('[Crossfade] Next track loaded, ready for crossfade')
        cleanup()
        resolve()
      }
      
      const handleError = (e: Event) => {
        console.error('[Crossfade] Failed to load next track', e)
        cleanup()
        reject(e)
      }
      
      const cleanup = () => {
        this.nextAudio?.removeEventListener('canplay', handleCanPlay)
        this.nextAudio?.removeEventListener('error', handleError)
      }
      
      this.nextAudio.addEventListener('canplay', handleCanPlay)
      this.nextAudio.addEventListener('error', handleError)
      
      // Начинаем загрузку
      this.nextAudio.load()
    })
    
    return this.nextAudio
  }

  /**
   * Выполнение crossfade перехода
   * Вызывается когда нужно начать переход на следующий трек
   */
  public async crossfade(
    onTransitionComplete: () => void
  ): Promise<void> {
    if (!this.currentAudio || !this.nextAudio || this.isFading) {
      console.warn('[Crossfade] Cannot crossfade: missing audio elements or already fading')
      return
    }

    console.log(`[Crossfade] Starting crossfade (${this.options.duration}s)...`)
    this.isFading = true
    this.onCrossfadeComplete = onTransitionComplete

    const fadeDuration = this.options.duration * 1000 // ms
    const interval = 50 // ms
    const steps = fadeDuration / interval
    let currentStep = 0

    // Начальная громкость
    const currentVolume = this.currentAudio.volume
    const nextVolume = this.nextAudio.volume

    return new Promise<void>((resolve) => {
      const fadeInterval = setInterval(() => {
        currentStep++
        const progress = currentStep / steps

        // Применяем easing
        const easedProgress = this.applyEasing(progress, this.options.easing!)

        // Fade out текущего трека
        const currentGain = currentVolume * (1 - easedProgress)
        this.currentAudio!.volume = Math.max(0, currentGain)

        // Fade in следующего трека
        const nextGain = nextVolume * easedProgress
        this.nextAudio!.volume = Math.min(nextVolume, nextGain)

        console.log(`[Crossfade] Step ${currentStep}/${steps}: progress=${progress.toFixed(2)}, currentVol=${currentGain.toFixed(2)}, nextVol=${nextGain.toFixed(2)}`)

        // Завершение crossfade
        if (currentStep >= steps) {
          clearInterval(fadeInterval)
          console.log('[Crossfade] Crossfade completed')
          
          // Останавливаем текущий трек
          this.currentAudio!.pause()
          this.currentAudio!.currentTime = 0
          
          // Вызываем callback для переключения трека
          if (this.onCrossfadeComplete) {
            this.onCrossfadeComplete()
          }
          
          // Следующий трек становится текущим
          this.currentAudio = this.nextAudio
          this.nextAudio = null
          this.isFading = false
          this.onCrossfadeComplete = null
          
          resolve()
        }
      }, interval)
    })
  }

  /**
   * Применение easing функции
   */
  private applyEasing(progress: number, easing: string): number {
    switch (easing) {
      case 'linear':
        return progress
      
      case 'ease-in':
        return progress * progress
      
      case 'ease-out':
        return progress * (2 - progress)
      
      case 'ease-in-out':
        return progress < 0.5
          ? 2 * progress * progress
          : -1 + (4 - 2 * progress) * progress
      
      default:
        return progress
    }
  }

  /**
   * Проверка готовности к crossfade
   */
  public isReady(): boolean {
    return this.currentAudio !== null && this.nextAudio !== null && !this.isFading
  }

  /**
   * Сброс состояния
   */
  public reset() {
    if (this.nextAudio) {
      this.nextAudio.pause()
      this.nextAudio.src = ''
      this.nextAudio = null
    }
    this.isFading = false
    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout)
      this.fadeTimeout = null
    }
  }

  /**
   * Очистка при уничтожении
   */
  public destroy() {
    this.reset()
    this.currentAudio = null
    this.onCrossfadeComplete = null
  }
}

/**
 * Singleton экземпляр сервиса
 */
export const crossfadeService = new CrossfadeService()

/**
 * Хук для использования crossfade в React компонентах
 */
export function useCrossfade() {
  return {
    service: crossfadeService,
    isFading: crossfadeService.isFading,
    isReady: crossfadeService.isReady.bind(crossfadeService),
    configure: crossfadeService.configure.bind(crossfadeService),
    prepareNextTrack: crossfadeService.prepareNextTrack.bind(crossfadeService),
    crossfade: crossfadeService.crossfade.bind(crossfadeService),
    reset: crossfadeService.reset.bind(crossfadeService),
  }
}
