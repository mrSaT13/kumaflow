/**
 * Ayu Dark Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const ayuDark: KumaFlowTheme = {
  id: 'ayu-dark',
  name: 'Ayu Dark',
  mode: 'dark',
  description: 'Минималистичная темная тема',
  colors: {
    background: 'rgb(10, 14, 22)',
    'background-alternate': 'rgb(5, 8, 14)',
    foreground: 'rgb(186, 198, 212)',
    'foreground-muted': 'rgb(92, 106, 123)',
    surface: 'rgb(18, 24, 36)',
    'surface-foreground': 'rgb(186, 198, 212)',
    primary: 'rgb(255, 184, 108)',
    'primary-foreground': 'rgb(10, 14, 22)',
    'state-error': 'rgb(255, 103, 100)',
    'state-info': 'rgb(57, 186, 230)',
    'state-success': 'rgb(217, 237, 159)',
    'state-warning': 'rgb(255, 184, 108)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(92, 106, 123, 30%)',
    'scrollbar-handle-hover-background': 'rgba(255, 184, 108, 60%)',
    'scrollbar-handle-active-background': 'rgba(255, 184, 108, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
