/**
 * Hero Section "Моя Волна" - Главный баннер
 * В стиле Яндекс.Музыки с размытым анимированным градиентом
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useML } from '@/store/ml.store'
import { usePlayerActions, usePlayerStore } from '@/store/player.store'
import { generateMyWavePlaylist } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import { Play, Settings, Smartphone } from 'lucide-react'
import MyWaveSettings from './my-wave-settings'
import { saveWaveContext, waveLabel } from './my-wave-settings'
import { isBrainActive } from '@/store/brain.store'
import {
  formatResumeTime,
  getWaveDeviceId,
  getWaveDeviceName,
  waveResume,
  waveSeedClear,
  waveSeedGet,
  type BrainSeed,
} from '@/service/brain-wave'
import { subsonic } from '@/service/subsonic'
import type { ISong } from '@/types/responses/song'

interface ResumePill {
  targetId: string
  trackId: string
  pos: number
  queue: string[]
  deviceLabel: string
}

export default function HeroMyWave() {
  const navigate = useNavigate()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // W5a: пилюля «Продолжить с …» — персистентная, не только тост при старте.
  // Мобайл шлёт device='android' (не UUID), поэтому чужим считаем всё,
  // что не равно нашему UUID (имя — только фолбек для старых слотов).
  const [resumePill, setResumePill] = useState<ResumePill | null>(null)
  // W4: капсула активного сида радио («волна по X»)
  const [seedCapsule, setSeedCapsule] = useState<BrainSeed | null>(null)

  const { getProfile, ratings, profile } = useML()
  const { setSongList } = usePlayerActions()

  const currentProfile = getProfile()

  const refreshResumePill = async () => {
    try {
      if (!isBrainActive()) {
        setResumePill(null)
        return
      }
      const resume = await waveResume()
      if (!resume) {
        setResumePill(null)
        return
      }
      const targetId = (resume.external_id || resume.track_id || '').trim()
      if (!targetId) {
        setResumePill(null)
        return
      }
      if (resume.device && resume.device === getWaveDeviceId()) return // сами играли
      if (!resume.device && resume.device_name && resume.device_name === getWaveDeviceName()) return
      const pos = Math.floor(resume.position_sec ?? 0)
      const queue = (resume.queue ?? []).filter(Boolean).slice(0, 30)
      // Показываем если есть позиция ИЛИ хвост очереди (раньше требовали pos>=5
      // и только тост — поэтому «при запуске не отображает»)
      if (pos < 5 && queue.length === 0) {
        setResumePill(null)
        return
      }
      setResumePill({
        targetId,
        trackId: resume.track_id,
        pos,
        queue: queue.filter((q) => q !== targetId && q !== resume.track_id),
        deviceLabel: resume.device_name || resume.device || 'другого устройства',
      })
    } catch {
      /* best-effort */
    }
  }

  const refreshSeedCapsule = async () => {
    try {
      if (!isBrainActive()) {
        setSeedCapsule(null)
        return
      }
      setSeedCapsule(await waveSeedGet())
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    void refreshResumePill()
    void refreshSeedCapsule()
    const t = setInterval(() => {
      void refreshResumePill()
      void refreshSeedCapsule()
    }, 30000)
    const onSeed = () => void refreshSeedCapsule()
    try {
      window.addEventListener('kfbrain-seed-changed', onSeed)
    } catch { /* ignore */ }
    return () => {
      clearInterval(t)
      try {
        window.removeEventListener('kfbrain-seed-changed', onSeed)
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleResumePill = async () => {
    if (!resumePill) return
    try {
      const song = await subsonic.songs.getSong(resumePill.targetId).catch(() => null)
      if (!song) {
        toast.error('Трек с телефона не найден в библиотеке')
        return
      }
      const rest = (
        await Promise.all(
          resumePill.queue.map((qid) => subsonic.songs.getSong(qid).catch(() => null)),
        )
      ).filter((s): s is ISong => !!s)
      setSongList([song as ISong, ...rest], 0)
      if (resumePill.pos > 0) {
        const pos = resumePill.pos
        setTimeout(() => {
          try {
            usePlayerStore.getState().actions.setProgress(pos)
          } catch { /* best-effort */ }
        }, 800)
      }
      toast.success('Продолжили с телефона', { autoClose: 2000 })
      setResumePill(null)
    } catch {
      toast.error('Не получилось продолжить с телефона')
    }
  }

  // Генерация плейлиста "Моя Волна"
  const handlePlayMyWave = async () => {
    if (isGenerating) return

    setIsGenerating(true)

    try {
      // Загружаем настройки из localStorage
      const settingsRaw = JSON.parse(localStorage.getItem('my-wave-settings') || '{}')
      
      // Проверяем есть ли реальные настройки
      const hasSettings = settingsRaw && Object.keys(settingsRaw).length > 0
      const settings = hasSettings ? settingsRaw : undefined
      
      console.log('[HeroMyWave] Using settings:', settings)

      const playlist = await generateMyWavePlaylist(
        profile.likedSongIds || [],
        ratings,
        50,
        true,
        settings  // Передаем настройки или undefined!
      )

      if (playlist.songs.length > 0) {
        let hint = ''
        try {
          const s = settings ?? JSON.parse(localStorage.getItem('my-wave-settings') || '{}')
          hint = [s.activity, s.characteristic, s.mood, s.language]
            .filter(Boolean)
            .map((v: string) => waveLabel(v))
            .join(' • ')
        } catch { /* ignore */ }
        saveWaveContext(
          playlist.songs.map((s: { id: string }) => s.id),
          hint,
          'local',
        )
        setSongList(
          playlist.songs,
          0,
          false
        )

        toast.success('🎵 Моя Волна: плейлист готов!', {
          autoClose: 2000,
        })
      } else {
        toast.error('Не удалось сгенерировать плейлист', {
          autoClose: 3000,
        })
      }
    } catch (error) {
      console.error('Ошибка генерации Моя Волна:', error)
      toast.error('Ошибка генерации плейлиста', {
        autoClose: 3000,
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="hero-my-wave">
      {/* Анимированный градиентный фон */}
      <div className="hero-background">
        <div className="gradient-wave" />
      </div>

      {/* Контент */}
      <div className="hero-content">
        <div className="hero-icon-wrapper">
          <svg viewBox="0 0 24 24" fill="currentColor" className="hero-icon">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>

        <h1 className="hero-title" onClick={handlePlayMyWave}>
          МОЯ ВОЛНА
        </h1>
        <p className="hero-subtitle">
          Персональная музыкальная лента
        </p>

        <div className="hero-buttons">
          <button
            className="hero-button primary"
            onClick={handlePlayMyWave}
            disabled={isGenerating}
          >
            <Play className="w-5 h-5 fill-current" />
            {isGenerating ? 'Генерация...' : 'Воспроизвести'}
          </button>

          <button
            className="hero-button secondary"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings className="w-5 h-5" />
            Настроить
          </button>
        </div>

        {/* W5a: пилюля «Продолжить с …» — персистентная */}
        {resumePill ? (
          <button
            className="hero-resume-pill"
            onClick={() => void handleResumePill()}
            title={`Продолжить с ${resumePill.deviceLabel}`}
          >
            <Smartphone className="w-4 h-4" />
            Продолжить с {resumePill.deviceLabel}
            {resumePill.pos > 0 ? ` — ${formatResumeTime(resumePill.pos)}` : ''}
          </button>
        ) : null}

        {/* W4: капсула активного сида радио */}
        {seedCapsule ? (
          <div className="hero-seed-capsule">
            <span className="hero-seed-label">
              📻 Волна по {seedCapsule.label || seedCapsule.ref}
            </span>
            <button
              className="hero-seed-clear"
              title="Сбросить сид (волна снова обычная)"
              onClick={() => {
                void (async () => {
                  if (await waveSeedClear()) {
                    setSeedCapsule(null)
                    try {
                      window.dispatchEvent(new Event('kfbrain-seed-changed'))
                    } catch { /* ignore */ }
                  }
                })()
              }}
            >
              ✕
            </button>
          </div>
        ) : null}

        {/* Модальное окно настроек */}
        <MyWaveSettings 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onApplied={handlePlayMyWave}
        />
      </div>

      {/* Стили */}
      <style>{`
        .hero-my-wave {
          position: relative;
          height: 400px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 24px;
          margin: 24px;
          background: #1a1a2e;
        }

        .hero-background {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }

        .gradient-wave {
          position: absolute;
          inset: -50%;
          background: linear-gradient(
            135deg,
            #667eea 0%,
            #f093fb 25%,
            #FC3F1D 50%,
            #ff6b6b 75%,
            #667eea 100%
          );
          background-size: 400% 400%;
          animation: gradientShift 15s ease infinite;
          filter: blur(80px);
          opacity: 0.6;
        }

        @keyframes gradientShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .hero-content {
          position: relative;
          z-index: 1;
          text-align: center;
          color: white;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
          padding: 0 24px;
        }

        .hero-icon-wrapper {
          margin-bottom: 24px;
          animation: fadeInUp 600ms ease-out;
        }

        .hero-icon {
          width: 64px;
          height: 64px;
          filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
        }

        .hero-title {
          font-size: 48px;
          font-weight: 700;
          margin-bottom: 12px;
          letter-spacing: -0.5px;
          animation: fadeInUp 600ms ease-out 100ms backwards;
          transition: transform 200ms ease;
        }

        .hero-title:hover {
          transform: scale(1.02);
        }

        .hero-subtitle {
          font-size: 18px;
          margin-bottom: 32px;
          opacity: 0.95;
          animation: fadeInUp 600ms ease-out 200ms backwards;
        }

        .hero-buttons {
          display: flex;
          gap: 16px;
          justify-content: center;
          animation: fadeInUp 600ms ease-out 300ms backwards;
        }

        .hero-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 16px 32px;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
          border: none;
          outline: none;
        }

        .hero-button.primary {
          background: white;
          color: #1a1a2e;
        }

        .hero-button.primary:hover {
          background: rgba(255, 255, 255, 0.9);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255, 255, 255, 0.3);
        }

        .hero-button.primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .hero-button.secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          backdrop-filter: blur(10px);
        }

        .hero-button.secondary:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }

        .hero-resume-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 16px;
          padding: 10px 20px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.4);
          background: rgba(0, 0, 0, 0.35);
          color: white;
          backdrop-filter: blur(10px);
          transition: all 200ms ease;
          animation: fadeInUp 600ms ease-out 400ms backwards;
        }

        .hero-resume-pill:hover {
          background: rgba(0, 0, 0, 0.55);
          transform: translateY(-2px);
        }

        .hero-seed-capsule {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          margin-left: 8px;
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          background: rgba(0, 0, 0, 0.35);
          color: white;
          border: 1px dashed rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(10px);
          animation: fadeInUp 600ms ease-out 450ms backwards;
        }

        .hero-seed-clear {
          cursor: pointer;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          font-size: 13px;
          padding: 0 2px;
        }

        .hero-seed-clear:hover {
          color: white;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Mobile адаптация */
        @media (max-width: 640px) {
          .hero-my-wave {
            height: 320px;
            margin: 16px;
            border-radius: 16px;
          }

          .hero-title {
            font-size: 32px;
          }

          .hero-subtitle {
            font-size: 14px;
          }

          .hero-buttons {
            flex-direction: column;
            width: 100%;
          }

          .hero-button {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  )
}
