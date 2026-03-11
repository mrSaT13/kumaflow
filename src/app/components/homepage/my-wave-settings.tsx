/**
 * My Wave Settings - Настройки "Моя Волна"
 * Модальное окно с настройками персонализации
 */

import { useState } from 'react'
import { useML } from '@/store/ml.store'
import { toast } from 'react-toastify'
import { X, RefreshCw, Heart, Sparkles, Zap, Music, Mic } from 'lucide-react'

interface MyWaveSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export default function MyWaveSettings({ isOpen, onClose }: MyWaveSettingsProps) {
  const { profile } = useML()
  
  // Состояния настроек
  const [activity, setActivity] = useState<string>('')
  const [characteristic, setCharacteristic] = useState<string>('')
  const [mood, setMood] = useState<string>('')
  const [language, setLanguage] = useState<string>('')

  if (!isOpen) return null

  const handleSave = () => {
    // Сохраняем настройки в localStorage
    const settings = { activity, characteristic, mood, language }
    localStorage.setItem('my-wave-settings', JSON.stringify(settings))
    
    console.log('Saving My Wave settings:', settings)
    
    // TODO: Интегрировать с ML и Оркестратором
    // Нужно передать эти параметры в generateMyWavePlaylist
    toast.success('Настройки сохранены!', {
      autoClose: 1500,
    })
    
    onClose()
  }

  const handleReset = () => {
    setActivity('')
    setCharacteristic('')
    setMood('')
    setLanguage('')
  }

  return (
    <div className="my-wave-settings-overlay" onClick={onClose}>
      <div className="my-wave-settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="settings-header">
          <div className="header-left">
            <Music className="w-6 h-6 text-orange-500" />
            <h2 className="settings-title">Настроить Мою Волну</h2>
          </div>
          <div className="header-right">
            <button className="icon-button reset" onClick={handleReset} title="Сбросить">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button className="icon-button close" onClick={onClose} title="Закрыть">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Под занятие */}
        <div className="settings-section">
          <h3 className="section-title">Под занятие</h3>
          <div className="oval-buttons">
            <button
              className={`oval-button ${activity === 'wakeup' ? 'active' : ''}`}
              onClick={() => setActivity(activity === 'wakeup' ? '' : 'wakeup')}
            >
              ☀️ Просыпаюсь
            </button>
            <button
              className={`oval-button ${activity === 'commute' ? 'active' : ''}`}
              onClick={() => setActivity(activity === 'commute' ? '' : 'commute')}
            >
              🚗 В дороге
            </button>
            <button
              className={`oval-button ${activity === 'work' ? 'active' : ''}`}
              onClick={() => setActivity(activity === 'work' ? '' : 'work')}
            >
              💻 Работаю
            </button>
            <button
              className={`oval-button ${activity === 'workout' ? 'active' : ''}`}
              onClick={() => setActivity(activity === 'workout' ? '' : 'workout')}
            >
              🏋️ Тренируюсь
            </button>
            <button
              className={`oval-button ${activity === 'sleep' ? 'active' : ''}`}
              onClick={() => setActivity(activity === 'sleep' ? '' : 'sleep')}
            >
              🌙 Засыпаю
            </button>
          </div>
        </div>

        {/* По характеру */}
        <div className="settings-section">
          <h3 className="section-title">По характеру</h3>
          <div className="character-buttons">
            <button
              className={`character-button ${characteristic === 'favorite' ? 'active' : ''}`}
              onClick={() => setCharacteristic(characteristic === 'favorite' ? '' : 'favorite')}
            >
              <Heart className={`w-5 h-5 ${characteristic === 'favorite' ? 'fill-red-500 text-red-500' : ''}`} />
              <span>Любимое</span>
            </button>
            <button
              className={`character-button ${characteristic === 'unfamiliar' ? 'active' : ''}`}
              onClick={() => setCharacteristic(characteristic === 'unfamiliar' ? '' : 'unfamiliar')}
            >
              <Sparkles className={`w-5 h-5 ${characteristic === 'unfamiliar' ? 'fill-purple-500 text-purple-500' : ''}`} />
              <span>Незнакомое</span>
            </button>
            <button
              className={`character-button ${characteristic === 'popular' ? 'active' : ''}`}
              onClick={() => setCharacteristic(characteristic === 'popular' ? '' : 'popular')}
            >
              <Zap className={`w-5 h-5 ${characteristic === 'popular' ? 'fill-yellow-500 text-yellow-500' : ''}`} />
              <span>Популярное</span>
            </button>
          </div>
        </div>

        {/* По настроению */}
        <div className="settings-section">
          <h3 className="section-title">По настроению</h3>
          <div className="mood-buttons">
            <button
              className={`mood-button energetic ${mood === 'energetic' ? 'active' : ''}`}
              onClick={() => setMood(mood === 'energetic' ? '' : 'energetic')}
            >
              Бодрое
            </button>
            <button
              className={`mood-button happy ${mood === 'happy' ? 'active' : ''}`}
              onClick={() => setMood(mood === 'happy' ? '' : 'happy')}
            >
              Весёлое
            </button>
            <button
              className={`mood-button calm ${mood === 'calm' ? 'active' : ''}`}
              onClick={() => setMood(mood === 'calm' ? '' : 'calm')}
            >
              Спокойное
            </button>
            <button
              className={`mood-button sad ${mood === 'sad' ? 'active' : ''}`}
              onClick={() => setMood(mood === 'sad' ? '' : 'sad')}
            >
              Грустное
            </button>
          </div>
        </div>

        {/* По языку */}
        <div className="settings-section">
          <h3 className="section-title">По языку</h3>
          <div className="language-buttons">
            <button
              className={`language-button ${language === 'russian' ? 'active' : ''}`}
              onClick={() => setLanguage(language === 'russian' ? '' : 'russian')}
            >
              🇷🇺 Русский
            </button>
            <button
              className={`language-button ${language === 'foreign' ? 'active' : ''}`}
              onClick={() => setLanguage(language === 'foreign' ? '' : 'foreign')}
            >
              🌍 Иностранный
            </button>
            <button
              className={`language-button ${language === 'instrumental' ? 'active' : ''}`}
              onClick={() => setLanguage(language === 'instrumental' ? '' : 'instrumental')}
            >
              <Mic className="w-4 h-4" />
              Без слов
            </button>
          </div>
        </div>

        {/* Кнопка сохранить */}
        <div className="settings-footer">
          <button className="save-button" onClick={handleSave}>
            Сохранить
          </button>
        </div>
      </div>

      {/* Стили */}
      <style>{`
        .my-wave-settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 200ms ease;
        }

        .my-wave-settings-modal {
          background: white;
          border-radius: 24px;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 300ms ease;
        }

        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid #f0f0f0;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .settings-title {
          font-size: 24px;
          font-weight: 700;
          color: #000;
        }

        .header-right {
          display: flex;
          gap: 8px;
        }

        .icon-button {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: none;
          background: #f0f0f0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 200ms ease;
        }

        .icon-button.reset:hover {
          background: #e0e0e0;
          transform: rotate(90deg);
        }

        .icon-button.close:hover {
          background: #ff4444;
          color: white;
        }

        .settings-section {
          margin-bottom: 24px;
        }

        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #666;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .oval-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .oval-button {
          padding: 10px 20px;
          border-radius: 9999px;
          border: 2px solid #e0e0e0;
          background: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .oval-button:hover {
          border-color: #667eea;
          background: #f5f5ff;
        }

        .oval-button.active {
          border-color: #667eea;
          background: #667eea;
          color: white;
        }

        .character-buttons {
          display: flex;
          gap: 12px;
        }

        .character-button {
          flex: 1;
          padding: 16px;
          border-radius: 16px;
          border: 2px solid #e0e0e0;
          background: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .character-button:hover {
          border-color: #667eea;
          background: #f5f5ff;
        }

        .character-button.active {
          border-color: #667eea;
          background: #667eea;
          color: white;
        }

        .mood-buttons {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }

        .mood-button {
          aspect-ratio: 1;
          border-radius: 50%;
          border: 3px solid transparent;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms ease;
          color: white;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .mood-button.energetic {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        .mood-button.happy {
          background: linear-gradient(135deg, #fccb90 0%, #d57eeb 100%);
        }

        .mood-button.calm {
          background: linear-gradient(135deg, #5ee7df 0%, #b490ca 100%);
        }

        .mood-button.sad {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .mood-button:hover {
          transform: scale(1.05);
        }

        .mood-button.active {
          border-color: white;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .language-buttons {
          display: flex;
          gap: 8px;
        }

        .language-button {
          flex: 1;
          padding: 12px 16px;
          border-radius: 12px;
          border: 2px solid #e0e0e0;
          background: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 200ms ease;
        }

        .language-button:hover {
          border-color: #667eea;
          background: #f5f5ff;
        }

        .language-button.active {
          border-color: #667eea;
          background: #667eea;
          color: white;
        }

        .settings-footer {
          padding-top: 16px;
          border-top: 2px solid #f0f0f0;
        }

        .save-button {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          border: none;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .save-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @media (max-width: 640px) {
          .my-wave-settings-modal {
            width: 95%;
            padding: 16px;
          }

          .mood-buttons {
            grid-template-columns: repeat(2, 1fr);
          }

          .character-buttons {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  )
}
