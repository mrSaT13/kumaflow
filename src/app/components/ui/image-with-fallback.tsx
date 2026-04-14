import { useState } from 'react'

interface ImageWithFallbackProps {
  src?: string
  alt: string
  className?: string
  fallback: React.ReactNode
}

export function ImageWithFallback({ src, alt, className, fallback }: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(!src)

  if (hasError || !src) {
    return <>{fallback}</>
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  )
}
