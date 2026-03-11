/**
 * Material Dark Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const materialDark: KumaFlowTheme = {
  id: 'material-dark',
  name: 'Material Dark',
  mode: 'dark',
  description: 'Темная тема в стиле Material Design',
  colors: {
    background: 'rgb(36, 36, 36)',
    'background-alternate': 'rgb(30, 30, 30)',
    foreground: 'rgb(230, 230, 230)',
    'foreground-muted': 'rgb(150, 150, 150)',
    surface: 'rgb(48, 48, 48)',
    'surface-foreground': 'rgb(230, 230, 230)',
    primary: 'rgb(66, 165, 245)',
    'primary-foreground': 'rgb(36, 36, 36)',
    'state-error': 'rgb(229, 115, 115)',
    'state-info': 'rgb(66, 165, 245)',
    'state-success': 'rgb(102, 187, 106)',
    'state-warning': 'rgb(255, 183, 77)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(150, 150, 150, 30%)',
    'scrollbar-handle-hover-background': 'rgba(66, 165, 245, 60%)',
    'scrollbar-handle-active-background': 'rgba(66, 165, 245, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
