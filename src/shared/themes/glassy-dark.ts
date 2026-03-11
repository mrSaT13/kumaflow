/**
 * Glassy Dark Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const glassyDark: KumaFlowTheme = {
  id: 'glassy-dark',
  name: 'Glassy Dark',
  mode: 'dark',
  description: 'Темная тема с эффектом стекла',
  colors: {
    background: 'rgb(18, 18, 24)',
    'background-alternate': 'rgb(12, 12, 16)',
    foreground: 'rgb(235, 235, 245)',
    'foreground-muted': 'rgb(140, 140, 160)',
    surface: 'rgb(28, 28, 36)',
    'surface-foreground': 'rgb(235, 235, 245)',
    primary: 'rgb(116, 199, 236)',
    'primary-foreground': 'rgb(18, 18, 24)',
    'state-error': 'rgb(239, 98, 122)',
    'state-info': 'rgb(116, 199, 236)',
    'state-success': 'rgb(115, 218, 202)',
    'state-warning': 'rgb(255, 184, 82)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(140, 140, 160, 20%)',
    'scrollbar-handle-hover-background': 'rgba(116, 199, 236, 50%)',
    'scrollbar-handle-active-background': 'rgba(116, 199, 236, 70%)',
    'scrollbar-track-background': 'transparent',
  },
};
