import { useCallback, useEffect, useRef, useState } from 'react'
import { setUserSeeking } from '@/lib/player-seeking'
import { usePlayerActions, usePlayerProgress, usePlayerRef } from '@/store/player.store'

export function useProgressSeek(maxDuration: number) {
  const progress = usePlayerProgress()
  const [localProgress, setLocalProgress] = useState(progress)
  const [isSeeking, setIsSeeking] = useState(false)
  const isSeekingRef = useRef(false)
  const audioPlayerRef = usePlayerRef()
  const { setProgress } = usePlayerActions()

  useEffect(() => {
    if (!isSeekingRef.current) {
      setLocalProgress(progress)
    }
  }, [progress])

  const clamp = useCallback(
    (value: number) => Math.max(0, Math.min(value, maxDuration || 0)),
    [maxDuration],
  )

  const beginSeek = useCallback(() => {
    isSeekingRef.current = true
    setIsSeeking(true)
    setUserSeeking(true)
  }, [])

  const updateSeek = useCallback(
    (amount: number) => {
      const next = clamp(amount)
      isSeekingRef.current = true
      setIsSeeking(true)
      setUserSeeking(true)
      setLocalProgress(next)
    },
    [clamp],
  )

  const commitSeek = useCallback(
    (amount: number) => {
      if (!isSeekingRef.current) return

      const next = clamp(amount)
      isSeekingRef.current = false
      setIsSeeking(false)
      setLocalProgress(next)
      setProgress(next)

      const audio = audioPlayerRef
      if (!audio) {
        setUserSeeking(false)
        return
      }

      setUserSeeking(true)

      try {
        audio.currentTime = next
      } catch (error) {
        console.error('[useProgressSeek] Seek failed:', error)
        setUserSeeking(false)
        return
      }

      const finish = () => {
        setUserSeeking(false)
        const synced = Math.floor(audio.currentTime)
        setProgress(synced)
        setLocalProgress(synced)
      }

      audio.addEventListener('seeked', finish, { once: true })
      window.setTimeout(finish, 400)
    },
    [audioPlayerRef, clamp, setProgress],
  )

  const handlePointerUp = useCallback(() => {
    if (isSeekingRef.current) {
      commitSeek(localProgress)
    }
  }, [commitSeek, localProgress])

  const displayProgress = isSeeking ? localProgress : progress

  return {
    progress,
    localProgress,
    displayProgress,
    isSeeking,
    beginSeek,
    updateSeek,
    commitSeek,
    handlePointerUp,
  }
}
