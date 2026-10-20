import { useEffect, useMemo, useRef } from 'react'
import { getAnalyserNode } from '@/features/player/audio-graph'
import { createVibe, type VibeInstance } from '@/features/wave/vibe'
import '@/features/wave/vibe.css'
import { cn } from '@/lib/utils'
import { useMLStore } from '@/store/ml.store'
import {
  usePlayerCurrentSong,
  usePlayerIsPlaying,
  usePlayerRef,
} from '@/store/player.store'
import { waveMoodForGenre, type WaveMood } from './kuma-wave-background'

/**
 * Третий вид hero «Моя волна» — WebGL-блоб из новое/vibe-animation.
 *
 * Отличия от второго вида (KumaWaveBackground): тот рисует SVG-блоб с
 * настроениями по жанру, этот — шейдер с domain warping. Реагирует на три
 * вещи:
 *   - обложку/жанр: палитра целиком поворачивается к акцентному цвету трека
 *     тем же источником, что и у второго вида (buildWaveTrio → WaveTrio[0]);
 *   - музыку: bass/mid/level с общего анализатора (features/player/audio-graph),
 *     низ раздувает пятно, середина ускоряет течение, уровень — неон;
 *   - лайк/дизлайк: кольцо от центра плюс сдвиг оттенка и яркости.
 */

interface VibeWaveBackgroundProps {
  alive?: boolean
  /** Играет ли сейчас хоть что-то (не только волна) — гонит реакцию на музыку. */
  playing?: boolean
  dark?: boolean
  /** Акцентный hex (цвет обложки или жанра). Нет — базовая палитра. */
  accent?: string | null
  /** Жанр текущего трека — выбирает пресет bend/rays/neon. */
  genre?: string | null
  /** Реагировать на лайк/дизлайк текущего трека. */
  reactions?: boolean
  /** Ховер по карточке: поток ускоряется — погружение, а не затемнение. */
  excited?: boolean
  className?: string
}

/** Базовый оттенок палитры шейдера: pink 322°. */
const PALETTE_HUE = 0.895

/** База палитры: v3 поднята 0.55 → 0.85 — было мыло, стало читаться как во v2. */
const BASE_NEON = 0.85

/** Реакция на лайк: тёплый сдвиг вправо по кругу палитры (~20°). */
const LIKE_HUE = 0.055
/** Реакция на дизлайк: холодный сдвиг влево (~38°) — уходит в фиолетово-синий. */
const DISLIKE_HUE = -0.105

/** v3.1: лайк — тёплый намёк, а не прожектор. Было 1.3/1.25/1.07 — пересвечивало. */
const LIKE_NEON = 1.12
const DISLIKE_NEON = 0.7
const LIKE_INTENSITY = 1.1
const DISLIKE_INTENSITY = 0.7
const LIKE_SCALE = 1.03
const DISLIKE_SCALE = 0.93

/**
 * Настроение по жанру для шейдера: 10 настроений второго вида (см.
 * waveMoodForGenre) жмутся в 4 визуальные группы — у шейдера всего три
 * ручки формы (bend/rays/neon), по пресету на каждый жанр не разложишь.
 *  - fire/warp/bounce — энергия: длинные лучи, яркий неон;
 *  - sparkle/sun — яркое, но мягче;
 *  - smoke/breath/dust/mist/fireflies — тихие: короткие лучи, тусклый неон;
 *  - none — дефолт модуля.
 */
const VIBE_MOOD_SHAPE: Record<WaveMood, { bend: number; rays: number; neonMul: number; softness: number }> = {
  // v3: тихие жанры подняты 0.12→0.20 / 0.65→0.85 — иначе их не видно вообще.
  // Громкие остались как были, none приглушён 0.55→0.40 (с новыми яркими
  // лучами дефолт пересвечивал).
  fire: { bend: 0.9, rays: 0.32, neonMul: 1.1, softness: 0.74 },
  warp: { bend: 1.0, rays: 0.34, neonMul: 1.25, softness: 0.75 },
  bounce: { bend: 0.85, rays: 0.32, neonMul: 1.1, softness: 0.8 },
  sparkle: { bend: 0.9, rays: 0.3, neonMul: 1.1, softness: 0.85 },
  sun: { bend: 0.9, rays: 0.3, neonMul: 1.1, softness: 0.85 },
  smoke: { bend: 0.9, rays: 0.2, neonMul: 0.85, softness: 0.9 },
  breath: { bend: 0.9, rays: 0.2, neonMul: 0.85, softness: 0.9 },
  dust: { bend: 0.9, rays: 0.2, neonMul: 0.85, softness: 0.9 },
  mist: { bend: 0.9, rays: 0.2, neonMul: 0.85, softness: 0.9 },
  fireflies: { bend: 0.9, rays: 0.2, neonMul: 0.85, softness: 0.9 },
  none: { bend: 1.0, rays: 0.4, neonMul: 1.0, softness: 0.88 },
}

/** Оттенок из hex в градусах. Мусор или серый — null, палитра не крутится. */
function hexToHueDeg(hex: string | null | undefined): number | null {
  if (!hex) return null
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d < 0.06) return null // серый/белый акцент — красить нечем
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return h
}

const wrap01 = (v: number) => ((v % 1) + 1) % 1

/** Чёрная обложка (яркость < 16%): волна должна уйти в тёмное, а не в дефолтный розовый. */
function isDarkCover(hex: string | null | undefined): boolean {
  if (!hex) return false
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum < 0.16
}

export function VibeWaveBackground({
  alive = true,
  playing = false,
  dark = false,
  accent = null,
  genre = null,
  reactions = true,
  excited = false,
  className,
}: VibeWaveBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const vibeRef = useRef<VibeInstance | null>(null)

  const audioEl = usePlayerRef()
  const isPlaying = usePlayerIsPlaying()
  const currentSong = usePlayerCurrentSong()
  const songId = currentSong?.id

  const like = useMLStore((state) =>
    songId ? (state.ratings[songId]?.like ?? null) : null,
  )

  /* Сдвиг палитры под обложку. null = оставить базовый оттенок. */
  const accentHue = useMemo(() => {
    const deg = hexToHueDeg(accent)
    return deg === null ? null : wrap01(deg / 360 - PALETTE_HUE)
  }, [accent])
  /* Чёрная обложка: гасим яркость/неон — волна тёмная, а не розовый дефолт. */
  const darkCover = useMemo(() => isDarkCover(accent), [accent])

  /* --- создание движка: ровно один раз за жизнь карточки --- */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const vibe = createVibe(root, {
      // В dev видно ревизию шейдера в консоли — проверка, что крутится
      // свежий воркер, а не закэшированный.
      onLog: (...a: unknown[]) => {
        if (import.meta.env.DEV) console.debug('[vibe]', ...a)
      },
    })
    vibeRef.current = vibe

    return () => {
      vibeRef.current = null
      vibe.destroy()
    }
  }, [])

  /* --- анализатор и пауза --- */
  useEffect(() => {
    const vibe = vibeRef.current
    if (!vibe || !audioEl) return
    // Узел держим подключённым и на паузе: он молчит, полосы уходят в ноль,
    // и движение само замедляется и гаснет. Отключили бы — застыло бы.
    vibe.bindAnalyser(getAnalyserNode(audioEl))
    vibe.setPaused(!(playing && isPlaying))
  }, [audioEl, isPlaying, playing])

  /* --- палитра: обложка + лайк/дизлайк + тема + настроение жанра --- */
  useEffect(() => {
    const vibe = vibeRef.current
    if (!vibe) return

    const hueShift = like === true ? LIKE_HUE : like === false ? DISLIKE_HUE : 0
    const mood = waveMoodForGenre(genre)
    const shape = VIBE_MOOD_SHAPE[mood] ?? VIBE_MOOD_SHAPE.none

    vibe.set({
      hueOffset: wrap01((accentHue ?? 0) + hueShift),
      // Ховер-погружение: поток ускоряется, пятно чуть растёт.
      speed: excited ? 1.4 : 1,
      // Радиус пятна задают softness и rays: edge = 0.66*softness + rays*uRays.
      // scale этого не делает — он идёт только в частоту шума. Значения едут
      // из пресета настроения (см. VIBE_MOOD_SHAPE); резкость смены гасит
      // сглаживание bend/rays/softness/neon в tick() (vibe.ts).
      softness: shape.softness,
      rays: shape.rays,
      bend: shape.bend,
      intensity:
        (dark ? 0.9 : 1) *
        (like === true
          ? LIKE_INTENSITY
          : like === false
            ? DISLIKE_INTENSITY
            : 1) *
        (darkCover ? 0.55 : 1),
      // Неон считаем от БАЗЫ v3 (0.85): жанровый множитель — поверх,
      // лайк/дизлайк — ещё поверх. Музыка домножается в tick() (vibe.ts).
      neon:
        BASE_NEON *
        shape.neonMul *
        (like === true ? LIKE_NEON : like === false ? DISLIKE_NEON : 1) *
        (darkCover ? 0.6 : 1),
      scale: like === true ? LIKE_SCALE : like === false ? DISLIKE_SCALE : 1,
      backgroundColor: dark ? '#141A26' : '#f0f0f5',
      // Огонь только для жёстких жанров (рок/метал/панк…): языки пламени
      // вверх + взлетающие угли. Смена едет плавно через сглаживание
      // в tick() — без щелчка. В CSS-фолбэке слоя нет, там просто блобы.
      fxFire: mood === 'fire' ? 0.85 : 0,
    })
  }, [accentHue, darkCover, dark, like, genre, excited])

  /* --- импульс на смену оценки --- */
  const prevLike = useRef<boolean | null>(like)
  useEffect(() => {
    if (!reactions) {
      prevLike.current = like
      return
    }
    const before = prevLike.current
    prevLike.current = like
    // null пропускаем: это не оценка, а «трек не оценён» — смена трека и снятие
    // лайка не должны давать импульс. Первый лайк (null -> true) — должен.
    if (like === null || before === like) return
    vibeRef.current?.pulseReaction()
  }, [like, reactions])

  /* --- пауза --- */
  useEffect(() => {
    vibeRef.current?.setEnabled(alive)
  }, [alive])

  return <div
    ref={rootRef}
    className={cn(
      'absolute inset-0 overflow-hidden pointer-events-none',
      className,
    )}
    aria-hidden="true"
  />
}