import { ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card'
import { cn } from '@/lib/utils'

interface SettingsCardProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function SettingsCard({
  title,
  description,
  children,
  className,
}: SettingsCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

interface SettingsRowProps {
  label: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
}

export function SettingsRow({
  label,
  description,
  children,
  className,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-border/60 py-3 last:border-b-0 last:pb-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-medium leading-snug">{label}</div>
        {description && (
          <div className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:justify-end">{children}</div>
    </div>
  )
}

export function SettingsSection({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y divide-border/60', className)}>{children}</div>
}
