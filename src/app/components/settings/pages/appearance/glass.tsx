/**
 * KumaFlow 1.6.2 — Настройки матового стекла
 */

import { useTheme } from '@/store/theme.store'
import { Switch } from '@/app/components/ui/switch'
import { Slider } from '@/app/components/ui/slider'
import {
  Content,
  ContentItem,
  ContentItemForm,
  ContentItemTitle,
  Header,
  HeaderDescription,
  HeaderTitle,
  Root,
} from '@/app/components/settings/section'

export function GlassSettings() {
  const { glassEnabled, glassBlur, glassOpacity, setGlassEnabled, setGlassBlur, setGlassOpacity } = useTheme()

  return (
    <Root>
      <Header>
        <HeaderTitle>Эффект матового стекла</HeaderTitle>
        <HeaderDescription>
          Полупрозрачные панели с размытием фона. Можно полностью выключить для слабых машин.
        </HeaderDescription>
      </Header>
      <Content>
        <ContentItem>
          <ContentItemTitle>Включено</ContentItemTitle>
          <ContentItemForm>
            <Switch checked={glassEnabled} onCheckedChange={setGlassEnabled} />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle>Сила размытия: {glassBlur}px</ContentItemTitle>
          <ContentItemForm>
            <Slider
              value={[glassBlur]}
              min={4}
              max={24}
              step={1}
              disabled={!glassEnabled}
              onValueChange={(v) => setGlassBlur(v[0])}
            />
          </ContentItemForm>
        </ContentItem>
        <ContentItem>
          <ContentItemTitle>Плотность: {Math.round(glassOpacity * 100)}%</ContentItemTitle>
          <ContentItemForm>
            <Slider
              value={[Math.round(glassOpacity * 100)]}
              min={20}
              max={90}
              step={5}
              disabled={!glassEnabled}
              onValueChange={(v) => setGlassOpacity(v[0] / 100)}
            />
          </ContentItemForm>
        </ContentItem>
      </Content>
    </Root>
  )
}
