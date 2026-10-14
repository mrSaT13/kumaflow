import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { getAnalyserNode } from '@/features/player/audio-graph'
import { cn } from '@/lib/utils'
import type { WaveMoodKey } from '@/store/homepage.store'
import { usePlayerRef } from '@/store/player.store'
import { hexToRgb, hexToRgba } from '@/utils/getAverageColor'

export type WaveTrio = [string, string, string]
export type WaveMood = WaveMoodKey | 'none'

/** Подписи для тумблеров в настройках. */
export const WAVE_MOODS_META: { key: WaveMoodKey; label: string; hint: string }[] = [
  { key: 'fire', label: 'Огонь', hint: 'Рок, метал, альтернатива' },
  { key: 'warp', label: 'Варп', hint: 'Электроника, техно, хаус' },
  { key: 'sparkle', label: 'Блёстки', hint: 'Поп, K-Pop, J-Pop' },
  { key: 'bounce', label: 'Кач', hint: 'Хип-хоп, рэп, R&B' },
  { key: 'smoke', label: 'Дым', hint: 'Джаз, соул, блюз' },
  { key: 'breath', label: 'Дыхание', hint: 'Классика, эмбиент' },
  { key: 'dust', label: 'Пыль', hint: 'Ло-фай, чилл, лаунж' },
  { key: 'sun', label: 'Солнце', hint: 'Регги, латина, ска' },
  { key: 'fireflies', label: 'Светлячки', hint: 'Кантри, фолк, акустика' },
  { key: 'mist', label: 'Туман', hint: 'Инди, дрим-поп, пост-рок' },
]

const DEFAULT_TRIO: WaveTrio = ['#00e5ff', '#2979ff', '#7c4dff']

interface KumaWaveBackgroundProps {
  alive?: boolean
  playing?: boolean
  dark?: boolean
  /** [cyan, blue, purple] — акцент играющего трека или жанра. Нет — дефолт. */
  colors?: WaveTrio
  /** Жанр текущего трека — выбирает настроение капли. */
  genre?: string
  /** Гейт эффектов из настроек (для слабых ПК). Нет записи — эффект включён. */
  effects?: Partial<Record<WaveMoodKey, boolean>>
  /** Танцующие полоски поверх капли. */
  lines?: boolean
  /** Секция на весь экран: капля и лучи крупнее. */
  expanded?: boolean
  className?: string
}

/* ---------- цвет: из базового hex строим гармоничную тройку (0°, +35°, −35°) ---------- */

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [h, s * 100, l * 100]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  s = Math.min(100, Math.max(0, s)) / 100
  l = Math.min(100, Math.max(0, l)) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** Из акцентного hex — тройка для капли. Мусор на входе → null (будет дефолт). */
export function buildWaveTrio(base: string | null | undefined, dark: boolean): WaveTrio | undefined {
  if (!base) return undefined
  const hsl = hexToHsl(base)
  if (!hsl) return undefined
  const [h, s, l] = hsl
  if (s < 8) return undefined // серый/белый акцент — не красим
  const sat = Math.max(s, 62)
  const light = dark ? 60 : Math.min(62, Math.max(l, 52))
  return [hslToHex(h, sat, light), hslToHex(h + 35, sat, light), hslToHex(h - 35, Math.max(sat - 5, 55), light + 6)]
}

/* ---------- настроение по жанру ---------- */

const FIRE_TOKENS = [
  'рок', 'rock', 'metal', 'панк', 'punk', 'grunge', 'гранж', 'alternative', 'альтернатив',
  'hardcore', 'хардкор', 'industrial', 'индастриал', 'emo', 'эмо', 'post-hardcore',
]

const WARP_TOKENS = [
  'электрон', 'electro', 'edm', 'techno', 'техно', 'house', 'хаус', 'trance', 'транс',
  'dubstep', 'дабстеп', 'drum', 'dnb', 'днб', 'synth', 'синт', 'vapor', 'вейпор',
  'dance', 'дэнс', 'disco', 'диско', 'hyperpop', 'phonk', 'фонк', 'bass', 'басс',
]

const MIST_TOKENS = [
  'инди', 'indie', 'dream', 'дрим', 'shoegaze', 'шугейз', 'post-rock', 'пост-рок',
  'slowcore', 'слоукор',
]

const SPARKLE_TOKENS = ['k-pop', 'j-pop', 'поп', 'europop', 'европоп', 'dance-pop']

const BOUNCE_TOKENS = [
  'хип-хоп', 'hip-hop', 'hip hop', 'rap', 'рэп', 'trap', 'трэп', 'r&b', 'rnb',
  'drill', 'дрилл', 'grime', 'грайм',
]

const SMOKE_TOKENS = [
  'джаз', 'jazz', 'soul', 'соул', 'funk', 'фанк', 'blues', 'блюз', 'neo-soul', 'acid jazz',
]

const SUN_TOKENS = [
  'регги', 'reggae', 'латина', 'latin', 'salsa', 'сальса', 'ska', 'ска',
  'bachata', 'бачата', 'reggaeton', 'реггетон', 'afro', 'афро', 'calypso', 'калипсо',
]

const BREATH_TOKENS = [
  'классик', 'classical', 'opera', 'опера', 'instrumental', 'инструментал',
  'ambient', 'амбиент', 'neoclass', 'неокласс',
]

const DUST_TOKENS = [
  'lo-fi', 'lofi', 'лофай', 'chill', 'чилл', 'lounge', 'лаунж',
  'downtempo', 'даунтемпо', 'trip-hop', 'трип-хоп',
]

const FIREFLIES_TOKENS = [
  'кантри', 'country', 'фолк', 'folk', 'bluegrass', 'блюграсс', 'celtic', 'кельт',
  'acoustic', 'акустик', 'singer-songwriter', 'бард',
]

/** Жанр → настроение капли. Порядок важен (pop rock — огонь, dream pop — туман). */
export function waveMoodForGenre(genre: string | null | undefined): WaveMood {
  if (!genre) return 'none'
  const g = genre.toLowerCase()
  const has = (ts: string[]) => ts.some((t) => g.includes(t))
  if (has(FIRE_TOKENS)) return 'fire'
  if (has(WARP_TOKENS)) return 'warp'
  if (has(MIST_TOKENS)) return 'mist'
  if (has(SPARKLE_TOKENS)) return 'sparkle'
  if (has(BOUNCE_TOKENS)) return 'bounce'
  if (has(SMOKE_TOKENS)) return 'smoke'
  if (has(SUN_TOKENS)) return 'sun'
  if (has(BREATH_TOKENS)) return 'breath'
  if (has(DUST_TOKENS)) return 'dust'
  if (has(FIREFLIES_TOKENS)) return 'fireflies'
  return 'none'
}

/* ---------- танцующая линия: тонкий контур, плавное 2D-движение + энергия трека ---------- */

function MoodRays({
  alive,
  playing,
  mode,
  trioRef,
  big,
}: {
  alive: boolean
  playing: boolean
  mode: WaveMood
  trioRef: { current: WaveTrio }
  big?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audio = usePlayerRef()
  const stateRef = useRef({ alive, playing, mode, audio, trioRef, big })
  stateRef.current.alive = alive
  stateRef.current.playing = playing
  stateRef.current.mode = mode
  stateRef.current.audio = audio
  stateRef.current.trioRef = trioRef
  stateRef.current.big = big

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    let running = true
    let t = Math.random() * 100
    let energy = 0.12
    let last = performance.now()
    let analyser: AnalyserNode | null = null
    let data: Uint8Array | null = null

    const resize = () => {
      const r = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = Math.max(1, Math.floor(r.width))
      h = Math.max(1, Math.floor(r.height))
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)

    const setRunning = (v: boolean) => {
      if (v === running) return
      running = v
      if (v) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      } else cancelAnimationFrame(raf)
    }
    const onVis = () => setRunning(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) setRunning(e.isIntersecting && !document.hidden)
      },
      { threshold: 0 },
    )
    io.observe(parent)

    const readEnergy = (): number => {
      const st = stateRef.current
      const el = st.audio
      if (!el || el.paused) return st.playing ? 0.3 : 0.12
      try {
        if (!analyser) {
          analyser = getAnalyserNode(el)
          if (analyser) data = new Uint8Array(analyser.frequencyBinCount)
        }
        if (!analyser || !data) return 0.4
        analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>)
        let bass = 0
        for (let i = 0; i < 3; i++) bass += data[i]
        bass /= 3 * 255
        let mid = 0
        for (let i = 3; i < 24; i++) mid += data[i]
        mid /= 21 * 255
        return Math.min(1, bass * 0.6 + mid * 0.4 + 0.12)
      } catch {
        return 0.4
      }
    }

    const hash = (i: number) => Math.sin(i * 12.9898) * 0.5 + 0.5

    // Угли для огня: неровные искры вверх, у каждой свой темп и размер.
    const drawEmbers = (cx: number, cy: number, R: number, accent: string) => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 16; i++) {
        const s1 = hash(i)
        const s2 = hash(i + 40)
        const prog = (t * (0.22 + s1 * 0.35) + s2) % 1
        const x0 = cx + (s1 - 0.5) * R * 1.7
        const y = cy + R * 0.55 - prog * R * 2.3
        const x = x0 + Math.sin(t * (1.5 + s2 * 2) + i * 1.9) * (6 + prog * 20)
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 5 + i * 2.3))
        const alpha = (1 - prog) * (0.15 + energy * 0.55) * tw
        if (alpha <= 0.02) continue
        const style =
          i % 3 === 2
            ? `rgba(255,214,140,${alpha.toFixed(3)})`
            : i % 3 === 1
              ? (hexToRgba(accent, alpha) ?? `rgba(255,150,80,${alpha.toFixed(3)})`)
              : `rgba(255,240,220,${(alpha * 0.9).toFixed(3)})`
        ctx.save()
        ctx.shadowColor = style
        ctx.shadowBlur = 8
        ctx.fillStyle = style
        ctx.beginPath()
        ctx.arc(x, y, 1.2 + s2 * 2.4 * (1 - prog * 0.4), 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      ctx.restore()
    }

    // Световой веер из шара: 4 shafts разной ширины/длинны/скорости, без повторов.
    const drawBeams = (cx: number, cy: number, R: number, accent: string) => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineJoin = 'round'
      try {
        ctx.filter = 'blur(10px)'
      } catch {
        /* ignore */
      }
      for (let i = 0; i < 4; i++) {
        const s1 = hash(i + 7)
        const s2 = hash(i + 21)
        const ang = (-0.9 + (i / 3) * 1.8) * 0.75 + Math.sin(t * (0.25 + s1 * 0.2) + i * 1.7) * 0.28
        const dx = Math.sin(ang)
        const dy = -Math.cos(ang)
        const px = Math.cos(ang)
        const py = Math.sin(ang)
        const len = R * (1.5 + s1 * 1.3) * (0.65 + energy * 0.7)
        const wH = (13 + s2 * 26) * (0.8 + energy * 0.4)
        const bx = cx + dx * R * 0.35
        const by = cy + dy * R * 0.35
        const tx = bx + dx * len
        const ty = by + dy * len
        const a0 = 0.05 + energy * 0.07
        const grad = ctx.createLinearGradient(bx, by, tx, ty)
        grad.addColorStop(
          0,
          i % 2 === 0 ? `rgba(255,255,255,${a0.toFixed(3)})` : (hexToRgba(accent, a0) ?? `rgba(150,180,255,${a0.toFixed(3)})`),
        )
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(bx + px * wH, by + py * wH)
        ctx.lineTo(tx + px * wH * 0.25, ty + py * wH * 0.25)
        ctx.lineTo(tx - px * wH * 0.25, ty - py * wH * 0.25)
        ctx.lineTo(bx - px * wH, by - py * wH)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }

    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const st = stateRef.current
      if (!st.alive) {
        raf = requestAnimationFrame(frame)
        return
      }
      // Плавность: энергия идёт через lerp — нет прыжков на play/pause.
      const target = readEnergy()
      energy += (target - energy) * Math.min(1, dt * 5)
      t += dt * (st.playing ? 0.9 + energy * 1.6 : 0.5)

      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w * (st.big ? 0.31 : 0.24), st.big ? 340 : 230)
      if (st.mode === 'fire') drawEmbers(cx, cy, R, st.trioRef.current[1])
      else drawBeams(cx, cy, R, st.trioRef.current[1])

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      io.disconnect()
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0" />
}

/* ---------- настроение: костёр для жёстких / варп для электроники ---------- */

function MoodFx({
  alive,
  playing,
  mode,
  trioRef,
  big,
}: {
  alive: boolean
  playing: boolean
  mode: WaveMood
  trioRef: { current: WaveTrio }
  big?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audio = usePlayerRef()
  const stateRef = useRef({ alive, playing, mode, audio, trioRef, big })
  stateRef.current.alive = alive
  stateRef.current.playing = playing
  stateRef.current.mode = mode
  stateRef.current.audio = audio
  stateRef.current.trioRef = trioRef
  stateRef.current.big = big

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    let running = true
    let t = Math.random() * 100
    let energy = 0.15
    let last = performance.now()
    let analyser: AnalyserNode | null = null
    let data: Uint8Array | null = null

    const resize = () => {
      const r = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = Math.max(1, Math.floor(r.width))
      h = Math.max(1, Math.floor(r.height))
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)

    const setRunning = (v: boolean) => {
      if (v === running) return
      running = v
      if (v) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      } else cancelAnimationFrame(raf)
    }
    const onVis = () => setRunning(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) setRunning(e.isIntersecting && !document.hidden)
      },
      { threshold: 0 },
    )
    io.observe(parent)

    const readEnergy = (): number => {
      const st = stateRef.current
      const el = st.audio
      if (!el || el.paused) return st.playing ? 0.3 : 0.12
      try {
        if (!analyser) {
          analyser = getAnalyserNode(el)
          if (analyser) data = new Uint8Array(analyser.frequencyBinCount)
        }
        if (!analyser || !data) return 0.4
        analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>)
        let bass = 0
        for (let i = 0; i < 3; i++) bass += data[i]
        bass /= 3 * 255
        return Math.min(1, bass * 0.75 + 0.12)
      } catch {
        return 0.4
      }
    }

    // Варп: скоростные полосы разлетаются от шара наружу, темп — от энергии.
    // Плотность адаптивная: на весь экран полос больше, но в разумных пределах.
    const drawWarp = (cx: number, cy: number, R: number, accent: string) => {
      const N = Math.max(24, Math.min(64, Math.round((w * h) / 22000)))
      const maxR = Math.sqrt((w / 2) ** 2 + (h / 2) ** 2)
      const rot = t * 0.07
      ctx.save()
      ctx.lineCap = 'round'
      for (let i = 0; i < N; i++) {
        const jitter = Math.sin(i * 12.9898) * 0.05
        const ang = (i / N) * Math.PI * 2 + rot + jitter
        const off = (Math.sin(i * 78.233) * 0.5 + 0.5)
        const prog = (t * (0.1 + energy * 0.55) * (0.7 + off * 0.6) + off) % 1
        const r0 = R * 0.85 + prog * (maxR - R * 0.85)
        const len = 18 + prog * 80 * (0.4 + energy)
        const alpha = Math.sin(prog * Math.PI) * (0.14 + energy * 0.4)
        if (alpha <= 0.01) continue
        const x0 = cx + Math.cos(ang) * r0
        const y0 = cy + Math.sin(ang) * r0
        const x1 = cx + Math.cos(ang) * (r0 + len)
        const y1 = cy + Math.sin(ang) * (r0 + len)
        ctx.strokeStyle =
          i % 2 === 0
            ? `rgba(255,255,255,${alpha.toFixed(3)})`
            : (hexToRgba(accent, alpha) ?? `rgba(41,121,255,${alpha.toFixed(3)})`)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }
      ctx.restore()
    }

    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const st = stateRef.current
      if (!st.alive || st.mode === 'none') {
        // Эффекта нет — холст чист, кадр не крутим зря.
        ctx.clearRect(0, 0, w, h)
        raf = requestAnimationFrame(frame)
        return
      }
      const target = readEnergy()
      energy += (target - energy) * Math.min(1, dt * 5)
      t += dt * (st.playing ? 1 + energy * 1.8 : 0.55)

      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w * (st.big ? 0.31 : 0.24), st.big ? 340 : 230)
      if (st.mode === 'warp') drawWarp(cx, cy, R, st.trioRef.current[1])

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      io.disconnect()
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0" />
}

/* ---------- огненное кольцо ЗА шаром: языки по кругу, шар их перекрывает ---------- */

function FireRing({ alive, playing, trioRef, big }: { alive: boolean; playing: boolean; trioRef: { current: WaveTrio }; big?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audio = usePlayerRef()
  const stateRef = useRef({ alive, playing, audio, trioRef, big })
  stateRef.current.alive = alive
  stateRef.current.playing = playing
  stateRef.current.audio = audio
  stateRef.current.trioRef = trioRef
  stateRef.current.big = big

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    let running = true
    let t = Math.random() * 100
    let energy = 0.15
    let last = performance.now()
    let analyser: AnalyserNode | null = null
    let data: Uint8Array | null = null

    const resize = () => {
      const r = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = Math.max(1, Math.floor(r.width))
      h = Math.max(1, Math.floor(r.height))
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)

    const setRunning = (v: boolean) => {
      if (v === running) return
      running = v
      if (v) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      } else cancelAnimationFrame(raf)
    }
    const onVis = () => setRunning(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) setRunning(e.isIntersecting && !document.hidden)
      },
      { threshold: 0 },
    )
    io.observe(parent)

    const readEnergy = (): number => {
      const st = stateRef.current
      const el = st.audio
      if (!el || el.paused) return st.playing ? 0.3 : 0.12
      try {
        if (!analyser) {
          analyser = getAnalyserNode(el)
          if (analyser) data = new Uint8Array(analyser.frequencyBinCount)
        }
        if (!analyser || !data) return 0.4
        analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>)
        let bass = 0
        for (let i = 0; i < 3; i++) bass += data[i]
        bass /= 3 * 255
        return Math.min(1, bass * 0.75 + 0.12)
      } catch {
        return 0.4
      }
    }

    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const st = stateRef.current
      if (!st.alive) {
        raf = requestAnimationFrame(frame)
        return
      }
      const target = readEnergy()
      // В такт: атака резкая (языки вспыхивают на кике), спад плавный.
      const k = target > energy ? Math.min(1, dt * 18) : Math.min(1, dt * 4)
      energy += (target - energy) * k
      t += dt * (st.playing ? 1 + energy * 1.8 : 0.55)

      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w * (st.big ? 0.31 : 0.24), st.big ? 340 : 230)
      const N = 9
      const rot = t * 0.1
      const accentMid = hexToRgba(st.trioRef.current[1], 0.6) ?? 'rgba(255,140,40,0.6)'
      const accentSoft = hexToRgba(st.trioRef.current[1], 0.4) ?? 'rgba(255,140,40,0.4)'

      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.lineJoin = 'round'
      // По громкости: яркость всего кольца растёт вместе с размером.
      ctx.globalAlpha = 0.35 + energy * 0.4
      try {
        ctx.filter = 'blur(9px)'
      } catch {
        /* старые движки — без блюра */
      }
      for (let i = 0; i < N; i++) {
        // Рваный венец вместо идеального круга: у каждого языка свой сдвиг угла,
        // волнистый радиус корней и своя длина — иначе кольцо дорисовывает шар.
        const jit = Math.sin(i * 12.9898) * 0.5 + 0.5
        const a = (i / N) * Math.PI * 2 + rot + (jit - 0.5) * 0.22
        const dx = Math.cos(a)
        const dy = Math.sin(a)
        const px = -dy
        const py = dx
        const flick = 0.5 + 0.5 * Math.sin(t * 6 + i * 2.7 + Math.sin(t * 2.6 + i * 1.2) * 1.5)
        // Корни под шаром, но радиус гуляет волной по углу и времени.
        const baseR = R * (0.68 + 0.14 * Math.sin(2 * a + t * 0.5) + 0.1 * Math.sin(3 * a - t * 0.34 + 1.2))
        const len = R * (0.18 + 0.28 * flick + energy * 0.6) * (0.5 + jit * 1.0)
        const tipU = baseR + len
        const bend = Math.sin(t * 4 + i * 2.1) * (5 + energy * 14)
        const wH = (8 + energy * 9 + flick * 5) * (0.8 + jit * 0.4)
        const P = (u: number, v: number): [number, number] => [cx + dx * u + px * v, cy + dy * u + py * v]
        const [bx0, by0] = P(baseR, -wH)
        const [bx1, by1] = P(baseR, wH)
        const [c1x, c1y] = P(baseR + len * 0.35, -wH * 1.15)
        const [c2x, c2y] = P(tipU - len * 0.3, -wH * 0.45 + bend)
        const [t0x, t0y] = P(tipU, bend - wH * 0.08)
        const [tcx, tcy] = P(tipU + wH * 0.2, bend)
        const [t1x, t1y] = P(tipU, bend + wH * 0.08)
        const [c3x, c3y] = P(tipU - len * 0.3, wH * 0.45 + bend)
        const [c4x, c4y] = P(baseR + len * 0.35, wH * 1.15)
        const [gx0, gy0] = P(baseR, 0)
        const [gx1, gy1] = P(tipU, bend)
        const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1)
        grad.addColorStop(0, accentMid)
        grad.addColorStop(0.55, accentSoft)
        grad.addColorStop(1, 'rgba(255,120,20,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(bx0, by0)
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, t0x, t0y)
        ctx.quadraticCurveTo(tcx, tcy, t1x, t1y)
        ctx.bezierCurveTo(c3x, c3y, c4x, c4y, bx1, by1)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      io.disconnect()
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0" />
}

/* ---------- 8 тихих эффектов: поп, хип-хоп, джаз, классика, лофай, солнце, светлячки, туман ---------- */

const GENRE_MODES: WaveMood[] = ['sparkle', 'bounce', 'smoke', 'breath', 'dust', 'sun', 'fireflies', 'mist']

function GenreFx({
  alive,
  playing,
  mode,
  trioRef,
  big,
}: {
  alive: boolean
  playing: boolean
  mode: WaveMood
  trioRef: { current: WaveTrio }
  big?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audio = usePlayerRef()
  const stateRef = useRef({ alive, playing, mode, audio, trioRef, big })
  stateRef.current.alive = alive
  stateRef.current.playing = playing
  stateRef.current.mode = mode
  stateRef.current.audio = audio
  stateRef.current.trioRef = trioRef
  stateRef.current.big = big

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    let running = true
    let t = Math.random() * 100
    let slow = Math.random() * 100
    let energy = 0.15
    let last = performance.now()
    let lastBeat = 0
    let analyser: AnalyserNode | null = null
    let data: Uint8Array | null = null
    const rings: number[] = []

    const resize = () => {
      const r = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = Math.max(1, Math.floor(r.width))
      h = Math.max(1, Math.floor(r.height))
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)

    const setRunning = (v: boolean) => {
      if (v === running) return
      running = v
      if (v) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      } else cancelAnimationFrame(raf)
    }
    const onVis = () => setRunning(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) setRunning(e.isIntersecting && !document.hidden)
      },
      { threshold: 0 },
    )
    io.observe(parent)

    const readEnergy = (): number => {
      const st = stateRef.current
      const el = st.audio
      if (!el || el.paused) return st.playing ? 0.3 : 0.12
      try {
        if (!analyser) {
          analyser = getAnalyserNode(el)
          if (analyser) data = new Uint8Array(analyser.frequencyBinCount)
        }
        if (!analyser || !data) return 0.4
        analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>)
        let bass = 0
        for (let i = 0; i < 3; i++) bass += data[i]
        bass /= 3 * 255
        let mid = 0
        for (let i = 3; i < 24; i++) mid += data[i]
        mid /= 21 * 255
        return Math.min(1, bass * 0.6 + mid * 0.4 + 0.12)
      } catch {
        return 0.4
      }
    }

    const hash = (i: number) => Math.sin(i * 12.9898) * 0.5 + 0.5

    const dot = (x: number, y: number, r: number, style: string, glow: number) => {
      ctx.save()
      ctx.shadowColor = style
      ctx.shadowBlur = glow
      ctx.fillStyle = style
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // Блёстки: искры взлетают вверх, мерцают, вспыхивают на бите.
    const drawSparkle = (accent: string) => {
      ctx.save()
      for (let i = 0; i < 26; i++) {
        const s1 = hash(i)
        const s2 = hash(i + 50)
        const prog = (t * (0.12 + s1 * 0.2) + s2) % 1
        const x = w * s1 + Math.sin(t * 0.8 + i) * 22
        const y = h * (0.95 - prog * 0.75)
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 4 + i * 1.7))
        const alpha = (1 - prog) * (0.2 + energy * 0.6) * tw
        if (alpha <= 0.02) continue
        const style =
          i % 3 === 0
            ? `rgba(255,255,255,${alpha.toFixed(3)})`
            : i % 3 === 1
              ? (hexToRgba(accent, alpha) ?? `rgba(255,180,220,${alpha.toFixed(3)})`)
              : `rgba(255,214,130,${(alpha * 0.9).toFixed(3)})`
        dot(x, y, 1 + s2 * 2.2, style, 7)
      }
      ctx.restore()
    }

    // Кач: кольца расходятся от шара на кике + тёплая вспышка.
    // Кольца рождаются в frame() на сыром скачке баса (до сглаживания).
    const drawBounce = (cx: number, cy: number, R: number, accent: string, now: number) => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const t0 of rings) {
        const age = (now - t0) / 900
        if (age >= 1) continue
        const r = R * (0.95 + age * 1.15)
        const alpha = (1 - age) * 0.45
        ctx.strokeStyle = hexToRgba(accent, alpha) ?? `rgba(255,255,255,${alpha.toFixed(3)})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4)
      const ga = energy * 0.3
      glow.addColorStop(0, hexToRgba(accent, ga) ?? `rgba(255,255,255,${ga.toFixed(3)})`)
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.fillRect(cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 2.8)
      ctx.restore()
    }

    // Дым: дюжина мягких клубов дрейфует вверх и тает. Никаких штрихов —
    // любая извивающаяся линия читается червем.
    const drawSmoke = (accent: string, tt: number) => {
      const acc = hexToRgb(accent) ?? [180, 190, 220]
      const accCol = `${acc[0]},${acc[1]},${acc[2]}`
      ctx.save()
      for (let i = 0; i < 12; i++) {
        const s1 = hash(i + 60)
        const s2 = hash(i + 95)
        const prog = (tt * (0.09 + s1 * 0.1) + s2) % 1
        const x = w * (0.2 + 0.6 * s1) + Math.sin(tt * 0.7 + i * 1.6) * 30
        const y = h * 0.85 - prog * h * 0.7
        const r = 26 + s2 * 44 + prog * 30
        const alpha = Math.sin(prog * Math.PI) * (0.03 + energy * 0.03)
        if (alpha <= 0.005) continue
        const col = i % 3 === 0 ? '235,240,255' : accCol
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, `rgba(${col},${alpha.toFixed(3)})`)
        grad.addColorStop(1, `rgba(${col},0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    // Дыхание: свечение медленно вдыхает/выдыхает (~8с цикл).
    const drawBreath = (cx: number, cy: number, R: number, accent: string, tt: number) => {
      const phase = (tt % 8) / 8
      const inhale = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2)
      const alpha = 0.06 + inhale * 0.07 + energy * 0.04
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.1)
      grad.addColorStop(0, hexToRgba(accent, alpha) ?? `rgba(160,180,255,${alpha.toFixed(3)})`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.save()
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
    }

    // Пыль: мошки висят в воздухе, на бите слегка светлеют.
    const drawDust = (accent: string, tt: number) => {
      ctx.save()
      for (let i = 0; i < 30; i++) {
        const s1 = hash(i)
        const s2 = hash(i + 90)
        const x = (s1 * w + Math.sin(tt * 0.25 + i * 1.3) * 20 + w) % w
        const y = (s2 * h + Math.cos(tt * 0.2 + i * 0.9) * 16 + h) % h
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(tt * 1.2 + i * 2.4))
        const alpha = (0.08 + 0.2 * tw) * (0.7 + energy * 0.6)
        dot(x, y, 1 + s1 * 1.4, i % 4 === 0 ? (hexToRgba(accent, alpha) ?? `rgba(255,255,255,${alpha.toFixed(3)})`) : `rgba(255,255,255,${alpha.toFixed(3)})`, 4)
      }
      ctx.restore()
    }

    // Солнце: тёплые огоньки ходят по орбите вокруг шара.
    const drawSun = (cx: number, cy: number, R: number) => {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 8; i++) {
        const ang = t * (0.22 + 0.06 * (i % 3)) + (i / 8) * Math.PI * 2
        const rad = R * (1.25 + 0.25 * Math.sin(t * 0.6 + i * 1.4))
        const x = cx + Math.cos(ang) * rad
        const y = cy + Math.sin(ang) * rad * 0.8
        const blink = 0.5 + 0.5 * Math.sin(t * 2 + i * 2.6)
        const alpha = (0.35 + 0.4 * blink) * (0.6 + energy * 0.6)
        dot(x, y, 2.5 + (i % 3), `rgba(255,196,110,${alpha.toFixed(3)})`, 14)
      }
      ctx.restore()
    }

    // Светлячки: холодные точки блуждают и мигают.
    const drawFireflies = (cx: number, cy: number, tt: number) => {
      const Rx = w * 0.32
      const Ry = h * 0.3
      ctx.save()
      for (let i = 0; i < 10; i++) {
        const x = cx + Math.sin(tt * 0.3 * (0.7 + hash(i) * 0.6) + i * 2.4) * Rx
        const y = cy + Math.cos(tt * 0.23 * (0.7 + hash(i + 20) * 0.6) + i * 1.7) * Ry
        const gate = 0.5 + 0.5 * Math.sin(tt * 1.4 + i * 2.2)
        const alpha = gate * gate * gate * (0.4 + energy * 0.4)
        if (alpha <= 0.03) continue
        dot(x, y, 1.6 + hash(i + 40) * 1.4, `rgba(230,255,234,${alpha.toFixed(3)})`, 10)
      }
      ctx.restore()
    }

    // Туман: рваная дымка из 5 тонких полос — соседние ползут в разные стороны,
    // толщина и прозрачность дышат, полосы не параллельны.
    const drawMist = (accent: string, tt: number) => {
      ctx.save()
      ctx.lineCap = 'round'
      for (let k = 0; k < 5; k++) {
        const dir = k % 2 === 0 ? 1 : -1
        const speed = 0.3 + (k % 3) * 0.28
        const yBase = h * (0.55 + 0.075 * k) + Math.sin(tt * (0.45 + k * 0.12) + k * 1.8) * 13
        const drift = Math.sin(tt * speed * dir + k * 2.2) * 150
        const breathe = 0.55 + 0.45 * Math.sin(tt * 0.65 + k * 1.3)
        ctx.beginPath()
        for (let x = -60; x <= w + 60; x += 20) {
          const y =
            yBase +
            Math.sin((x * dir + drift) * 0.012 + tt * (0.55 + k * 0.11) + k * 1.1) * (7 + k * 2.2)
          if (x === -60) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        const alpha = (0.03 + energy * 0.02) * breathe + 0.012
        ctx.strokeStyle =
          k % 2 === 0
            ? `rgba(220,228,245,${alpha.toFixed(3)})`
            : (hexToRgba(accent, alpha) ?? `rgba(170,180,210,${alpha.toFixed(3)})`)
        ctx.lineWidth = 12 + (k % 3) * 7
        ctx.shadowBlur = 16
        ctx.shadowColor = 'rgba(190,200,225,0.5)'
        ctx.stroke()
      }
      ctx.restore()
    }

    const frame = (now: number) => {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const st = stateRef.current
      if (!st.alive || !GENRE_MODES.includes(st.mode)) {
        ctx.clearRect(0, 0, w, h)
        raf = requestAnimationFrame(frame)
        return
      }
      const target = readEnergy()
      // Кик: сырой скачок до сглаживания — рождаем кольцо.
      if (st.mode === 'bounce' && target - energy > 0.12 && now - lastBeat > 260) {
        lastBeat = now
        rings.push(now)
        if (rings.length > 3) rings.shift()
      }
      const k = target > energy ? Math.min(1, dt * 14) : Math.min(1, dt * 4)
      energy += (target - energy) * k
      t += dt * (st.playing ? 1 + energy * 1.6 : 0.55)
      slow += dt * 0.45

      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w * (st.big ? 0.31 : 0.24), st.big ? 340 : 230)
      switch (st.mode) {
        case 'sparkle': drawSparkle(st.trioRef.current[1]); break
        case 'bounce': drawBounce(cx, cy, R, st.trioRef.current[1], now); break
        case 'smoke': drawSmoke(st.trioRef.current[1], slow); break
        case 'breath': drawBreath(cx, cy, R, st.trioRef.current[1], slow); break
        case 'dust': drawDust(st.trioRef.current[1], slow); break
        case 'sun': drawSun(cx, cy, R); break
        case 'fireflies': drawFireflies(cx, cy, slow); break
        case 'mist': drawMist(st.trioRef.current[1], slow); break
        default: break
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
      io.disconnect()
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0" />
}

/* ---------- плавная смена трека: lerp цветов + кроссфейд настроений ---------- */

type RGB = [number, number, number]

function parseTrio(t: WaveTrio): [RGB, RGB, RGB] {
  const p = (hex: string): RGB => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return [0, 229, 255]
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  return [p(t[0]), p(t[1]), p(t[2])]
}

const rgbToHex = (c: RGB): string =>
  '#' +
  c
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')

function writeWaveVars(s: CSSStyleDeclaration, cur: [RGB, RGB, RGB], darkMode: boolean) {
  const A = (c: RGB, al: number) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${al})`
  s.setProperty('--wc1', rgbToHex(cur[0]))
  s.setProperty('--wc1a', A(cur[0], 0.85))
  s.setProperty('--wc2', rgbToHex(cur[1]))
  s.setProperty('--wc2a', A(cur[1], 0.9))
  s.setProperty('--wc3', rgbToHex(cur[2]))
  s.setProperty('--wc3a', A(cur[2], 0.9))
  s.setProperty('--wh1', A(cur[0], darkMode ? 0.28 : 0.18))
  s.setProperty('--wh2', A(cur[1], darkMode ? 0.5 : 0.35))
}

function trioToVars(t: WaveTrio, darkMode: boolean): CSSProperties {
  const A = (hex: string, al: number) => hexToRgba(hex, al) ?? hex
  return {
    '--wc1': t[0],
    '--wc1a': A(t[0], 0.85),
    '--wc2': t[1],
    '--wc2a': A(t[1], 0.9),
    '--wc3': t[2],
    '--wc3a': A(t[2], 0.9),
    '--wh1': A(t[0], darkMode ? 0.28 : 0.18),
    '--wh2': A(t[1], darkMode ? 0.5 : 0.35),
  } as CSSProperties
}

/** Слой эффектов для кроссфейда: старый гаснет 700мс поверх нового. */
function FxLayer({
  mood,
  trioRef,
  alive,
  playing,
  big,
  lines,
  faded,
}: {
  mood: WaveMood
  trioRef: { current: WaveTrio }
  alive: boolean
  playing: boolean
  big?: boolean
  lines: boolean
  faded: boolean
}) {
  return (
    <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: faded ? 0 : 1 }}>
      {mood === 'fire' && <FireRing alive={alive} playing={playing} trioRef={trioRef} big={big} />}
      <MoodFx alive={alive} playing={playing} mode={mood} trioRef={trioRef} big={big} />
      <GenreFx alive={alive} playing={playing} mode={mood} trioRef={trioRef} big={big} />
      {lines && <MoodRays alive={alive} playing={playing} mode={mood} trioRef={trioRef} big={big} />}
    </div>
  )
}

/* ---------- фон: два blob'а в противофазе + линия + настроение ---------- */

export function KumaWaveBackground({
  alive = true,
  playing = false,
  dark = false,
  colors,
  genre,
  effects,
  lines = true,
  expanded = false,
  className,
}: KumaWaveBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bounceWrapRef = useRef<HTMLDivElement>(null)
  const audioEl = usePlayerRef()

  useEffect(() => {
    if (!alive) return
    const root = rootRef.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-kw-blob]'))
    const setRun = (run: boolean) => {
      for (const el of items) el.style.animationPlayState = run ? 'running' : 'paused'
    }
    const onVis = () => setRun(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) setRun(false)
          else if (!document.hidden) setRun(true)
        }
      },
      { threshold: 0 },
    )
    io.observe(root)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      io.disconnect()
    }
  }, [alive])

  const k = playing ? 0.7 : 1
  const trio: WaveTrio = colors ?? DEFAULT_TRIO
  const bg = dark ? '#141A26' : '#f0f0f5'
  // Настроение с гейтом из настроек: выключенный эффект → 'none'.
  const rawMood = waveMoodForGenre(genre)
  const mood: WaveMood = rawMood !== 'none' && effects?.[rawMood] === false ? 'none' : rawMood
  const wrapW = expanded ? 'min(62%, 680px)' : 'min(48%, 460px)'

  // Живая тройка: rAF тянет отображаемые цвета к целевым (~0.7с) — без снапов.
  // Дом читает их через CSS-переменные, канвасы — через smoothTrioRef каждый кадр.
  const smoothTrioRef = useRef<WaveTrio>(trio)
  const curRgbRef = useRef<[RGB, RGB, RGB]>(parseTrio(trio))
  const targetRgbRef = useRef<[RGB, RGB, RGB]>(parseTrio(trio))
  targetRgbRef.current = parseTrio(trio)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (!alive) {
      // Статика: сразу целевые цвета.
      const tgt = targetRgbRef.current
      curRgbRef.current = [
        [...tgt[0]] as RGB,
        [...tgt[1]] as RGB,
        [...tgt[2]] as RGB,
      ]
      writeWaveVars(root.style, curRgbRef.current, dark)
      smoothTrioRef.current = [rgbToHex(curRgbRef.current[0]), rgbToHex(curRgbRef.current[1]), rgbToHex(curRgbRef.current[2])]
      return
    }
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const cur = curRgbRef.current
      const tgt = targetRgbRef.current
      const f = Math.min(1, dt * 2.4)
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cur[i][j] += (tgt[i][j] - cur[i][j]) * f
      writeWaveVars(root.style, cur, dark)
      smoothTrioRef.current = [rgbToHex(cur[0]), rgbToHex(cur[1]), rgbToHex(cur[2])]
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [alive, dark])

  // Кроссфейд настроений: старый слой гаснет 750мс поверх нового.
  const [fxPrev, setFxPrev] = useState<{ mood: WaveMood; trio: WaveTrio } | null>(null)
  const prevMoodRef = useRef<WaveMood>(mood)
  const fxTimer = useRef(0)
  const fxPrevRef = useRef<WaveTrio>(DEFAULT_TRIO)
  useEffect(() => {
    if (prevMoodRef.current === mood) return
    setFxPrev({ mood: prevMoodRef.current, trio: smoothTrioRef.current })
    prevMoodRef.current = mood
    window.clearTimeout(fxTimer.current)
    fxTimer.current = window.setTimeout(() => setFxPrev(null), 750)
    return () => window.clearTimeout(fxTimer.current)
  }, [mood])
  if (fxPrev) fxPrevRef.current = fxPrev.trio

  // Кач: весь шар пружинит на кике (CSS scale, композитор, без layout).
  useEffect(() => {
    const el = bounceWrapRef.current
    if (!el) return
    if (mood !== 'bounce' || !alive) {
      el.style.scale = ''
      return
    }
    let raf = 0
    let e = 0.15
    let last = performance.now()
    let analyser: AnalyserNode | null = null
    let data: Uint8Array | null = null
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      let target = 0.12
      try {
        if (audioEl && !audioEl.paused) {
          if (!analyser) {
            analyser = getAnalyserNode(audioEl)
            if (analyser) data = new Uint8Array(analyser.frequencyBinCount)
          }
          if (analyser && data) {
            analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>)
            let bass = 0
            for (let i = 0; i < 3; i++) bass += data[i]
            target = Math.min(1, (bass / (3 * 255)) * 0.85 + 0.12)
          } else target = 0.4
        }
      } catch {
        target = 0.4
      }
      e += (target - e) * (target > e ? Math.min(1, dt * 16) : Math.min(1, dt * 5))
      el.style.scale = (1 + e * 0.07).toFixed(4)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      if (bounceWrapRef.current) bounceWrapRef.current.style.scale = ''
    }
  }, [mood, alive, audioEl])

  return (
    <div ref={rootRef} className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)} aria-hidden style={{ background: bg, ...trioToVars(trio, dark) }}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <filter id="kw-liquid" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.014 0.02" numOctaves="2" seed="7" result="n">
              {alive && (
                <animate
                  attributeName="baseFrequency"
                  values="0.014 0.02;0.019 0.012;0.011 0.023;0.014 0.02"
                  dur={`${10 * k}s`}
                  repeatCount="indefinite"
                />
              )}
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="110" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <style>{`
        @keyframes kw-flow-a {
          0%   { transform: translate(0%, 0%) scale(1, 1) rotate(0deg); border-radius: 42% 58% 65% 35% / 45% 42% 58% 55%; }
          25%  { transform: translate(10%, -8%) scale(1.15, 0.88) rotate(10deg); border-radius: 62% 38% 40% 60% / 55% 60% 40% 45%; }
          50%  { transform: translate(-8%, 6%) scale(0.88, 1.18) rotate(-8deg); border-radius: 38% 62% 58% 42% / 60% 40% 58% 42%; }
          75%  { transform: translate(6%, 8%) scale(1.08, 1.05) rotate(6deg); border-radius: 58% 42% 45% 55% / 42% 56% 46% 58%; }
          100% { transform: translate(0%, 0%) scale(1, 1) rotate(0deg); border-radius: 42% 58% 65% 35% / 45% 42% 58% 55%; }
        }
        @keyframes kw-flow-b {
          0%   { transform: translate(0%, 0%) scale(1.05, 0.95) rotate(0deg); border-radius: 58% 42% 42% 58% / 42% 58% 44% 58%; }
          30%  { transform: translate(-12%, 6%) scale(0.9, 1.2) rotate(-12deg); border-radius: 40% 60% 62% 38% / 58% 44% 58% 42%; }
          60%  { transform: translate(8%, -10%) scale(1.2, 0.85) rotate(10deg); border-radius: 60% 40% 38% 62% / 45% 60% 40% 55%; }
          100% { transform: translate(0%, 0%) scale(1.05, 0.95) rotate(0deg); border-radius: 58% 42% 42% 58% / 42% 58% 44% 58%; }
        }
        @keyframes kw-flow-c {
          0%   { transform: translate(0%, 0%) scale(0.95, 1.05) rotate(0deg); border-radius: 45% 55% 55% 45% / 55% 45% 55% 45%; }
          35%  { transform: translate(9%, 9%) scale(1.18, 0.9) rotate(12deg); border-radius: 60% 40% 55% 45% / 42% 58% 42% 58%; }
          70%  { transform: translate(-9%, -7%) scale(0.86, 1.15) rotate(-10deg); border-radius: 42% 58% 40% 60% / 60% 42% 58% 40%; }
          100% { transform: translate(0%, 0%) scale(0.95, 1.05) rotate(0deg); border-radius: 45% 55% 55% 45% / 55% 45% 55% 45%; }
        }
        @keyframes kw-bob-a {
          0%   { transform: translate(-6%, -8%); }
          25%  { transform: translate(7%, -3%); }
          50%  { transform: translate(5%, 8%); }
          75%  { transform: translate(-7%, 3%); }
          100% { transform: translate(-6%, -8%); }
        }
        @keyframes kw-bob-b {
          0%   { transform: translate(6%, 8%); }
          25%  { transform: translate(-7%, 3%); }
          50%  { transform: translate(-5%, -8%); }
          75%  { transform: translate(7%, -3%); }
          100% { transform: translate(6%, 8%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-kw-blob] { animation: none !important; }
        }
      `}</style>

      {/* Ореол сзади — в цвете трека */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 'min(72%, 680px)',
          aspectRatio: '1.2 / 1',
          background: 'radial-gradient(closest-side, var(--wh2) 0%, var(--wh1) 45%, rgba(0,0,0,0) 70%)',
          filter: 'blur(70px)',
        }}
      />

      {/* Слои эффектов: текущий + гаснущий предыдущий (кроссфейд 700мс) */}

      {/* Капля: два кластера в противофазе (один вверх — другой вниз) */}
      <div
        ref={bounceWrapRef}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: wrapW, aspectRatio: '1 / 1', filter: 'url(#kw-liquid)' }}
      >
        <div
          data-kw-blob
          className="absolute inset-0"
          style={{
            animation: alive ? `kw-bob-a ${7 * k}s ease-in-out infinite` : 'none',
            willChange: alive ? 'transform' : 'auto',
          }}
        >
          <div
            data-kw-blob
            className="absolute"
            style={{
              inset: '6% 22% 22% 6%',
              background: 'radial-gradient(closest-side, var(--wc1) 0%, var(--wc1a) 55%, rgba(0,0,0,0) 75%)',
              filter: 'blur(32px)',
              animation: alive ? `kw-flow-a ${8 * k}s ease-in-out infinite` : 'none',
              willChange: alive ? 'transform, border-radius' : 'auto',
            }}
          />
          <div
            data-kw-blob
            className="absolute"
            style={{
              inset: '14% 4% 8% 30%',
              background: 'radial-gradient(closest-side, var(--wc2) 0%, var(--wc2a) 55%, rgba(0,0,0,0) 75%)',
              filter: 'blur(36px)',
              animation: alive ? `kw-flow-b ${11 * k}s ease-in-out infinite` : 'none',
              willChange: alive ? 'transform, border-radius' : 'auto',
            }}
          />
        </div>
        <div
          data-kw-blob
          className="absolute inset-0"
          style={{
            animation: alive ? `kw-bob-b ${7 * k}s ease-in-out infinite` : 'none',
            willChange: alive ? 'transform' : 'auto',
          }}
        >
          <div
            data-kw-blob
            className="absolute"
            style={{
              inset: '34% 18% 2% 16%',
              background: 'radial-gradient(closest-side, var(--wc3) 0%, var(--wc3a) 55%, rgba(0,0,0,0) 75%)',
              filter: 'blur(34px)',
              animation: alive ? `kw-flow-c ${13 * k}s ease-in-out infinite` : 'none',
              willChange: alive ? 'transform, border-radius' : 'auto',
            }}
          />
        </div>
      </div>

      <FxLayer mood={mood} trioRef={smoothTrioRef} alive={alive} playing={playing} big={expanded} lines={lines} faded={false} />
      {fxPrev && (
        <FxLayer mood={fxPrev.mood} trioRef={fxPrevRef} alive={alive} playing={playing} big={expanded} lines={lines} faded />
      )}
    </div>
  )
}
