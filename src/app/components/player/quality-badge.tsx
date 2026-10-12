import { useMemo } from 'react'
import { Badge } from '@/app/components/ui/badge'
import { ISong } from '@/types/responses/song'

interface QualityBadgeProps {
  song: ISong
}

/**
 * Quality Badge - отображение качества трека
 * Показывает: Hi-Res, CD, 320kbps, 192kbps и т.д.
 */
export function QualityBadge({ song }: QualityBadgeProps) {
  const quality = useMemo(() => {
    // Hi-Res Audio (24-bit / 96kHz+)
    if (song.bitDepth === 24 || (song.samplingRate && song.samplingRate >= 96000)) {
      return { 
        label: 'Hi-Res', 
        variant: 'default' as const,
        className: 'bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-700 hover:to-amber-700 text-white border-yellow-500'
      }
    }
    
    // CD Quality (16-bit / 44.1kHz)
    if (song.bitDepth === 16 || (song.samplingRate && song.samplingRate >= 44100)) {
      return { 
        label: 'CD', 
        variant: 'secondary' as const,
        className: 'bg-gradient-to-r from-gray-400 to-silver-500 hover:from-gray-500 hover:to-silver-600 text-white border-gray-400'
      }
    }
    
    // High bitrate (320kbps+)
    if (song.bitRate >= 320) {
      return { 
        label: '320kbps', 
        variant: 'default' as const,
        className: 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white border-green-500'
      }
    }
    
    // Medium bitrate (192-320kbps)
    if (song.bitRate >= 192) {
      return { 
        label: `${song.bitRate}kbps`, 
        variant: 'secondary' as const,
        className: 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white border-yellow-500'
      }
    }
    
    // Low bitrate (<192kbps)
    if (song.bitRate >= 128) {
      return { 
        label: `${song.bitRate}kbps`, 
        variant: 'outline' as const,
        className: 'bg-transparent border-gray-500 text-gray-400'
      }
    }
    
    // Very low bitrate or unknown
    return { 
      label: song.suffix?.toUpperCase() || 'Unknown', 
      variant: 'outline' as const,
      className: 'bg-transparent border-gray-600 text-gray-500'
    }
  }, [song.bitDepth, song.bitRate, song.samplingRate, song.suffix])

  return (
    <Badge 
      variant={quality.variant} 
      className={`text-[10px] font-medium px-1.5 py-0 h-4 ${quality.className} cursor-default`}
      title={getQualityDescription(song)}
    >
      {quality.label}
    </Badge>
  )
}

/**
 * Описание качества для tooltip
 */
function getQualityDescription(song: ISong): string {
  const parts: string[] = []
  
  if (song.bitDepth) {
    parts.push(`${song.bitDepth}-bit`)
  }
  
  if (song.samplingRate) {
    parts.push(`${(song.samplingRate / 1000).toFixed(1)} kHz`)
  }
  
  if (song.bitRate) {
    parts.push(`${song.bitRate} kbps`)
  }
  
  if (song.suffix) {
    parts.push(song.suffix.toUpperCase())
  }
  
  return parts.join(' • ') || 'Информация о качестве недоступна'
}
