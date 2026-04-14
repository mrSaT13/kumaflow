import { useMemo, useState } from 'react'
import { explainRecommendation, type Explanation } from '@/service/explainable-ai'
import { useML } from '@/store/ml.store'
import type { ISong } from '@/types/responses/song'
import { Info } from 'lucide-react'

interface ExplanationTooltipProps {
  song: ISong
  children: React.ReactNode
}

export function ExplanationTooltip({ song, children }: ExplanationTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  
  const { getProfile, ratings } = useML()
  
  const explanations = useMemo(() => {
    const profile = getProfile()
    return explainRecommendation(song, profile, ratings)
  }, [song, getProfile, ratings])
  
  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {children}
      
      {showTooltip && explanations.length > 0 && (
        <div className="absolute z-50 bottom-full left-0 mb-2 w-72 bg-popover text-popover-foreground rounded-lg shadow-lg border p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Info className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Рекомендовано, потому что:</h4>
            </div>
            
            <ul className="space-y-1.5">
              {explanations.map((exp, index) => (
                <li 
                  key={index}
                  className="text-xs text-muted-foreground flex items-start gap-1.5"
                >
                  <span className="text-primary mt-0.5">•</span>
                  <span>{exp.text}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Стрелочка вниз */}
          <div className="absolute bottom-0 left-4 translate-y-1/2 rotate-180">
            <div className="w-2 h-2 bg-popover border-r border-b border-border transform rotate-45" />
          </div>
        </div>
      )}
    </div>
  )
}
