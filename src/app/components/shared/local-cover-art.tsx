/**
 * Компонент для отображения обложек локальных треков
 * Автоматически загружает обложку через Blob URL
 */

import { useEffect, useState } from 'react'
import { useLocalCoverArt } from '@/app/hooks/use-local-cover-art'

interface LocalCoverArtProps {
  /** Путь к файлу (если это локальный трек) */
  filePath?: string
  /** Обычный URL (для серверных треков) */
  url?: string
  /** Alt текст */
  alt?: string
  /** Дополнительные классы */
  className?: string
  /** Рендерить ли как background-image */
  asBackground?: boolean
}

export function LocalCoverArt({
  filePath,
  url,
  alt = 'Cover',
  className = '',
  asBackground = false,
}: LocalCoverArtProps) {
  const { coverUrl: localCoverUrl, loading } = useLocalCoverArt(filePath)
  const [error, setError] = useState(false)

  // Определяем какой URL использовать
  const coverUrl = filePath ? localCoverUrl : url

  useEffect(() => {
    setError(false)
  }, [coverUrl])

  if (!coverUrl || error) {
    // Placeholder если нет обложки
    return (
      <div className={`bg-muted flex items-center justify-center ${className}`}>
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    )
  }

  if (asBackground) {
    return (
      <div
        className={className}
        style={{
          backgroundImage: `url(${coverUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
    )
  }

  return (
    <img
      src={coverUrl}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      loading="lazy"
    />
  )
}
