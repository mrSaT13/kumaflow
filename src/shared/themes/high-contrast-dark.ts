/**
 * High Contrast Dark Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const highContrastDark: KumaFlowTheme = {
  id: 'high-contrast-dark',
  name: 'High Contrast Dark',
  mode: 'dark',
  description: 'Тема с высоким контрастом для лучшей видимости',
  colors: {
    background: 'rgb(0, 0, 0)',
    'background-alternate': 'rgb(10, 10, 10)',
    foreground: 'rgb(255, 255, 255)',
    'foreground-muted': 'rgb(200, 200, 200)',
    surface: 'rgb(20, 20, 20)',
    'surface-foreground': 'rgb(255, 255, 255)',
    primary: 'rgb(0, 255, 255)',
    'primary-foreground': 'rgb(0, 0, 0)',
    'state-error': 'rgb(255, 100, 100)',
    'state-info': 'rgb(100, 200, 255)',
    'state-success': 'rgb(100, 255, 100)',
    'state-warning': 'rgb(255, 255, 100)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '12px',
    'scrollbar-handle-background': 'rgba(255, 255, 255, 50%)',
    'scrollbar-handle-hover-background': 'rgba(0, 255, 255, 80%)',
    'scrollbar-handle-active-background': 'rgba(0, 255, 255, 100%)',
    'scrollbar-track-background': 'rgba(255, 255, 255, 10%)',
  },
};
