/**
 * Gruvbox Dark Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const gruvboxDark: KumaFlowTheme = {
  id: 'gruvbox-dark',
  name: 'Gruvbox Dark',
  mode: 'dark',
  description: 'Ретро-темная тема с теплыми оттенками',
  colors: {
    background: 'rgb(40, 40, 40)',
    'background-alternate': 'rgb(29, 32, 33)',
    foreground: 'rgb(235, 219, 178)',
    'foreground-muted': 'rgb(168, 153, 132)',
    surface: 'rgb(60, 56, 54)',
    'surface-foreground': 'rgb(235, 219, 178)',
    primary: 'rgb(235, 180, 84)',
    'primary-foreground': 'rgb(40, 40, 40)',
    'state-error': 'rgb(251, 73, 52)',
    'state-info': 'rgb(131, 165, 152)',
    'state-success': 'rgb(184, 187, 38)',
    'state-warning': 'rgb(254, 128, 25)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(168, 153, 132, 30%)',
    'scrollbar-handle-hover-background': 'rgba(235, 180, 84, 60%)',
    'scrollbar-handle-active-background': 'rgba(235, 180, 84, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
