/**
 * Hero Section "Моя Волна" - Главный баннер
 * В стиле Яндекс.Музыки с размытым анимированным градиентом
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useML } from '@/store/ml.store'
import { usePlayerActions } from '@/store/player.store'
import { generateMyWavePlaylist } from '@/service/ml-wave-service'
import { toast } from 'react-toastify'
import { Play, Settings } from 'lucide-react'
import MyWaveSettings from './my-wave-settings'

export default function HeroMyWave() {
  const navigate = useNavigate()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const { getProfile, ratings, profile } = useML()
  const { setSongList } = usePlayerActions()

  const currentProfile = getProfile()

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

        {/* Модальное окно настроек */}
        <MyWaveSettings 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
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
