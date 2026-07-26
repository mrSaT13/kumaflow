import { router } from '@/routes/router'
import { scrollPageToTop } from '@/utils/scrollPageToTop'
import type { SettingsOptions } from '@/app/components/settings/options'

const SETTINGS_PAGES: SettingsOptions[] = [
  'appearance',
  'language',
  'audio',
  'external-api',
  'content',
  'local-music',
  'cache',
  'accounts',
  'account',
  'desktop',
  'privacy',
]

export function isValidSettingsPage(page: string): page is SettingsOptions {
  return SETTINGS_PAGES.includes(page as SettingsOptions)
}

export function getSettingsPagePath(page?: SettingsOptions) {
  return page ? `/settings/${page}` : '/settings'
}

export function openSettings(page?: SettingsOptions) {
  const path = getSettingsPagePath(page)
  void router.navigate(path)
  requestAnimationFrame(() => {
    scrollPageToTop()
  })
}
