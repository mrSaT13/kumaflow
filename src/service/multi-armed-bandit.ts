/**
 * Multi-Armed Bandit (MAB) для музыкальных рекомендаций
 * 
 * Реализует баланс exploration/exploitation как в Яндекс Музыке
 * 
 * Алгоритмы:
 * 1. Epsilon-Greedy — с вероятностью ε исследуем, иначе эксплуатируем лучший
 * 2. Thompson Sampling — байесовский подход с бета-распределением
 * 3. UCB (Upper Confidence Bound) — учитывает неопределённость
 * 
 * Arms (ручки бандита):
 * - Артисты (каждый артист = отдельная рука)
 * - Жанры (каждый жанр = отдельная рука)
 * - Десятилетия (80s, 90s, 2000s...)
 * - Настроения (calm, energetic, happy, sad...)
 * 
 * Контекст:
 * - Время суток (утро/день/вечер/ночь)
 * - День недели (будни/выходные)
 * - История сессии (что уже играло)
 * - Настроение пользователя (на основе лайков/скипов)
 * 
 * Награда (Reward):
 * - Лайк: +10
 * - Полное прослушивание (>90%): +5
 * - Реплей: +15
 * - Скип < 30 сек: -5
 * - Скип > 30 сек: -2
 * - Дизлайк: -10
 */

export interface MABArm {
  id: string           // artistId, genre, decade...
  type: 'artist' | 'genre' | 'decade' | 'mood'
  name: string         // Для отображения
  totalPlays: number   // Сколько раз показывалось
  totalRewards: number // Сумма всех наград
  avgReward: number    // Средняя награда
  lastPlayed: number   // Timestamp последнего показа
}

export interface MABContext {
  timeOfDay: 'morning' | 'day' | 'evening' | 'night'
  dayOfWeek: 'weekday' | 'weekend'
  sessionHistory: string[]  // IDs треков которые уже играли в сессии
  recentMood: 'positive' | 'negative' | 'neutral'  // Настроение сессии
  hour: number         // Текущий час (0-23)
}

export interface MABStats {
  totalArms: number
  bestArm: string | null
  explorationRate: number  // Текущий % exploration
  totalPulls: number
  avgReward: number
  strategy: 'epsilon-greedy' | 'thompson-sampling' | 'ucb'
}

export interface MABConfig {
  epsilon: number        // Вероятность exploration (0.0 - 1.0). Default: 0.15
  decayRate: number      // Скорость уменьшения epsilon. Default: 0.995
  minEpsilon: number     // Минимальный epsilon. Default: 0.05
  strategy: 'epsilon-greedy' | 'thompson-sampling' | 'ucb'
  contextEnabled: boolean  // Использовать контекстные бандиты. Default: true
  explorationBoostNewArms: number  // Буст для новых рук. Default: 5.0
}

const DEFAULT_CONFIG: MABConfig = {
  epsilon: 0.15,         // 15% exploration — как в Яндекс Музыке
  decayRate: 0.995,      // Медленное уменьшение exploration
  minEpsilon: 0.05,      // Минимум 5% всегда исследуем
  strategy: 'epsilon-greedy',
  contextEnabled: true,
  explorationBoostNewArms: 5.0,
}

// Хранилище статистики по arm + контекст
interface MABArmContextStats {
  arm: MABArm
  contextRewards: Record<string, number[]>  // contextKey -> массив наград
}

/**
 * Multi-Armed Bandit Service
 * 
 * Управляет exploration/exploitation для музыкальных рекомендаций
 */
class MultiArmedBandit {
  private arms: Map<string, MABArmContextStats> = new Map()
  private config: MABConfig
  private totalPulls: number = 0
  private sessionPulls: number = 0
  private sessionRewards: number[] = []
  private contextHistory: string[] = []

  constructor(config?: Partial<MABConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.loadFromStorage()
    console.log(`[MAB] Initialized with strategy: ${this.config.strategy}, epsilon: ${this.config.epsilon}`)
  }

  // ============================================
  // ПУБЛИЧНЫЕ МЕТОДЫ
  // ============================================

  /**
   * Выбрать arm (ручку бандита) для текущего контекста
   * 
   * @param arms - Список доступных рук
   * @param context - Контекст (время, день недели, история...)
   * @returns Выбранный arm
   */
  selectArm(arms: MAB[], context: MABContext): MAB {
    if (arms.length === 0) {
      throw new Error('[MAB] No arms available')
    }

    if (arms.length === 1) {
      return arms[0]  // Только один вариант
    }

    // Инициализируем новые arms
    arms.forEach(arm => this.initArmIfNew(arm))

    // Применяем decay к epsilon
    this.decayEpsilon()

    const selectedArm = this.config.strategy === 'epsilon-greedy'
      ? this.epsilonGreedySelect(arms, context)
      : this.config.strategy === 'thompson-sampling'
      ? this.thompsonSamplingSelect(arms, context)
      : this.ucbSelect(arms, context)

    // Обновляем статистику
    this.updateArmStats(selectedArm.id, context)
    this.totalPulls++
    this.sessionPulls++

    console.log(`[MAB] Selected arm: ${selectedArm.name} (${selectedArm.type}), strategy: ${this.config.strategy}, exploration: ${(this.getCurrentEpsilon() * 100).toFixed(1)}%`)

    return selectedArm
  }

  /**
   * Получить награду за действие
   * 
   * @param armId - ID руки
   * @param reward - Награда (+10 лайк, -5 скип...)
   * @param context - Контекст действия
   */
  recordReward(armId: string, reward: number, context: MABContext, armType: 'artist' | 'genre' = 'artist', armName?: string) {
    // Авто-инициализация если arm ещё не существует
    if (!this.arms.has(armId)) {
      this.arms.set(armId, {
        arm: {
          id: armId,
          type: armType,
          name: armName || armId,
          totalPlays: 0,
          totalRewards: 0,
          avgReward: 0,
          lastPlayed: 0,
        },
        contextRewards: {},
      })
      // console.log(`[MAB] Auto-initialized arm: ${armName || armId} (${armType})`)
    }

    const armStats = this.arms.get(armId)!

    // Обновляем общую статистику руки
    armStats.arm.totalRewards += reward
    armStats.arm.totalPlays++
    armStats.arm.avgReward = armStats.arm.totalPlays > 0
      ? armStats.arm.totalRewards / armStats.arm.totalPlays
      : 0
    armStats.arm.lastPlayed = Date.now()

    // Обновляем контекстную статистику
    const contextKey = this.getContextKey(context)
    if (!armStats.contextRewards[contextKey]) {
      armStats.contextRewards[contextKey] = []
    }
    armStats.contextRewards[contextKey].push(reward)

    // Сессионная статистика
    this.sessionRewards.push(reward)

    console.log(`[MAB] Reward: ${reward > 0 ? '+' : ''}${reward} for arm ${armStats.arm.name} (context: ${contextKey})`)

    this.saveToStorage()
  }

  /**
   * Получить текущий epsilon (вероятность exploration)
   */
  getCurrentEpsilon(): number {
    return Math.max(this.config.minEpsilon, this.config.epsilon * Math.pow(this.config.decayRate, this.totalPulls))
  }

  /**
   * Получить статистику MAB
   */
  getStats(): MABStats {
    const allArms = Array.from(this.arms.values()).map(s => s.arm)
    const bestArm = allArms.length > 0
      ? allArms.reduce((best, arm) => arm.avgReward > best.avgReward ? arm : best)
      : null

    const avgReward = allArms.length > 0
      ? allArms.reduce((sum, arm) => sum + arm.avgReward, 0) / allArms.length
      : 0

    return {
      totalArms: allArms.length,
      bestArm: bestArm?.name || null,
      explorationRate: this.getCurrentEpsilon(),
      totalPulls: this.totalPulls,
      avgReward,
      strategy: this.config.strategy,
    }
  }

  /**
   * Получить топ arms по награде
   */
  getTopArms(count: number = 10): MABArm[] {
    return Array.from(this.arms.values())
      .map(s => s.arm)
      .filter(arm => arm.totalPlays > 0)  // Только опробованные
      .sort((a, b) => b.avgReward - a.avgReward)
      .slice(0, count)
  }

  /**
   * Получить arms с высоким потенциалом (для exploration)
   */
  getHighPotentialArms(count: number = 5): MABArm[] {
    return Array.from(this.arms.values())
      .map(s => s.arm)
      .filter(arm => arm.totalPlays < 5)  // Мало опробованные
      .sort((a, b) => a.totalPlays - b.totalPlays)  // Сначала самые неисследованные
      .slice(0, count)
  }

  /**
   * Сбросить статистику (для нового пользователя)
   */
  reset() {
    this.arms.clear()
    this.totalPulls = 0
    this.sessionPulls = 0
    this.sessionRewards = []
    this.contextHistory = []
    this.config.epsilon = DEFAULT_CONFIG.epsilon
    console.log('[MAB] Stats reset')
  }

  /**
   * Обновить конфигурацию
   */
  updateConfig(newConfig: Partial<MABConfig>) {
    this.config = { ...this.config, ...newConfig }
    console.log(`[MAB] Config updated: epsilon=${this.config.epsilon}, strategy=${this.config.strategy}`)
    this.saveToStorage()
  }

  // ============================================
  // АЛГОРИТМЫ ВЫБОРА
  // ============================================

  /**
   * Epsilon-Greedy алгоритм
   * 
   * С вероятностью ε выбираем случайную руку (exploration)
   * Иначе выбираем лучшую руку для текущего контекста (exploitation)
   */
  private epsilonGreedySelect(arms: MAB[], context: MABContext): MAB {
    const epsilon = this.getCurrentEpsilon()

    // Exploration — выбираем случайную руку
    if (Math.random() < epsilon) {
      // Boost для новых рук (мало plays)
      const newArms = arms.filter(a => a.totalPlays < 3)
      if (newArms.length > 0 && Math.random() < 0.5) {
        console.log('[MAB] Epsilon-Greedy: EXPLORATION (boosting new arms)')
        return newArms[Math.floor(Math.random() * newArms.length)]
      }

      console.log('[MAB] Epsilon-Greedy: EXPLORATION (random arm)')
      return arms[Math.floor(Math.random() * arms.length)]
    }

    // Exploitation — выбираем лучшую руку для контекста
    const bestArm = this.getBestArmForContext(arms, context)
    console.log('[MAB] Epsilon-Greedy: EXPLOITATION (best arm)')
    return bestArm
  }

  /**
   * Thompson Sampling алгоритм
   * 
   * Для каждой руки поддерживаем бета-распределение
   * Выбираем руку с максимальным сэмплированным значением
   * 
   * Лучше чем Epsilon-Greedy для контекстных бандитов
   */
  private thompsonSamplingSelect(arms: MAB[], context: MABContext): MAB {
    const contextKey = this.getContextKey(context)

    // Для каждой руки сэмплируем из бета-распределения
    const sampledValues = arms.map(arm => {
      const armStats = this.arms.get(arm.id)
      if (!armStats) return { arm, value: 0 }

      // Получаем награды для этого контекста
      const contextRewards = armStats.contextRewards[contextKey] || []
      
      // Конвертируем награды в success/failure для бета-распределения
      const successes = contextRewards.filter(r => r > 0).length + 1  // +1 prior
      const failures = Math.max(1, contextRewards.filter(r => r <= 0).length + 1)  // +1 prior

      // Сэмплируем из бета-распределения (упрощённо через gamma)
      const value = this.sampleBeta(successes, failures)

      return { arm, value }
    })

    // Выбираем arm с максимальным сэмплированным значением
    const selected = sampledValues.reduce((best, current) =>
      current.value > best.value ? current : best
    )

    console.log(`[MAB] Thompson Sampling: selected ${selected.arm.name}, value: ${selected.value.toFixed(3)}`)
    return selected.arm
  }

  /**
   * UCB (Upper Confidence Bound) алгоритм
   * 
   * Выбирает arm с максимальным UCB score:
   * UCB = avgReward + C * sqrt(ln(totalPulls) / armPulls)
   * 
   * C — parameter exploration/exploitation tradeoff
   */
  private ucbSelect(arms: MAB[], context: MABContext): MAB {
    const c = this.config.explorationBoostNewArms

    const ucbScores = arms.map(arm => {
      const armStats = this.arms.get(arm.id)
      if (!armStats || armStats.arm.totalPlays === 0) {
        // Неисследованные руки получают максимальный score
        return { arm, score: Infinity }
      }

      const avgReward = armStats.arm.avgReward
      const explorationBonus = c * Math.sqrt(Math.log(this.totalPulls + 1) / armStats.arm.totalPlays)

      return {
        arm,
        score: avgReward + explorationBonus,
      }
    })

    // Выбираем arm с максимальным UCB score
    const selected = ucbScores.reduce((best, current) =>
      current.score > best.score ? current : best
    )

    console.log(`[MAB] UCB: selected ${selected.arm.name}, score: ${selected.score.toFixed(3)}, avgReward: ${selected.arm.avgReward.toFixed(2)}`)
    return selected.arm
  }

  // ============================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================

  /**
   * Получить лучшую руку для текущего контекста
   */
  private getBestArmForContext(arms: MAB[], context: MABContext): MAB {
    const contextKey = this.getContextKey(context)

    const armScores = arms.map(arm => {
      const armStats = this.arms.get(arm.id)
      if (!armStats || armStats.arm.totalPlays === 0) {
        return { arm, score: 0 }
      }

      // Используем контекстную награду если есть
      const contextRewards = armStats.contextRewards[contextKey] || []
      const contextAvgReward = contextRewards.length > 0
        ? contextRewards.reduce((sum, r) => sum + r, 0) / contextRewards.length
        : armStats.arm.avgReward  // Fallback к общей награде

      // Добавляем boost для новых рук
      const newArmBoost = arm.totalPlays < 3 ? this.config.explorationBoostNewArms : 0

      return {
        arm,
        score: contextAvgReward + newArmBoost,
      }
    })

    // Выбираем arm с максимальным score
    return armScores.reduce((best, current) =>
      current.score > best.score ? current : best
    ).arm
  }

  /**
   * Создать ключ контекста для группировки статистики
   */
  private getContextKey(context: MABContext): string {
    return `${context.timeOfDay}-${context.dayOfWeek}`
  }

  /**
   * Инициализировать arm если ещё не существует
   */
  private initArmIfNew(arm: MAB) {
    if (!this.arms.has(arm.id)) {
      this.arms.set(arm.id, {
        arm,
        contextRewards: {},
      })
      console.log(`[MAB] New arm initialized: ${arm.name} (${arm.type})`)
    }
  }

  /**
   * Обновить статистику выбранной руки
   */
  private updateArmStats(armId: string, context: MABContext) {
    const armStats = this.arms.get(armId)
    if (armStats) {
      armStats.arm.lastPlayed = Date.now()
    }
  }

  /**
   * Decay epsilon — постепенное уменьшение exploration
   */
  private decayEpsilon() {
    this.config.epsilon = Math.max(
      this.config.minEpsilon,
      this.config.epsilon * this.config.decayRate
    )
  }

  /**
   * Сэмплировать из бета-распределения (упрощённо)
   * 
   * Используем gamma distribution approximation
   * Beta(a, b) = Gamma(a, 1) / (Gamma(a, 1) + Gamma(b, 1))
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Упрощённая аппроксимация через нормальное распределение
    // Для production лучше использовать настоящую gamma distribution
    const mean = alpha / (alpha + beta)
    const variance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1))
    const stdDev = Math.sqrt(variance)

    // Генерируем нормальное значение с mean и stdDev
    const u1 = Math.random()
    const u2 = Math.random()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

    return Math.max(0, Math.min(1, mean + z * stdDev))
  }

  // ============================================
  // ПЕРСИСТЕНЦИЯ
  // ============================================

  /**
   * Сохранить в localStorage
   */
  private saveToStorage() {
    try {
      const data = {
        arms: Array.from(this.arms.entries()).map(([id, stats]) => ({
          id,
          arm: stats.arm,
          contextRewards: stats.contextRewards,
        })),
        config: this.config,
        totalPulls: this.totalPulls,
        sessionPulls: this.sessionPulls,
        sessionRewards: this.sessionRewards,
      }
      localStorage.setItem('mab_stats', JSON.stringify(data))
    } catch (e) {
      console.warn('[MAB] Failed to save to storage:', e)
    }
  }

  /**
   * Загрузить из localStorage
   */
  private loadFromStorage() {
    try {
      const data = localStorage.getItem('mab_stats')
      if (data) {
        const parsed = JSON.parse(data)
        this.config = parsed.config || DEFAULT_CONFIG
        this.totalPulls = parsed.totalPulls || 0
        this.sessionPulls = parsed.sessionPulls || 0
        this.sessionRewards = parsed.sessionRewards || []

        this.arms = new Map(
          parsed.arms.map((item: any) => [
            item.id,
            {
              arm: item.arm,
              contextRewards: item.contextRewards,
            }
          ])
        )

        console.log(`[MAB] Loaded ${this.arms.size} arms from storage`)
      }
    } catch (e) {
      console.warn('[MAB] Failed to load from storage:', e)
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Получить текущий контекст для MAB
 */
export function getCurrentMABContext(): MABContext {
  const now = new Date()
  const hour = now.getHours()

  const timeOfDay: MABContext['timeOfDay'] =
    hour >= 6 && hour < 12 ? 'morning' :
    hour >= 12 && hour < 18 ? 'day' :
    hour >= 18 && hour < 23 ? 'evening' :
    'night'

  const dayOfWeek: MABContext['dayOfWeek'] =
    now.getDay() >= 1 && now.getDay() <= 5 ? 'weekday' : 'weekend'

  return {
    timeOfDay,
    dayOfWeek,
    sessionHistory: [],  // Заполняется из текущей сессии
    recentMood: 'neutral',  // Обновляется на основе лайков/скипов
    hour,
  }
}

/**
 * Вычислить награду на основе действия пользователя
 */
export function calculateReward(action: 'like' | 'dislike' | 'skip_early' | 'skip_late' | 'full_play' | 'replay'): number {
  const rewards = {
    like: 10,
    dislike: -10,
    skip_early: -5,   // Скип < 30 секунд
    skip_late: -2,    // Скип > 30 секунд
    full_play: 5,     // Прослушал > 90%
    replay: 15,       // Включил повторно
  }

  return rewards[action]
}

/**
 * Конвертировать треки в arms для MAB
 */
export function tracksToArms(tracks: any[], armType: MABArm['type']): MAB[] {
  const armMap = new Map<string, MABArm>()

  tracks.forEach(track => {
    let armId: string
    let armName: string

    switch (armType) {
      case 'artist':
        armId = track.artistId || track.artist
        armName = track.artist
        break
      case 'genre':
        armId = track.genre?.toLowerCase() || 'unknown'
        armName = track.genre || 'Unknown'
        break
      case 'decade':
        const decade = track.year ? Math.floor(track.year / 10) * 10 : 2020
        armId = `${decade}s`
        armName = `${decade}s`
        break
      case 'mood':
        armId = track.mood?.toLowerCase() || 'neutral'
        armName = track.mood || 'Neutral'
        break
      default:
        armId = track.id
        armName = track.title
    }

    if (!armMap.has(armId)) {
      armMap.set(armId, {
        id: armId,
        type: armType,
        name: armName,
        totalPlays: 0,
        totalRewards: 0,
        avgReward: 0,
        lastPlayed: 0,
      })
    }
  })

  return Array.from(armMap.values())
}

// ============================================
// SINGLETON
// ============================================

export const multiArmedBandit = new MultiArmedBandit()
