/**
 * Solarized Dark Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const solarizedDark: KumaFlowTheme = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  mode: 'dark',
  description: 'Классическая тема с точным балансом контраста',
  colors: {
    background: 'rgb(0, 43, 54)',
    'background-alternate': 'rgb(7, 54, 66)',
    foreground: 'rgb(131, 148, 150)',
    'foreground-muted': 'rgb(88, 110, 117)',
    surface: 'rgb(7, 54, 66)',
    'surface-foreground': 'rgb(131, 148, 150)',
    primary: 'rgb(133, 153, 0)',
    'primary-foreground': 'rgb(0, 43, 54)',
    'state-error': 'rgb(220, 50, 47)',
    'state-info': 'rgb(38, 139, 210)',
    'state-success': 'rgb(133, 153, 0)',
    'state-warning': 'rgb(203, 75, 22)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(88, 110, 117, 30%)',
    'scrollbar-handle-hover-background': 'rgba(133, 153, 0, 60%)',
    'scrollbar-handle-active-background': 'rgba(133, 153, 0, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
