/**
 * Shades of Purple Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const shadesOfPurple: KumaFlowTheme = {
  id: 'shades-of-purple',
  name: 'Shades of Purple',
  mode: 'dark',
  description: 'Яркая фиолетовая тема',
  colors: {
    background: 'rgb(45, 43, 85)',
    'background-alternate': 'rgb(37, 36, 71)',
    foreground: 'rgb(255, 255, 255)',
    'foreground-muted': 'rgb(176, 176, 255)',
    surface: 'rgb(67, 64, 127)',
    'surface-foreground': 'rgb(255, 255, 255)',
    primary: 'rgb(179, 97, 254)',
    'primary-foreground': 'rgb(45, 43, 85)',
    'state-error': 'rgb(255, 94, 92)',
    'state-info': 'rgb(79, 195, 247)',
    'state-success': 'rgb(80, 250, 123)',
    'state-warning': 'rgb(255, 204, 0)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(176, 176, 255, 30%)',
    'scrollbar-handle-hover-background': 'rgba(179, 97, 254, 60%)',
    'scrollbar-handle-active-background': 'rgba(179, 97, 254, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
