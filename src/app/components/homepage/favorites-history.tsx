/**
 * Favorites & History - Мне нравится + История
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerActions } from '@/store/player.store'
import { useML } from '@/store/ml.store'
import { Heart, History } from 'lucide-react'

export default function FavoritesHistory() {
  const navigate = useNavigate()
  const { setSongList } = usePlayerActions()
  const { profile, ratings } = useML()
  
  const [isLoading, setIsLoading] = useState<'favorites' | 'history' | null>(null)

  // Получаем лайкнутые треки
  const likedSongIds = profile.likedSongIds || []
  
  // Получаем историю из ratings
  const historySongs = Object.entries(ratings || {})
    .filter(([_, rating]: [string, any]) => rating.lastPlayed)
    .sort((a, b) => new Date(b[1].lastPlayed).getTime() - new Date(a[1].lastPlayed).getTime())
    .slice(0, 20)

  // Запуск "Мне нравится"
  const handlePlayFavorites = async () => {
    if (isLoading) return
    
    setIsLoading('favorites')
    
    // TODO: Загрузить лайкнутые треки и запустить
    console.log('Playing favorites:', likedSongIds.length, 'tracks')
    
    setIsLoading(null)
  }

  // Запуск "История"
  const handlePlayHistory = async () => {
    if (isLoading) return
    
    setIsLoading('history')
    
    // TODO: Загрузить историю и запустить
    console.log('Playing history:', historySongs.length, 'tracks')
    
    setIsLoading(null)
  }

  return (
    <div className="favorites-history-section">
      <h2 className="section-title">Избранное и История</h2>
      
      <div className="favorites-history-grid">
        {/* Мне нравится */}
        <div className="fh-card favorites">
          <div className="card-header">
            <div className="card-icon">
              <Heart className="w-6 h-6" />
            </div>
            <h3 className="card-title">Мне нравится</h3>
          </div>
          
          <p className="card-count">
            {likedSongIds.length} трек{likedSongIds.length === 1 ? '' : likedSongIds.length < 5 ? 'а' : 'ов'}
          </p>
          
          <div className="card-buttons">
            <button
              className="card-button play"
              onClick={handlePlayFavorites}
              disabled={isLoading === 'favorites' || likedSongIds.length === 0}
            >
              ▶️ Воспроизвести
            </button>
            
            <button
              className="card-button navigate"
              onClick={() => navigate('/favorites')}
            >
              Подробнее →
            </button>
          </div>
        </div>

        {/* История */}
        <div className="fh-card history">
          <div className="card-header">
            <div className="card-icon">
              <History className="w-6 h-6" />
            </div>
            <h3 className="card-title">История</h3>
          </div>
          
          <p className="card-count">
            {historySongs.length} треков
          </p>
          
          <div className="card-buttons">
            <button
              className="card-button play"
              onClick={handlePlayHistory}
              disabled={isLoading === 'history' || historySongs.length === 0}
            >
              ▶️ Воспроизвести
            </button>
            
            <button
              className="card-button navigate"
              onClick={() => navigate('/history')}
            >
              Подробнее →
            </button>
          </div>
        </div>
      </div>

      {/* Стили */}
      <style>{`
        .favorites-history-section {
          padding: 40px 24px;
          max-width: 1280px;
          margin: 0 auto;
        }

        .section-title {
          font-size: 24px;
          font-weight: 700;
          margin-bottom: 20px;
          color: #000;
        }

        .favorites-history-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .fh-card {
          background: white;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
          transition: all 200ms ease;
        }

        .fh-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .card-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .favorites .card-icon {
          background: linear-gradient(135deg, #FC3F1D 0%, #FF6B6B 100%);
          color: white;
        }

        .history .card-icon {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .card-title {
          font-size: 20px;
          font-weight: 700;
          color: #000;
        }

        .card-count {
          font-size: 14px;
          color: #666;
          margin-bottom: 16px;
        }

        .card-buttons {
          display: flex;
          gap: 8px;
        }

        .card-button {
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
          border: none;
          outline: none;
          flex: 1;
        }

        .card-button.play {
          background: #000;
          color: white;
        }

        .card-button.play:hover {
          background: #222;
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

        @media (max-width: 640px) {
          .favorites-history-section {
            padding: 24px 16px;
          }

          .section-title {
            font-size: 20px;
          }

          .favorites-history-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
