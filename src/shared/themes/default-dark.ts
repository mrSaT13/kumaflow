/**
 * Default Dark Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const defaultDark: KumaFlowTheme = {
  id: 'default-dark',
  name: 'Default Dark',
  mode: 'dark',
  description: 'Стандартная темная тема KumaFlow',
  colors: {
    background: 'rgb(12, 12, 12)',
    'background-alternate': 'rgb(8, 8, 8)',
    foreground: 'rgb(225, 225, 225)',
    'foreground-muted': 'rgb(150, 150, 150)',
    surface: 'rgb(20, 20, 20)',
    'surface-foreground': 'rgb(215, 215, 215)',
    primary: 'rgb(53, 116, 252)',
    'primary-foreground': 'rgb(255, 255, 255)',
    'state-error': 'rgb(204, 50, 50)',
    'state-info': 'rgb(53, 116, 252)',
    'state-success': 'rgb(50, 204, 50)',
    'state-warning': 'rgb(255, 120, 120)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(160, 160, 160, 20%)',
    'scrollbar-handle-hover-background': 'rgba(160, 160, 160, 60%)',
    'scrollbar-handle-active-background': 'rgba(160, 160, 160, 40%)',
    'scrollbar-track-background': 'transparent',
    'scrollbar-track-hover-background': 'transparent',
    'scrollbar-track-active-background': 'transparent',
    'scrollbar-handle-border-radius': '0',
    'scrollbar-track-border-radius': '0',
  },
};
