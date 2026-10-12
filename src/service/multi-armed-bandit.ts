/**
 * Multi-Armed Bandit (MAB) РґР»СЏ РјСѓР·С‹РєР°Р»СЊРЅС‹С… СЂРµРєРѕРјРµРЅРґР°С†РёР№
 * 
 * Р РµР°Р»РёР·СѓРµС‚ Р±Р°Р»Р°РЅСЃ exploration/exploitation РєР°Рє РІ РЇРЅРґРµРєСЃ РњСѓР·С‹РєРµ
 * 
 * РђР»РіРѕСЂРёС‚РјС‹:
 * 1. Epsilon-Greedy вЂ” СЃ РІРµСЂРѕСЏС‚РЅРѕСЃС‚СЊСЋ Оµ РёСЃСЃР»РµРґСѓРµРј, РёРЅР°С‡Рµ СЌРєСЃРїР»СѓР°С‚РёСЂСѓРµРј Р»СѓС‡С€РёР№
 * 2. Thompson Sampling вЂ” Р±Р°Р№РµСЃРѕРІСЃРєРёР№ РїРѕРґС…РѕРґ СЃ Р±РµС‚Р°-СЂР°СЃРїСЂРµРґРµР»РµРЅРёРµРј
 * 3. UCB (Upper Confidence Bound) вЂ” СѓС‡РёС‚С‹РІР°РµС‚ РЅРµРѕРїСЂРµРґРµР»С‘РЅРЅРѕСЃС‚СЊ
 * 
 * Arms (СЂСѓС‡РєРё Р±Р°РЅРґРёС‚Р°):
 * - РђСЂС‚РёСЃС‚С‹ (РєР°Р¶РґС‹Р№ Р°СЂС‚РёСЃС‚ = РѕС‚РґРµР»СЊРЅР°СЏ СЂСѓРєР°)
 * - Р–Р°РЅСЂС‹ (РєР°Р¶РґС‹Р№ Р¶Р°РЅСЂ = РѕС‚РґРµР»СЊРЅР°СЏ СЂСѓРєР°)
 * - Р”РµСЃСЏС‚РёР»РµС‚РёСЏ (80s, 90s, 2000s...)
 * - РќР°СЃС‚СЂРѕРµРЅРёСЏ (calm, energetic, happy, sad...)
 * 
 * РљРѕРЅС‚РµРєСЃС‚:
 * - Р’СЂРµРјСЏ СЃСѓС‚РѕРє (СѓС‚СЂРѕ/РґРµРЅСЊ/РІРµС‡РµСЂ/РЅРѕС‡СЊ)
 * - Р”РµРЅСЊ РЅРµРґРµР»Рё (Р±СѓРґРЅРё/РІС‹С…РѕРґРЅС‹Рµ)
 * - РСЃС‚РѕСЂРёСЏ СЃРµСЃСЃРёРё (С‡С‚Рѕ СѓР¶Рµ РёРіСЂР°Р»Рѕ)
 * - РќР°СЃС‚СЂРѕРµРЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (РЅР° РѕСЃРЅРѕРІРµ Р»Р°Р№РєРѕРІ/СЃРєРёРїРѕРІ)
 * 
 * РќР°РіСЂР°РґР° (Reward):
 * - Р›Р°Р№Рє: +10
 * - РџРѕР»РЅРѕРµ РїСЂРѕСЃР»СѓС€РёРІР°РЅРёРµ (>90%): +5
 * - Р РµРїР»РµР№: +15
 * - РЎРєРёРї < 30 СЃРµРє: -5
 * - РЎРєРёРї > 30 СЃРµРє: -2
 * - Р”РёР·Р»Р°Р№Рє: -10
 */

export interface MABArm {
  id: string           // artistId, genre, decade...
  type: 'artist' | 'genre' | 'decade' | 'mood'
  name: string         // Р”Р»СЏ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ
  totalPlays: number   // РЎРєРѕР»СЊРєРѕ СЂР°Р· РїРѕРєР°Р·С‹РІР°Р»РѕСЃСЊ
  totalRewards: number // РЎСѓРјРјР° РІСЃРµС… РЅР°РіСЂР°Рґ
  avgReward: number    // РЎСЂРµРґРЅСЏСЏ РЅР°РіСЂР°РґР°
  lastPlayed: number   // Timestamp РїРѕСЃР»РµРґРЅРµРіРѕ РїРѕРєР°Р·Р°
}

export interface MABContext {
  timeOfDay: 'morning' | 'day' | 'evening' | 'night'
  dayOfWeek: 'weekday' | 'weekend'
  sessionHistory: string[]  // IDs С‚СЂРµРєРѕРІ РєРѕС‚РѕСЂС‹Рµ СѓР¶Рµ РёРіСЂР°Р»Рё РІ СЃРµСЃСЃРёРё
  recentMood: 'positive' | 'negative' | 'neutral'  // РќР°СЃС‚СЂРѕРµРЅРёРµ СЃРµСЃСЃРёРё
  hour: number         // РўРµРєСѓС‰РёР№ С‡Р°СЃ (0-23)
}

export interface MABStats {
  totalArms: number
  bestArm: string | null
  explorationRate: number  // РўРµРєСѓС‰РёР№ % exploration
  totalPulls: number
  avgReward: number
  strategy: 'epsilon-greedy' | 'thompson-sampling' | 'ucb'
}

export interface MABConfig {
  epsilon: number        // Р’РµСЂРѕСЏС‚РЅРѕСЃС‚СЊ exploration (0.0 - 1.0). Default: 0.15
  decayRate: number      // РЎРєРѕСЂРѕСЃС‚СЊ СѓРјРµРЅСЊС€РµРЅРёСЏ epsilon. Default: 0.995
  minEpsilon: number     // РњРёРЅРёРјР°Р»СЊРЅС‹Р№ epsilon. Default: 0.05
  strategy: 'epsilon-greedy' | 'thompson-sampling' | 'ucb'
  contextEnabled: boolean  // РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РєРѕРЅС‚РµРєСЃС‚РЅС‹Рµ Р±Р°РЅРґРёС‚С‹. Default: true
  explorationBoostNewArms: number  // Р‘СѓСЃС‚ РґР»СЏ РЅРѕРІС‹С… СЂСѓРє. Default: 5.0
}

const DEFAULT_CONFIG: MABConfig = {
  epsilon: 0.15,         // 15% exploration вЂ” РєР°Рє РІ РЇРЅРґРµРєСЃ РњСѓР·С‹РєРµ
  decayRate: 0.995,      // РњРµРґР»РµРЅРЅРѕРµ СѓРјРµРЅСЊС€РµРЅРёРµ exploration
  minEpsilon: 0.05,      // РњРёРЅРёРјСѓРј 5% РІСЃРµРіРґР° РёСЃСЃР»РµРґСѓРµРј
  strategy: 'epsilon-greedy',
  contextEnabled: true,
  explorationBoostNewArms: 5.0,
}

// РҐСЂР°РЅРёР»РёС‰Рµ СЃС‚Р°С‚РёСЃС‚РёРєРё РїРѕ arm + РєРѕРЅС‚РµРєСЃС‚
interface MABArmContextStats {
  arm: MABArm
  contextRewards: Record<string, number[]>  // contextKey -> РјР°СЃСЃРёРІ РЅР°РіСЂР°Рґ
}

/**
 * Multi-Armed Bandit Service
 * 
 * РЈРїСЂР°РІР»СЏРµС‚ exploration/exploitation РґР»СЏ РјСѓР·С‹РєР°Р»СЊРЅС‹С… СЂРµРєРѕРјРµРЅРґР°С†РёР№
 */
class MultiArmedBandit {
  private arms: Map<string, MABArmContextStats> = new Map()
  private config: MABConfig
  private totalPulls: number = 0
  private sessionPulls: number = 0
  private sessionRewards: number[] = []

  constructor(config?: Partial<MABConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.loadFromStorage()
    console.log(`[MAB] Initialized with strategy: ${this.config.strategy}, epsilon: ${this.config.epsilon}`)
  }

  // ============================================
  // РџРЈР‘Р›РР§РќР«Р• РњР•РўРћР”Р«
  // ============================================

  /**
   * Р’С‹Р±СЂР°С‚СЊ arm (СЂСѓС‡РєСѓ Р±Р°РЅРґРёС‚Р°) РґР»СЏ С‚РµРєСѓС‰РµРіРѕ РєРѕРЅС‚РµРєСЃС‚Р°
   * 
   * @param arms - РЎРїРёСЃРѕРє РґРѕСЃС‚СѓРїРЅС‹С… СЂСѓРє
   * @param context - РљРѕРЅС‚РµРєСЃС‚ (РІСЂРµРјСЏ, РґРµРЅСЊ РЅРµРґРµР»Рё, РёСЃС‚РѕСЂРёСЏ...)
   * @returns Р’С‹Р±СЂР°РЅРЅС‹Р№ arm
   */
  selectArm(arms: MABArm[], context: MABContext): MABArm {
    if (arms.length === 0) {
      throw new Error('[MAB] No arms available')
    }

    if (arms.length === 1) {
      return arms[0]  // РўРѕР»СЊРєРѕ РѕРґРёРЅ РІР°СЂРёР°РЅС‚
    }

    // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј РЅРѕРІС‹Рµ arms
    arms.forEach(arm => this.initArmIfNew(arm))

    // РџСЂРёРјРµРЅСЏРµРј decay Рє epsilon
    this.decayEpsilon()

    const selectedArm = this.config.strategy === 'epsilon-greedy'
      ? this.epsilonGreedySelect(arms, context)
      : this.config.strategy === 'thompson-sampling'
      ? this.thompsonSamplingSelect(arms, context)
      : this.ucbSelect(arms, context)

    // РћР±РЅРѕРІР»СЏРµРј СЃС‚Р°С‚РёСЃС‚РёРєСѓ
    this.updateArmStats(selectedArm.id, context)
    this.totalPulls++
    this.sessionPulls++

    console.log(`[MAB] Selected arm: ${selectedArm.name} (${selectedArm.type}), strategy: ${this.config.strategy}, exploration: ${(this.getCurrentEpsilon() * 100).toFixed(1)}%`)

    return selectedArm
  }

  /**
   * РџРѕР»СѓС‡РёС‚СЊ РЅР°РіСЂР°РґСѓ Р·Р° РґРµР№СЃС‚РІРёРµ
   * 
   * @param armId - ID СЂСѓРєРё
   * @param reward - РќР°РіСЂР°РґР° (+10 Р»Р°Р№Рє, -5 СЃРєРёРї...)
   * @param context - РљРѕРЅС‚РµРєСЃС‚ РґРµР№СЃС‚РІРёСЏ
   */
  recordReward(armId: string, reward: number, context: MABContext, armType: 'artist' | 'genre' = 'artist', armName?: string) {
    // РђРІС‚Рѕ-РёРЅРёС†РёР°Р»РёР·Р°С†РёСЏ РµСЃР»Рё arm РµС‰С‘ РЅРµ СЃСѓС‰РµСЃС‚РІСѓРµС‚
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

    // РћР±РЅРѕРІР»СЏРµРј РѕР±С‰СѓСЋ СЃС‚Р°С‚РёСЃС‚РёРєСѓ СЂСѓРєРё
    armStats.arm.totalRewards += reward
    armStats.arm.totalPlays++
    armStats.arm.avgReward = armStats.arm.totalPlays > 0
      ? armStats.arm.totalRewards / armStats.arm.totalPlays
      : 0
    armStats.arm.lastPlayed = Date.now()

    // РћР±РЅРѕРІР»СЏРµРј РєРѕРЅС‚РµРєСЃС‚РЅСѓСЋ СЃС‚Р°С‚РёСЃС‚РёРєСѓ
    const contextKey = this.getContextKey(context)
    if (!armStats.contextRewards[contextKey]) {
      armStats.contextRewards[contextKey] = []
    }
    armStats.contextRewards[contextKey].push(reward)

    // РЎРµСЃСЃРёРѕРЅРЅР°СЏ СЃС‚Р°С‚РёСЃС‚РёРєР°
    this.sessionRewards.push(reward)

    console.log(`[MAB] Reward: ${reward > 0 ? '+' : ''}${reward} for arm ${armStats.arm.name} (context: ${contextKey})`)

    this.saveToStorage()
  }

  /**
   * РџРѕР»СѓС‡РёС‚СЊ С‚РµРєСѓС‰РёР№ epsilon (РІРµСЂРѕСЏС‚РЅРѕСЃС‚СЊ exploration)
   */
  getCurrentEpsilon(): number {
    return Math.max(this.config.minEpsilon, this.config.epsilon * Math.pow(this.config.decayRate, this.totalPulls))
  }

  /**
   * РџРѕР»СѓС‡РёС‚СЊ СЃС‚Р°С‚РёСЃС‚РёРєСѓ MAB
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
   * РџРѕР»СѓС‡РёС‚СЊ С‚РѕРї arms РїРѕ РЅР°РіСЂР°РґРµ
   */
  getTopArms(count: number = 10): MABArm[] {
    return Array.from(this.arms.values())
      .map(s => s.arm)
      .filter(arm => arm.totalPlays > 0)  // РўРѕР»СЊРєРѕ РѕРїСЂРѕР±РѕРІР°РЅРЅС‹Рµ
      .sort((a, b) => b.avgReward - a.avgReward)
      .slice(0, count)
  }

  /**
   * РџРѕР»СѓС‡РёС‚СЊ arms СЃ РІС‹СЃРѕРєРёРј РїРѕС‚РµРЅС†РёР°Р»РѕРј (РґР»СЏ exploration)
   */
  getHighPotentialArms(count: number = 5): MABArm[] {
    return Array.from(this.arms.values())
      .map(s => s.arm)
      .filter(arm => arm.totalPlays < 5)  // РњР°Р»Рѕ РѕРїСЂРѕР±РѕРІР°РЅРЅС‹Рµ
      .sort((a, b) => a.totalPlays - b.totalPlays)  // РЎРЅР°С‡Р°Р»Р° СЃР°РјС‹Рµ РЅРµРёСЃСЃР»РµРґРѕРІР°РЅРЅС‹Рµ
      .slice(0, count)
  }

  /**
   * РЎР±СЂРѕСЃРёС‚СЊ СЃС‚Р°С‚РёСЃС‚РёРєСѓ (РґР»СЏ РЅРѕРІРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ)
   */
  reset() {
    this.arms.clear()
    this.totalPulls = 0
    this.sessionPulls = 0
    this.sessionRewards = []
    this.config.epsilon = DEFAULT_CONFIG.epsilon
    console.log('[MAB] Stats reset')
  }

  /**
   * РћР±РЅРѕРІРёС‚СЊ РєРѕРЅС„РёРіСѓСЂР°С†РёСЋ
   */
  updateConfig(newConfig: Partial<MABConfig>) {
    this.config = { ...this.config, ...newConfig }
    console.log(`[MAB] Config updated: epsilon=${this.config.epsilon}, strategy=${this.config.strategy}`)
    this.saveToStorage()
  }

  // ============================================
  // РђР›Р“РћР РРўРњР« Р’Р«Р‘РћР Рђ
  // ============================================

  /**
   * Epsilon-Greedy Р°Р»РіРѕСЂРёС‚Рј
   * 
   * РЎ РІРµСЂРѕСЏС‚РЅРѕСЃС‚СЊСЋ Оµ РІС‹Р±РёСЂР°РµРј СЃР»СѓС‡Р°Р№РЅСѓСЋ СЂСѓРєСѓ (exploration)
   * РРЅР°С‡Рµ РІС‹Р±РёСЂР°РµРј Р»СѓС‡С€СѓСЋ СЂСѓРєСѓ РґР»СЏ С‚РµРєСѓС‰РµРіРѕ РєРѕРЅС‚РµРєСЃС‚Р° (exploitation)
   */
  private epsilonGreedySelect(arms: MABArm[], context: MABContext): MABArm {
    const epsilon = this.getCurrentEpsilon()

    // Exploration вЂ” РІС‹Р±РёСЂР°РµРј СЃР»СѓС‡Р°Р№РЅСѓСЋ СЂСѓРєСѓ
    if (Math.random() < epsilon) {
      // Boost РґР»СЏ РЅРѕРІС‹С… СЂСѓРє (РјР°Р»Рѕ plays)
      const newArms = arms.filter(a => a.totalPlays < 3)
      if (newArms.length > 0 && Math.random() < 0.5) {
        console.log('[MAB] Epsilon-Greedy: EXPLORATION (boosting new arms)')
        return newArms[Math.floor(Math.random() * newArms.length)]
      }

      console.log('[MAB] Epsilon-Greedy: EXPLORATION (random arm)')
      return arms[Math.floor(Math.random() * arms.length)]
    }

    // Exploitation вЂ” РІС‹Р±РёСЂР°РµРј Р»СѓС‡С€СѓСЋ СЂСѓРєСѓ РґР»СЏ РєРѕРЅС‚РµРєСЃС‚Р°
    const bestArm = this.getBestArmForContext(arms, context)
    console.log('[MAB] Epsilon-Greedy: EXPLOITATION (best arm)')
    return bestArm
  }

  /**
   * Thompson Sampling Р°Р»РіРѕСЂРёС‚Рј
   * 
   * Р”Р»СЏ РєР°Р¶РґРѕР№ СЂСѓРєРё РїРѕРґРґРµСЂР¶РёРІР°РµРј Р±РµС‚Р°-СЂР°СЃРїСЂРµРґРµР»РµРЅРёРµ
   * Р’С‹Р±РёСЂР°РµРј СЂСѓРєСѓ СЃ РјР°РєСЃРёРјР°Р»СЊРЅС‹Рј СЃСЌРјРїР»РёСЂРѕРІР°РЅРЅС‹Рј Р·РЅР°С‡РµРЅРёРµРј
   * 
   * Р›СѓС‡С€Рµ С‡РµРј Epsilon-Greedy РґР»СЏ РєРѕРЅС‚РµРєСЃС‚РЅС‹С… Р±Р°РЅРґРёС‚РѕРІ
   */
  private thompsonSamplingSelect(arms: MABArm[], context: MABContext): MABArm {
    const contextKey = this.getContextKey(context)

    // Р”Р»СЏ РєР°Р¶РґРѕР№ СЂСѓРєРё СЃСЌРјРїР»РёСЂСѓРµРј РёР· Р±РµС‚Р°-СЂР°СЃРїСЂРµРґРµР»РµРЅРёСЏ
    const sampledValues = arms.map(arm => {
      const armStats = this.arms.get(arm.id)
      if (!armStats) return { arm, value: 0 }

      // РџРѕР»СѓС‡Р°РµРј РЅР°РіСЂР°РґС‹ РґР»СЏ СЌС‚РѕРіРѕ РєРѕРЅС‚РµРєСЃС‚Р°
      const contextRewards = armStats.contextRewards[contextKey] || []
      
      // РљРѕРЅРІРµСЂС‚РёСЂСѓРµРј РЅР°РіСЂР°РґС‹ РІ success/failure РґР»СЏ Р±РµС‚Р°-СЂР°СЃРїСЂРµРґРµР»РµРЅРёСЏ
      const successes = contextRewards.filter(r => r > 0).length + 1  // +1 prior
      const failures = Math.max(1, contextRewards.filter(r => r <= 0).length + 1)  // +1 prior

      // РЎСЌРјРїР»РёСЂСѓРµРј РёР· Р±РµС‚Р°-СЂР°СЃРїСЂРµРґРµР»РµРЅРёСЏ (СѓРїСЂРѕС‰С‘РЅРЅРѕ С‡РµСЂРµР· gamma)
      const value = this.sampleBeta(successes, failures)

      return { arm, value }
    })

    // Р’С‹Р±РёСЂР°РµРј arm СЃ РјР°РєСЃРёРјР°Р»СЊРЅС‹Рј СЃСЌРјРїР»РёСЂРѕРІР°РЅРЅС‹Рј Р·РЅР°С‡РµРЅРёРµРј
    const selected = sampledValues.reduce((best, current) =>
      current.value > best.value ? current : best
    )

    console.log(`[MAB] Thompson Sampling: selected ${selected.arm.name}, value: ${selected.value.toFixed(3)}`)
    return selected.arm
  }

  /**
   * UCB (Upper Confidence Bound) Р°Р»РіРѕСЂРёС‚Рј
   * 
   * Р’С‹Р±РёСЂР°РµС‚ arm СЃ РјР°РєСЃРёРјР°Р»СЊРЅС‹Рј UCB score:
   * UCB = avgReward + C * sqrt(ln(totalPulls) / armPulls)
   * 
   * C вЂ” parameter exploration/exploitation tradeoff
   */
  private ucbSelect(arms: MABArm[], _context: MABContext): MABArm {
    const c = this.config.explorationBoostNewArms

    const ucbScores = arms.map(arm => {
      const armStats = this.arms.get(arm.id)
      if (!armStats || armStats.arm.totalPlays === 0) {
        // РќРµРёСЃСЃР»РµРґРѕРІР°РЅРЅС‹Рµ СЂСѓРєРё РїРѕР»СѓС‡Р°СЋС‚ РјР°РєСЃРёРјР°Р»СЊРЅС‹Р№ score
        return { arm, score: Infinity }
      }

      const avgReward = armStats.arm.avgReward
      const explorationBonus = c * Math.sqrt(Math.log(this.totalPulls + 1) / armStats.arm.totalPlays)

      return {
        arm,
        score: avgReward + explorationBonus,
      }
    })

    // Р’С‹Р±РёСЂР°РµРј arm СЃ РјР°РєСЃРёРјР°Р»СЊРЅС‹Рј UCB score
    const selected = ucbScores.reduce((best, current) =>
      current.score > best.score ? current : best
    )

    console.log(`[MAB] UCB: selected ${selected.arm.name}, score: ${selected.score.toFixed(3)}, avgReward: ${selected.arm.avgReward.toFixed(2)}`)
    return selected.arm
  }

  // ============================================
  // Р’РЎРџРћРњРћР“РђРўР•Р›Р¬РќР«Р• РњР•РўРћР”Р«
  // ============================================

  /**
   * РџРѕР»СѓС‡РёС‚СЊ Р»СѓС‡С€СѓСЋ СЂСѓРєСѓ РґР»СЏ С‚РµРєСѓС‰РµРіРѕ РєРѕРЅС‚РµРєСЃС‚Р°
   */
  private getBestArmForContext(arms: MABArm[], context: MABContext): MABArm {
    const contextKey = this.getContextKey(context)

    const armScores = arms.map(arm => {
      const armStats = this.arms.get(arm.id)
      if (!armStats || armStats.arm.totalPlays === 0) {
        return { arm, score: 0 }
      }

      // РСЃРїРѕР»СЊР·СѓРµРј РєРѕРЅС‚РµРєСЃС‚РЅСѓСЋ РЅР°РіСЂР°РґСѓ РµСЃР»Рё РµСЃС‚СЊ
      const contextRewards = armStats.contextRewards[contextKey] || []
      const contextAvgReward = contextRewards.length > 0
        ? contextRewards.reduce((sum, r) => sum + r, 0) / contextRewards.length
        : armStats.arm.avgReward  // Fallback Рє РѕР±С‰РµР№ РЅР°РіСЂР°РґРµ

      // Р”РѕР±Р°РІР»СЏРµРј boost РґР»СЏ РЅРѕРІС‹С… СЂСѓРє
      const newArmBoost = arm.totalPlays < 3 ? this.config.explorationBoostNewArms : 0

      return {
        arm,
        score: contextAvgReward + newArmBoost,
      }
    })

    // Р’С‹Р±РёСЂР°РµРј arm СЃ РјР°РєСЃРёРјР°Р»СЊРЅС‹Рј score
    return armScores.reduce((best, current) =>
      current.score > best.score ? current : best
    ).arm
  }

  /**
   * РЎРѕР·РґР°С‚СЊ РєР»СЋС‡ РєРѕРЅС‚РµРєСЃС‚Р° РґР»СЏ РіСЂСѓРїРїРёСЂРѕРІРєРё СЃС‚Р°С‚РёСЃС‚РёРєРё
   */
  private getContextKey(context: MABContext): string {
    return `${context.timeOfDay}-${context.dayOfWeek}`
  }

  /**
   * РРЅРёС†РёР°Р»РёР·РёСЂРѕРІР°С‚СЊ arm РµСЃР»Рё РµС‰С‘ РЅРµ СЃСѓС‰РµСЃС‚РІСѓРµС‚
   */
  private initArmIfNew(arm: MABArm) {
    if (!this.arms.has(arm.id)) {
      this.arms.set(arm.id, {
        arm,
        contextRewards: {},
      })
      console.log(`[MAB] New arm initialized: ${arm.name} (${arm.type})`)
    }
  }

  /**
   * РћР±РЅРѕРІРёС‚СЊ СЃС‚Р°С‚РёСЃС‚РёРєСѓ РІС‹Р±СЂР°РЅРЅРѕР№ СЂСѓРєРё
   */
  private updateArmStats(armId: string, _context: MABContext) {
    const armStats = this.arms.get(armId)
    if (armStats) {
      armStats.arm.lastPlayed = Date.now()
    }
  }

  /**
   * Decay epsilon вЂ” РїРѕСЃС‚РµРїРµРЅРЅРѕРµ СѓРјРµРЅСЊС€РµРЅРёРµ exploration
   */
  private decayEpsilon() {
    this.config.epsilon = Math.max(
      this.config.minEpsilon,
      this.config.epsilon * this.config.decayRate
    )
  }

  /**
   * РЎСЌРјРїР»РёСЂРѕРІР°С‚СЊ РёР· Р±РµС‚Р°-СЂР°СЃРїСЂРµРґРµР»РµРЅРёСЏ (СѓРїСЂРѕС‰С‘РЅРЅРѕ)
   * 
   * РСЃРїРѕР»СЊР·СѓРµРј gamma distribution approximation
   * Beta(a, b) = Gamma(a, 1) / (Gamma(a, 1) + Gamma(b, 1))
   */
  private sampleBeta(alpha: number, beta: number): number {
    // РЈРїСЂРѕС‰С‘РЅРЅР°СЏ Р°РїРїСЂРѕРєСЃРёРјР°С†РёСЏ С‡РµСЂРµР· РЅРѕСЂРјР°Р»СЊРЅРѕРµ СЂР°СЃРїСЂРµРґРµР»РµРЅРёРµ
    // Р”Р»СЏ production Р»СѓС‡С€Рµ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ РЅР°СЃС‚РѕСЏС‰СѓСЋ gamma distribution
    const mean = alpha / (alpha + beta)
    const variance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1))
    const stdDev = Math.sqrt(variance)

    // Р“РµРЅРµСЂРёСЂСѓРµРј РЅРѕСЂРјР°Р»СЊРЅРѕРµ Р·РЅР°С‡РµРЅРёРµ СЃ mean Рё stdDev
    const u1 = Math.random()
    const u2 = Math.random()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

    return Math.max(0, Math.min(1, mean + z * stdDev))
  }

  // ============================================
  // РџР•Р РЎРРЎРўР•РќР¦РРЇ
  // ============================================

  /**
   * РЎРѕС…СЂР°РЅРёС‚СЊ РІ localStorage
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
   * Р—Р°РіСЂСѓР·РёС‚СЊ РёР· localStorage
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
 * РџРѕР»СѓС‡РёС‚СЊ С‚РµРєСѓС‰РёР№ РєРѕРЅС‚РµРєСЃС‚ РґР»СЏ MAB
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
    sessionHistory: [],  // Р—Р°РїРѕР»РЅСЏРµС‚СЃСЏ РёР· С‚РµРєСѓС‰РµР№ СЃРµСЃСЃРёРё
    recentMood: 'neutral',  // РћР±РЅРѕРІР»СЏРµС‚СЃСЏ РЅР° РѕСЃРЅРѕРІРµ Р»Р°Р№РєРѕРІ/СЃРєРёРїРѕРІ
    hour,
  }
}

/**
 * Р’С‹С‡РёСЃР»РёС‚СЊ РЅР°РіСЂР°РґСѓ РЅР° РѕСЃРЅРѕРІРµ РґРµР№СЃС‚РІРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
 */
export function calculateReward(action: 'like' | 'dislike' | 'skip_early' | 'skip_late' | 'full_play' | 'replay'): number {
  const rewards = {
    like: 10,
    dislike: -10,
    skip_early: -5,   // РЎРєРёРї < 30 СЃРµРєСѓРЅРґ
    skip_late: -2,    // РЎРєРёРї > 30 СЃРµРєСѓРЅРґ
    full_play: 5,     // РџСЂРѕСЃР»СѓС€Р°Р» > 90%
    replay: 15,       // Р’РєР»СЋС‡РёР» РїРѕРІС‚РѕСЂРЅРѕ
  }

  return rewards[action]
}

/**
 * РљРѕРЅРІРµСЂС‚РёСЂРѕРІР°С‚СЊ С‚СЂРµРєРё РІ arms РґР»СЏ MAB
 */
export function tracksToArms(tracks: any[], armType: MABArm['type']): MABArm[] {
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
