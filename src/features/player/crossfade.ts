/**
 * Настоящий кроссфейд: следующий трек играет, пока текущий ещё доигрывает.
 *
 * Раньше «кроссфейдом» назывался fadeIn — громкость поднималась от 30% в
 * начале трека. Перехода между треками не было вообще: fadeIn не умеет
 * накладывать треки, а один <audio> физически не может играть два файла
 * одновременно. Поэтому нужен второй элемент.
 *
 * Схема:
 *   1. основной элемент (React, им владеет player.tsx) доигрывает;
 *   2. компаньон грузит URL следующего трека и играет с нуля;
 *   3. за crossfadeSeconds громкость основного падает в 0, компаньона
 *      поднимается в рабочую;
 *   4. очередь сдвигается, React ставит основному элементу src следующего
 *      трека — и мы ДЕРЖИМ его громкость в нуле;
 *   5. как только основной доиграл до той же позиции (offset), на которую
 *      уже дошёл компаньон, делаем короткий перехват: основной вверх,
 *      компаньон в ноль, компаньон освобождаем.
 *
 * Шаг 5 — ключевой: без него основной элемент начал бы играть тот же трек
 * с нуля поверх компаньона, и звук был бы сдвоенным со сдвигом.
 *
 * Граф AudioContext у каждого элемента свой (WeakMap по элементу), поэтому
 * второй MediaElementSource конфликта не вызывает — конфликт бывает только
 * при повторном источнике на ОДНОМ элементе.
 */

import { crossfadeGains, setGainNow } from './audio-graph'

export interface CrossfadeHooks {
  /** Основной элемент плеера. */
  main(): HTMLAudioElement | null
  /** Рабочая громкость 0..1 — та, что выставил ползунок. */
  baseVolume(): number
  /** URL следующего трека либо null, если следующего нет. */
  nextSrc(): string | null
  /** Сдвинуть очередь (вызывается в момент передачи трека). */
  advance(): void
  /** Сработать ли вообще: не loop, есть следующий трек. */
  enabled(): boolean
}

type Phase = 'idle' | 'preparing' | 'fading' | 'handing-over'

class CrossfadeEngine {
  private companion: HTMLAudioElement | null = null
  private phase: Phase = 'idle'
  private hooks: CrossfadeHooks | null = null
  private seconds = 5
  /** Насколько компаньон ушёл вперёд — с этой позиции продолжит основной. */
  private offset = 0
  private teardown: (() => void) | null = null

  configure(seconds: number) {
    this.seconds = Math.max(0, seconds)
  }

  /** Вешает следилку времени на основной элемент. */
  attach(hooks: CrossfadeHooks): void {
    this.detach()
    this.hooks = hooks

    const listener = () => this.tick()
    const main = hooks.main()
    if (!main) return

    main.addEventListener('timeupdate', listener)
    this.teardown = () => {
      main.removeEventListener('timeupdate', listener)
      this.cancel()
    }
  }

  detach(): void {
    if (this.teardown) this.teardown()
    this.teardown = null
    this.hooks = null
  }

  private ensureCompanion(): HTMLAudioElement {
    if (!this.companion) {
      this.companion = new Audio()
      this.companion.preload = 'auto'
    }
    return this.companion
  }

  /** Основной элемент доиграл до crossfadeSeconds до конца — начинаем. */
  private tick(): void {
    const hooks = this.hooks
    if (!hooks || this.phase !== 'idle') return
    if (this.seconds <= 0.2) return
    if (!hooks.enabled()) return

    const main = hooks.main()
    if (!main || main.paused) return

    const duration = main.duration
    if (!Number.isFinite(duration) || duration <= 0) return

    const remaining = duration - main.currentTime
    // Порог с запасом: слушатель грузится не мгновенно, ждём готовности.
    if (remaining > this.seconds + 1.2) return
    if (remaining <= 0.05) return

    const src = hooks.nextSrc()
    if (!src) return

    void this.start(src)
  }

  private async start(src: string): Promise<void> {
    const hooks = this.hooks
    const main = hooks?.main()
    if (!hooks || !main) return

    this.phase = 'preparing'
    const companion = this.ensureCompanion()

    try {
      setGainNow(companion, 0)

      await new Promise<void>((resolve) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          companion.removeEventListener('canplay', finish)
          companion.removeEventListener('error', finish)
          resolve()
        }
        companion.addEventListener('canplay', finish, { once: true })
        companion.addEventListener('error', finish, { once: true })
        companion.src = src
        companion.load()
        // Если трек короткий и проиграется мгновенно — не ждём вечно.
        setTimeout(finish, 4000)
      })

      if (this.phase !== 'preparing') return
      if (companion.readyState < 2) {
        this.phase = 'idle'
        return
      }

      await companion.play().catch(() => undefined)
      if (this.phase !== 'preparing') return
      if (companion.paused) {
        this.phase = 'idle'
        return
      }

      this.phase = 'fading'
      // Сколько секунд компаньон играет внахлёст — столько же должен
      // пропустить основной, когда получит тот же трек.
      const overlap = Math.min(this.seconds, companion.duration || this.seconds)
      this.offset = Math.max(0, overlap)

      crossfadeGains(main, companion, 0, hooks.baseVolume(), overlap)

      setTimeout(() => this.handOver(), overlap * 1000 + 60)
    } catch {
      this.phase = 'idle'
      this.releaseCompanion()
    }
  }

  /** Передача трека: очередь сдвигается, основной элемент берёт новый src. */
  private handOver(): void {
    const hooks = this.hooks
    const main = hooks?.main()
    if (!hooks || !main || this.phase !== 'fading') return

    this.phase = 'handing-over'
    hooks.advance()

    // Основной сейчас перезагрузится с новым src. Держим его в нуле и ждём,
    // пока он не доиграет до позиции, на которой уже стоит компаньон.
    const catchUp = () => {
      const m = hooks.main()
      if (!m || this.phase !== 'handing-over') return

      if (!Number.isFinite(m.duration) || m.duration <= 0) {
        setTimeout(catchUp, 120)
        return
      }

      // Дослушали позицию компаньона — короткий перехват.
      if (m.currentTime >= this.offset - 0.08) {
        crossfadeGains(m, this.companion, hooks.baseVolume(), 0, 0.35)
        setTimeout(() => {
          this.phase = 'idle'
          this.releaseCompanion()
        }, 450)
        return
      }

      // Ещё не догнал — слушаем дальше.
      m.addEventListener('timeupdate', catchUp, { once: true })
    }

    const m = hooks.main()
    if (m) {
      m.addEventListener('loadedmetadata', () => {
        // Позиция ставится после смены src, иначе элемент её сбросит.
        try {
          m.currentTime = this.offset
        } catch {
          /* метаданных ещё нет */
        }
        setTimeout(catchUp, 80)
      }, { once: true })
    }
  }

  /** Отмена: пользователь переключил трек, пауза, стало нечего играть. */
  cancel(): void {
    if (this.phase === 'idle') return
    this.phase = 'idle'

    const hooks = this.hooks
    const main = hooks?.main()
    if (main && hooks) setGainNow(main, hooks.baseVolume())

    this.releaseCompanion()
  }

  private releaseCompanion(): void {
    const c = this.companion
    if (!c) return
    try {
      c.pause()
      c.removeAttribute('src')
      c.load()
    } catch {
      /* элемент уже мёртв */
    }
  }
}

export const crossfade = new CrossfadeEngine()