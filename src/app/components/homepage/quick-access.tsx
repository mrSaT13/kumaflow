/**
 * Quick Access - Быстрый доступ (Для вас + Тренды)
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerActions } from '@/store/player.store'
import { generateDailyMix, generateTimeOfDayMix } from '@/service/ml-wave-service'
import { useML } from '@/store/ml.store'
import { toast } from 'react-toastify'
import { TrendingUp, Heart } from 'lucide-react'

export default function QuickAccess() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState<'for-you' | 'trends' | null>(null)
  
  const { setSongList } = usePlayerActions()
  const { getProfile, ratings } = useML()
  
  const profile = getProfile()

  // Запуск "Для вас"
  const handlePlayForYou = async () => {
    if (isLoading) return
    
    setIsLoading('for-you')
    
    try {
      const { playlist } = await generateDailyMix(
        profile.likedSongIds || [],
        profile.preferredGenres,
        profile.preferredArtists || {},
        profile.ratings || {},
        25
      )

      if (playlist.songs.length > 0) {
        setSongList(
          playlist.songs,
          0,
          false
        )

        toast.success('▶️ Для вас: плейлист готов!', {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('Ошибка генерации Для вас:', error)
      toast.error('Не удалось загрузить подборку', {
        autoClose: 3000,
      })
    } finally {
      setIsLoading(null)
    }
  }

  // Запуск "Тренды"
  const handlePlayTrends = async () => {
    if (isLoading) return
    
    setIsLoading('trends')
    
    try {
      const { songs } = await generateTimeOfDayMix(
        profile.likedSongIds || [],
        ratings,
        profile.preferredGenres,
        25
      )

      if (songs.length > 0) {
        setSongList(
          songs,
          0,
          false
        )

        toast.success('▶️ Тренды: плейлист готов!', {
          autoClose: 2000,
        })
      }
    } catch (error) {
      console.error('Ошибка генерации Тренды:', error)
      toast.error('Не удалось загрузить тренды', {
        autoClose: 3000,
      })
    } finally {
      setIsLoading(null)
    }
  }

  return (
    <div className="quick-access-section">
      <h2 className="section-title">Быстрый доступ</h2>
      
      <div className="quick-access-grid">
        {/* Карточка "Для вас" */}
        <div className="quick-access-card for-you">
          <div className="card-icon">
            <Heart className="w-8 h-8" />
          </div>
          
          <h3 className="card-title">Для вас</h3>
          <p className="card-subtitle">
            Персональная подборка на основе ваших вкусов
          </p>
          
          <div className="card-buttons">
            <button
              className="card-button play"
              onClick={handlePlayForYou}
              disabled={isLoading === 'for-you'}
            >
              ▶️ Воспроизвести
            </button>
            
            <button
              className="card-button navigate"
              onClick={() => navigate('/ml/for-you')}
            >
              Подробнее →
            </button>
          </div>
        </div>

        {/* Карточка "Тренды" */}
        <div className="quick-access-card trends">
          <div className="card-icon">
            <TrendingUp className="w-8 h-8" />
          </div>
          
          <h3 className="card-title">Тренды</h3>
          <p className="card-subtitle">
            Популярное сейчас и новые открытия
          </p>
          
          <div className="card-buttons">
            <button
              className="card-button play"
              onClick={handlePlayTrends}
              disabled={isLoading === 'trends'}
            >
              ▶️ Воспроизвести
            </button>
            
            <button
              className="card-button navigate"
              onClick={() => navigate('/ml/for-you?tab=trends')}
            >
              Подробнее →
            </button>
          </div>
        </div>
      </div>

      {/* Стили */}
      <style>{`
        .quick-access-section {
          padding: 40px 24px;
          max-width: 1280px;
          margin: 0 auto;
        }

        .section-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 24px;
          color: #000;
        }

        .quick-access-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .quick-access-card {
          background: white;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          transition: all 200ms ease;
        }

        .quick-access-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
        }

        .card-icon {
          width: 64px;
          height: 64px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }

        .for-you .card-icon {
          background: linear-gradient(135deg, #FC3F1D 0%, #FFCC00 100%);
          color: white;
        }

        .trends .card-icon {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .card-title {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #000;
        }

        .card-subtitle {
          font-size: 14px;
          color: #666;
          margin-bottom: 20px;
          line-height: 1.5;
        }

        .card-buttons {
          display: flex;
          gap: 12px;
        }

        .card-button {
          padding: 12px 20px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
          border: none;
          outline: none;
        }

        .card-button.play {
          background: #000;
          color: white;
          flex: 1;
        }

        .card-button.play:hover {
          background: #222;
          transform: translateY(-2px);
        }

        .card-button.play:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .card-button.navigate {
          background: #f0f0f0;
          color: #333;
        }

        .card-button.navigate:hover {
          background: #e0e0e0;
        }

        /* Mobile адаптация */}
        @media (max-width: 640px) {
          .quick-access-section {
            padding: 24px 16px;
          }

          .section-title {
            font-size: 24px;
          }

          .quick-access-grid {
            grid-template-columns: 1fr;
          }

          .card-buttons {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  )
}
