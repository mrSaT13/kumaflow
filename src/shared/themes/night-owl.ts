/**
 * Night Owl Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const nightOwl: KumaFlowTheme = {
  id: 'night-owl',
  name: 'Night Owl',
  mode: 'dark',
  description: 'Темная тема для ночных сов',
  colors: {
    background: 'rgb(1, 22, 39)',
    'background-alternate': 'rgb(0, 15, 28)',
    foreground: 'rgb(214, 222, 235)',
    'foreground-muted': 'rgb(109, 126, 148)',
    surface: 'rgb(15, 38, 62)',
    'surface-foreground': 'rgb(214, 222, 235)',
    primary: 'rgb(128, 203, 196)',
    'primary-foreground': 'rgb(1, 22, 39)',
    'state-error': 'rgb(255, 105, 180)',
    'state-info': 'rgb(128, 203, 196)',
    'state-success': 'rgb(195, 232, 141)',
    'state-warning': 'rgb(255, 203, 139)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(109, 126, 148, 30%)',
    'scrollbar-handle-hover-background': 'rgba(128, 203, 196, 60%)',
    'scrollbar-handle-active-background': 'rgba(128, 203, 196, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
