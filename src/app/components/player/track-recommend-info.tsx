/**
 * Track Recommend Info - показывает почему трек рекомендован
 * 
 * Показывает:
 * - Кто слушал этот трек (из shared accounts)
 * - Сколько раз прослушан
 * - Behavior score (лайки, пропуски)
 */

import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/app/components/ui/tooltip'
import { usePlayerStore } from '@/store/player.store'
import type { ISong } from '@/types/responses/song'

interface TrackRecommendInfoProps {
  song: ISong
  behaviorScore?: number
}

export function TrackRecommendInfo({ song, behaviorScore }: TrackRecommendInfoProps) {
  // Берем sharedTracksInfo из player store
  const sharedTracksInfo = usePlayerStore(state => state.songlist.sharedTracksInfo)

  console.log('[TrackRecommendInfo] song:', song.artist, '-', song.title, 'ID:', song.id)
  console.log('[TrackRecommendInfo] sharedTracksInfo keys:', sharedTracksInfo ? Object.keys(sharedTracksInfo) : 'undefined')
  
  // Ищем по ID сначала
  let sharedInfo = sharedTracksInfo?.[song.id]
  
  // Если не нашли по ID - ищем по songKey
  if (!sharedInfo && sharedTracksInfo) {
    const currentSongKey = `${song.artist?.toLowerCase()}-${song.title?.toLowerCase()}`
    console.log('[TrackRecommendInfo] Looking for songKey:', currentSongKey)
    
    for (const [key, info] of Object.entries(sharedTracksInfo)) {
      if (info && (info as any).songKey === currentSongKey) {
        console.log('[TrackRecommendInfo] Found by songKey:', key)
        sharedInfo = info
        break
      }
    }
  }
  
  console.log('[TrackRecommendInfo] sharedInfo for this song:', sharedInfo)

  if (!sharedInfo && behaviorScore === undefined) {
    return null
  }

  const reasons: string[] = []

  // Причина 1: Shared listens
  if (sharedInfo && sharedInfo.accounts && sharedInfo.accounts.length > 0) {
    const uniqueAccounts = [...new Set(sharedInfo.accounts)]
    reasons.push(`👥 Слушали: ${uniqueAccounts.join(', ')}`)
    if (sharedInfo.totalPlays > 0) {
      reasons.push(`▶️ Прослушано: ${sharedInfo.totalPlays} раз`)
    }
  }

  // Причина 2: Behavior score
  if (behaviorScore !== undefined && behaviorScore > 0) {
    if (behaviorScore >= 15) {
      reasons.push('❤️ Вы часто повторяете этот трек')
    } else if (behaviorScore >= 10) {
      reasons.push('👍 Вам понравился этот трек')
    } else if (behaviorScore >= 5) {
      reasons.push('✅ Вы дослушали этот трек')
    }
  }

  if (reasons.length === 0) {
    return null
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
            <Info className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="text-xs font-medium">Почему рекомендовано:</p>
            {reasons.map((reason, i) => (
              <p key={i} className="text-xs text-muted-foreground">{reason}</p>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
