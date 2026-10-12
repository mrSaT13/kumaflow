import { useCallback, type RefObject } from 'react'
import {
  applyGain,
  getAudioGraph,
  resumeAudioGraph,
} from '@/features/player/audio-graph'
import type { ReplayGainParams } from '@/utils/replayGain'
import { usePlayerMediaType } from '@/store/player.store'

/**
 * Тонкая React-обёртка над общим графом из features/player/audio-graph.
 *
 * Раньше здесь жил собственный AudioContext + MediaElementSource и resetRefs()
 * на unmount, который рвал ref'ы, но НЕ разрывал ассоциацию
 * element<->source в браузере. После первого replayGainError повторный
 * createMediaElementSource на том же элементе бросал InvalidStateError до
 * конца сессии — тишина или треск вместо музыки.
 *
 * Теперь жизненным циклом графа владеет синглтон: хук ничего не разрушает.
 *
 * Принимаем САМ ref, а не audioRef.current. React присваивает ref только
 * после коммита, поэтому на этапе рендера .current ещё null. Если замкнуть
 * колбэки на это значение, они навсегда останутся no-op: resumeContext не
 * возобновит AudioContext (состояние suspended → весь звук через граф уходит
 * в никуда, элемент «играет» молча), а setupGain не применит громкость.
 * Читаем .current в момент вызова.
 */
export function useAudioContext(audioRef: RefObject<HTMLAudioElement>) {
  const { isSong } = usePlayerMediaType()

  const setupGain = useCallback(
    (gainValue: number, _replayGain?: ReplayGainParams) => {
      const audio = audioRef.current
      if (!audio) return

      if (!isSong) {
        // Радио/подкаст: Web Audio не нужен, громкость идёт в элемент.
        applyGain(audio, gainValue, 0)
        return
      }

      applyGain(audio, gainValue)
    },
    [audioRef, isSong],
  )

  const resumeContext = useCallback(async () => {
    const audio = audioRef.current
    if (!audio || !isSong) return
    await resumeAudioGraph(audio)
  }, [audioRef, isSong])

  const hasGraph = useCallback(
    () => getAudioGraph(audioRef.current) !== null,
    [audioRef],
  )

  return {
    setupGain,
    resumeContext,
    hasGraph,
  }
}