/**
 * SplashScreen - Анимация загрузки при старте приложения
 *
 * Показывает красивый splash screen с логотипом и прогрессом загрузки
 */

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { getAppInfo } from '@/utils/appName'

interface SplashScreenProps {
  onComplete?: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Инициализация...')
  const { version } = getAppInfo()

  useEffect(() => {
    // Этапы загрузки
    const stages = [
      { progress: 10, status: 'Загрузка конфигурации...' },
      { progress: 30, status: 'Проверка подключения к серверу...' },
      { progress: 50, status: 'Загрузка данных...' },
      { progress: 70, status: 'Инициализация ML профиля...' },
      { progress: 85, status: 'Подготовка плеера...' },
      { progress: 100, status: 'Готово!' },
    ]

    let currentStage = 0

    const interval = setInterval(() => {
      if (currentStage >= stages.length) {
        clearInterval(interval)
        // Небольшая задержка перед закрытием
        setTimeout(() => {
          onComplete?.()
        }, 300)
        return
      }

      const stage = stages[currentStage]
      setProgress(stage.progress)
      setStatus(stage.status)
      currentStage++
    }, 400) // 400ms между этапами = 2.4 секунды общая загрузка

    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-emerald-950 via-blue-950 to-purple-950 flex items-center justify-center z-50">
      {/* Анимированные фоновые пятна */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      <div className="relative z-10 text-center px-8">
        {/* Логотип с анимацией */}
        <div className="relative w-32 h-32 mx-auto mb-8">
          {/* Пульсирующие кольца */}
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-ping-slow" />
          <div className="absolute inset-0 rounded-full border-2 border-blue-400/40 animate-ping-slow-delayed" />
          {/* Внешнее кольцо */}
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/30 animate-spin-slow" />

          {/* Среднее кольцо */}
          <div className="absolute inset-2 rounded-full border-4 border-blue-500/40 animate-spin-reverse-slow" />

          {/* Внутренний круг с иконкой приложения */}
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 animate-pulse flex items-center justify-center overflow-hidden">
            <img
              src="icon-192x192.png"
              alt="KumaFlow"
              className="w-14 h-14 rounded-2xl shadow-lg"
              onError={(e) => {
                // Фолбек на нотку, если иконки нет в пакете
                ;(e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
            <svg
              className="w-12 h-12 text-white absolute"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ zIndex: -1 }}
            >
              {/* Иконка музыки (фолбек) */}
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        </div>

        {/* Название */}
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
          KumaFlow
        </h1>

        <p className="text-emerald-300/80 text-sm mb-8 font-medium">
          Музыкальный плеер с ML рекомендациями
        </p>

        {/* Прогресс-бар загрузки */}
        <div className="w-64 h-1.5 bg-white/10 rounded-full mx-auto overflow-hidden backdrop-blur-sm">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              boxShadow: '0 0 20px rgba(16, 185, 129, 0.5)',
            }}
          />
        </div>

        {/* Статус загрузки */}
        <p className="text-white/50 mt-4 text-xs font-medium tracking-wide uppercase">
          {status}
        </p>

        {/* Индикатор версии */}
        <p className="text-white/30 mt-6 text-xs">
          Версия {version}
        </p>
      </div>

      {/* CSS для кастомных анимаций */}
      <style>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes spin-reverse-slow {
          from {
            transform: rotate(360deg);
          }
          to {
            transform: rotate(0deg);
          }
        }

        @keyframes ping-slow {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          80%, 100% {
            transform: scale(1.45);
            opacity: 0;
          }
        }

        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }

        .animate-spin-reverse-slow {
          animation: spin-reverse-slow 12s linear infinite;
        }

        .animate-ping-slow {
          animation: ping-slow 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
        }

        .animate-ping-slow-delayed {
          animation: ping-slow 2.4s cubic-bezier(0, 0, 0.2, 1) 1.2s infinite;
        }
      `}</style>
    </div>
  )
}
