import clsx from 'clsx'
import { Share2, SlidersHorizontal } from 'lucide-react'
import { ComponentPropsWithoutRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/app/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/popover'
import { Separator } from '@/app/components/ui/separator'
import { Slider } from '@/app/components/ui/slider'
import { Switch } from '@/app/components/ui/switch'
import { cn } from '@/lib/utils'
import { useSongColor } from '@/store/player.store'
import { usePlayerStore } from '@/store/player.store'
import { buttonsStyle } from './controls'

export function FullscreenSettings() {
  const { useSongColorOnBigPlayer } = useSongColor()

  const handleShareTrack = () => {
    // Просто закрываем popover, копирование происходит в ShareTrackOption
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={clsx(
            buttonsStyle.secondary,
            'data-[state=open]:scale-110',
          )}
          style={{ ...buttonsStyle.style }}
        >
          <SlidersHorizontal className={buttonsStyle.secondaryIcon} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="top">
        <div className="flex flex-col">
          <ShareTrackOption onShare={handleShareTrack} />
          <Separator />
          <DynamicColorOption showSeparator={false} />
          {useSongColorOnBigPlayer && <ColorIntensityOption />}
          {!useSongColorOnBigPlayer && <ImageBlurSizeOption />}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function QueueSettings() {
  const { useSongColorOnQueue } = useSongColor()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 rounded-full hover:bg-foreground/20 data-[state=open]:bg-foreground/20"
        >
          <SlidersHorizontal className="size-4" strokeWidth={2.5} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" side="bottom">
        <div className="flex flex-col">
          <QueueDynamicColorOption showSeparator={false} />
          {useSongColorOnQueue && <ColorIntensityOption />}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type OptionProps = Omit<ComponentPropsWithoutRef<typeof SettingWrapper>, 'text'>

function ShareTrackOption({ onShare }: { onShare: () => void }) {
  const sharePhrases = [
    '🎧 Отличный трек!',
    '🔥 Слушай это!',
    '🎵 Включай на повтор!',
    '💯 Рекомендую!',
    '🎶 Мой хит сегодня!',
    '✨ Это стоит услышать!',
    '🚀 Просто огонь!',
    '🎵 Лови вайб!',
    '🔥 Жжёт динамики!',
    '💎 Чистое золото!',
    '⚡ Заряжено энергией!',
    '🌟 Must hear!',
    '🎤 Топчик!',
    '🎹 Музыка для души!',
    '🎸 Стоит каждого прослушивания!',
  ]

  const handleShare = () => {
    const state = usePlayerStore.getState()
    const currentSong = state.songlist?.currentSong
    
    const title = currentSong?.title || currentSong?.songTitle || currentSong?.name || ''
    const artist = currentSong?.artist || currentSong?.artistName || currentSong?.performer || ''
    
    if (!title || !artist) {
      return
    }

    const randomPhrase = sharePhrases[Math.floor(Math.random() * sharePhrases.length)]
    const shareText = `${randomPhrase} ${artist} — ${title}`
    
    navigator.clipboard.writeText(shareText)
      .then(() => {
        console.log('[ShareTrack] Copied to clipboard:', shareText)
      })
      .catch((err) => {
        console.error('[ShareTrack] Failed to copy:', err)
      })
    
    onShare()
  }

  return (
    <SettingWrapper text="Поделиться" showSeparator={false}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        className="gap-2"
      >
        <Share2 className="w-4 h-4" />
      </Button>
    </SettingWrapper>
  )
}

function DynamicColorOption(props: OptionProps) {
  const { t } = useTranslation()
  const { useSongColorOnBigPlayer, setUseSongColorOnBigPlayer } = useSongColor()

  return (
    <SettingWrapper text={t('settings.appearance.colors.group')} {...props}>
      <Switch
        checked={useSongColorOnBigPlayer}
        onCheckedChange={() =>
          setUseSongColorOnBigPlayer(!useSongColorOnBigPlayer)
        }
      />
    </SettingWrapper>
  )
}

function QueueDynamicColorOption(props: OptionProps) {
  const { t } = useTranslation()
  const { useSongColorOnQueue, setUseSongColorOnQueue } = useSongColor()

  return (
    <SettingWrapper text={t('settings.appearance.colors.group')} {...props}>
      <Switch
        checked={useSongColorOnQueue}
        onCheckedChange={() => setUseSongColorOnQueue(!useSongColorOnQueue)}
      />
    </SettingWrapper>
  )
}

function ColorIntensityOption(props: OptionProps) {
  const { t } = useTranslation()
  const { currentSongColorIntensity, setCurrentSongIntensity } = useSongColor()

  const intensityTooltip = `${Math.round(currentSongColorIntensity * 100)}%`

  return (
    <SettingWrapper
      text={t('settings.appearance.colors.queue.intensity')}
      {...props}
    >
      <Slider
        defaultValue={[currentSongColorIntensity]}
        min={0.3}
        max={1.0}
        step={0.05}
        tooltipValue={intensityTooltip}
        onValueChange={([value]) => setCurrentSongIntensity(value)}
      />
    </SettingWrapper>
  )
}

function ImageBlurSizeOption(props: OptionProps) {
  const { t } = useTranslation()
  const { bigPlayerBlur, setBigPlayerBlurValue } = useSongColor()

  return (
    <SettingWrapper
      text={t('settings.appearance.colors.bigPlayer.blurSize')}
      {...props}
    >
      <Slider
        defaultValue={[bigPlayerBlur.value]}
        min={bigPlayerBlur.settings.min}
        max={bigPlayerBlur.settings.max}
        step={bigPlayerBlur.settings.step}
        tooltipValue={`${bigPlayerBlur.value}px`}
        onValueChange={([value]) => setBigPlayerBlurValue(value)}
      />
    </SettingWrapper>
  )
}

type SettingWrapperProps = ComponentPropsWithoutRef<'div'> & {
  text: string
  showSeparator?: boolean
}

function SettingWrapper({
  text,
  className,
  children,
  showSeparator = true,
  ...props
}: SettingWrapperProps) {
  return (
    <>
      {showSeparator && <Separator />}
      <div
        className={cn('flex items-center justify-between p-3', className)}
        {...props}
      >
        <span className="text-sm flex-1 text-balance">{text}</span>
        <div className="w-2/5 flex items-center justify-end">{children}</div>
      </div>
    </>
  )
}
