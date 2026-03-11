import { useState, useEffect } from 'react'

export function useWindowResponsive() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  })

  useEffect(() => {
    function handleResize() {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)
    handleResize() // Вызываем сразу при монтировании

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Определяем режимы
  const isCompact = windowSize.width < 900 // Компактный режим
  const isMini = windowSize.width < 600 // Мини режим (как на картинке)
  const isTiny = windowSize.width < 400 // Очень маленький

  return {
    width: windowSize.width,
    height: windowSize.height,
    isCompact,
    isMini,
    isTiny,
    mode: isTiny ? 'tiny' : isMini ? 'mini' : isCompact ? 'compact' : 'full',
  }
}
