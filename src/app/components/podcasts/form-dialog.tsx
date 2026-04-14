import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Upload } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import { z } from 'zod'
import { Button } from '@/app/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form'
import { Textarea } from '@/app/components/ui/textarea'
import { podcasts } from '@/service/podcasts'
import { createPodcastFromRSS } from '@/service/podcast-rss-parser'
import { useLocalPodcastsStore } from '@/store/local-podcasts.store'
import { useAppStore } from '@/store/app.store'
import { importPodcastsFromFile } from '@/service/podcast-import'
import { logger } from '@/utils/logger'
import { useRef } from 'react'

const urlSchema = z
  .string()
  .url({ message: 'podcasts.form.dialog.validations.url' })
  .min(10, { message: 'podcasts.form.dialog.validations.urlLength' })
  .refine((value) => /^https?:\/\//.test(value), {
    message: 'podcasts.form.dialog.validations.protocol',
  })

const textareaSchema = z
  .string({
    message: 'podcasts.form.dialog.validations.atLeastOneUrl',
  })
  .transform((value) =>
    value
      .replace(' ', '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== ''),
  )
  .refine((urls) => urls.length > 0, {
    message: 'podcasts.form.dialog.validations.atLeastOneUrl',
  })
  .refine((urls) => urls.every((url) => urlSchema.safeParse(url).success), {
    message: 'podcasts.form.dialog.validations.url',
  })

const podcastSchema = z.object({
  feedUrl: textareaSchema,
})

type PodcastSchema = z.infer<typeof podcastSchema>

interface PodcastFormDialogProps {
  open: boolean
  setOpen: (value: boolean) => void
}

const defaultValues = {
  feedUrl: [''],
}

export function PodcastFormDialog({ open, setOpen }: PodcastFormDialogProps) {
  const { t } = useTranslation()
  const { addPodcast: addLocalPodcast } = useLocalPodcastsStore()
  const { podcasts: podcastsSettings } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<PodcastSchema>({
    resolver: zodResolver(podcastSchema),
    defaultValues,
  })

  const createMutation = useMutation({
    mutationFn: podcasts.create,
    onSuccess: () => {
      toast.success(t('podcasts.form.toasts.success'))
      setOpen(false)
    },
    onError: (error) => {
      logger.error('[PodcastForm] - Error creating podcast', { error })
      toast.error(t('podcasts.form.toasts.error'))
    },
  })

  function onSubmit({ feedUrl }: PodcastSchema) {
    logger.info('[PodcastForm] - Sent body:', { body: feedUrl })

    // Проверяем, это HTML страница или RSS фид
    const isHTMLorPopularService = feedUrl.some(url => {
      try {
        const urlObj = new URL(url)
        // Проверяем популярные сервисы с HTML страницами
        const htmlServices = [
          'castbox', 'spotify', 'apple', 'youtube', 'soundcloud',
          'podcasts', 'google', 'pocketcasts', 'overcast', 'podbean'
        ]
        
        const isHTMLService = htmlServices.some(service => 
          urlObj.hostname.toLowerCase().includes(service)
        )
        
        const isRSSFeed = urlObj.pathname.endsWith('.xml') ||
                          urlObj.pathname.endsWith('.rss') ||
                          urlObj.hostname.includes('rss') ||
                          urlObj.hostname.includes('feed')
        
        return isHTMLService || isRSSFeed
      } catch {
        return false
      }
    })

    // Всегда добавляем как локальные если это HTML или RSS
    if (isHTMLorPopularService) {
      addLocalPodcastsFromURLs(feedUrl)
    } else {
      // Для обычных URL пробуем через сервер (если настроен)
      const { podcasts: podcastsSettings } = useAppStore.getState()
      const isServerConfigured = !!podcastsSettings.serviceUrl && podcastsSettings.serviceUrl.length > 0
      
      if (isServerConfigured) {
        createMutation.mutate({
          feed_urls: feedUrl,
        })
      } else {
        // Сервер не настроен - добавляем как локальные
        addLocalPodcastsFromURLs(feedUrl)
      }
    }
  }

  async function addLocalPodcastsFromURLs(urls: string[]) {
    try {
      for (const url of urls) {
        logger.info('[PodcastForm] - Adding local podcast from RSS:', url)
        
        const localPodcast = await createPodcastFromRSS(url)
        addLocalPodcast(localPodcast)
        
        logger.info('[PodcastForm] - Added local podcast:', localPodcast.title)
      }
      
      toast.success(t('podcasts.form.toasts.successLocal', { count: urls.length }))
      setOpen(false)
    } catch (error) {
      logger.error('[PodcastForm] - Error adding local podcasts', { error })
      toast.error(t('podcasts.form.toasts.errorLocal'))
    }
  }
  
  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    
    try {
      logger.info('[PodcastForm] - Importing from file:', file.name)
      const result = await importPodcastsFromFile(file)
      
      if (result.podcasts.length > 0) {
        result.podcasts.forEach(podcast => addLocalPodcast(podcast))
        toast.success(t('podcasts.form.toasts.importSuccess', { 
          count: result.podcasts.length,
          type: result.type === 'opml' ? 'OPML' : 'RSS'
        }))
        setOpen(false)
      } else {
        toast.error(t('podcasts.form.toasts.importError'))
      }
    } catch (error) {
      logger.error('[PodcastForm] - File import error:', error)
      toast.error(t('podcasts.form.toasts.importError'))
    }
    
    // Сбрасываем input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog
      defaultOpen={false}
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        form.reset(defaultValues)
      }}
    >
      <DialogContent className="max-w-[500px]" aria-describedby={undefined}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{t('podcasts.form.dialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="my-4 space-y-4">
              {/* Кнопка импорта из файла */}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".rss,.xml,.opml"
                  className="hidden"
                  onChange={handleFileImport}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {t('podcasts.form.dialog.importFromFile')}
                </Button>
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t('podcasts.form.dialog.or')}
                  </span>
                </div>
              </div>
              
              <FormField
                control={form.control}
                name="feedUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="required">
                      {t('podcasts.form.dialog.feedUrl')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        id="feed-url"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        autoComplete="off"
                        className="max-h-[160px]"
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      {t('podcasts.form.dialog.message')}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                <span>{t('podcasts.form.dialog.saveButton')}</span>
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
