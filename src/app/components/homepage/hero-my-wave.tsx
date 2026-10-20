/**
 * Hero Section "Моя Волна" - Главный баннер
 * В стиле Яндекс.Музыки с размытым анимированным градиентом
 */

import { Pause, Play, RefreshCw, Settings } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'react-toastify'
import { generateMyWavePlaylist } from '@/service/ml-wave-service'
import { clearWaveSeed } from '@/service/wave-identity'
import { readLocalWaveSettings } from '@/service/wave-settings-local'
import { useML } from '@/store/ml.store'
import { usePlayerActions, usePlayerStore } from '@/store/player.store'
import MyWaveSettings, {
  isWavePlaylistName,
  saveWaveContext,
  waveLabel,
} from './my-wave-settings'

export default function HeroMyWave() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const { ratings, profile } = useML()
  const { setSongList } = usePlayerActions()

  // Играет ли СЕЙЧАС Моя волна. Раньше кнопка была stateless: всегда рисовала
  // Play и текст «Воспроизвести», даже когда волна уже играла, а клик
  // генерировал новую волну вместо продолжения текущей.
  const isPlaying = usePlayerStore((s) => s.playerState.isPlaying)
  const playlistName = usePlayerStore((s) => s.songlist.currentPlaylistName)
  const isWaveActive = isWavePlaylistName(playlistName)

  // Генерация плейлиста "Моя Волна"
  const handlePlayMyWave = async () => {
    // Волна уже идёт — не генерируем новую, а продолжаем текущую.
    // Обычный запуск волны — сид («В стиле: …») сбрасывается, иначе капсула
    // на главной продолжит врать, что лента посажена на артиста.
    clearWaveSeed()
    if (isWaveActive && !isGenerating) {
      const st = usePlayerStore.getState()
      if (!st.playerState.isPlaying) {
        st.playerState.isPlaying = true
        usePlayerStore.setState({ playerState: { ...st.playerState } })
        document
          .querySelector('audio')
          ?.play()
          .catch(() => undefined)
      }
      return
    }
    if (isGenerating) return

    setIsGenerating(true)

    try {
      // Загружаем настройки из localStorage
      const settingsRaw = readLocalWaveSettings()

      // Проверяем есть ли реальные настройки
      const hasSettings = settingsRaw && Object.keys(settingsRaw).length > 0
      const settings = hasSettings ? settingsRaw : undefined

      console.log('[HeroMyWave] Using settings:', settings)

      const playlist = await generateMyWavePlaylist(
        profile.likedSongs || [],
        ratings,
        50,
        true,
        settings, // Передаем настройки или undefined!
      )

      if (playlist.songs.length > 0) {
        let hint = ''
        try {
          const s = settings ?? readLocalWaveSettings()
          hint = [s.activity, s.characteristic, s.mood, s.language]
            .filter(Boolean)
            .map((v: string) => waveLabel(v))
            .join('• ')
        } catch {
          /* ignore */
        }
        saveWaveContext(
          playlist.songs.map((s: { id: string }) => s.id),
          hint,
          'local',
        )
        setSongList(playlist.songs, 0, false)

        toast.success('Моя Волна: плейлист готов!', {
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
        <p className="hero-subtitle">Персональная музыкальная лента</p>

        <div className="hero-buttons">
          <button
            className="hero-button primary"
            onClick={handlePlayMyWave}
            disabled={isGenerating}
            title={isWaveActive ? 'Продолжить волну' : 'Собрать новую волну'}
          >
            {isGenerating ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : isWaveActive && isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current" />
            )}
            {isGenerating
              ? 'Генерация...'
              : isWaveActive
                ? 'Продолжить'
                : 'Воспроизвести'}
          </button>

          <button
            className="hero-button secondary"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings className="w-5 h-5" />
            Настроить
          </button>
        </div>

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
