/**
 * Tokyo Night Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const tokyoNight: KumaFlowTheme = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  mode: 'dark',
  description: 'Ночной Токио с фиолетово-синими оттенками',
  colors: {
    background: 'rgb(26, 27, 38)',
    'background-alternate': 'rgb(22, 22, 30)',
    foreground: 'rgb(169, 177, 214)',
    'foreground-muted': 'rgb(108, 114, 148)',
    surface: 'rgb(35, 35, 50)',
    'surface-foreground': 'rgb(169, 177, 214)',
    primary: 'rgb(125, 207, 255)',
    'primary-foreground': 'rgb(26, 27, 38)',
    'state-error': 'rgb(255, 117, 127)',
    'state-info': 'rgb(125, 207, 255)',
    'state-success': 'rgb(158, 206, 106)',
    'state-warning': 'rgb(224, 175, 104)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(108, 114, 148, 30%)',
    'scrollbar-handle-hover-background': 'rgba(125, 207, 255, 60%)',
    'scrollbar-handle-active-background': 'rgba(125, 207, 255, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
