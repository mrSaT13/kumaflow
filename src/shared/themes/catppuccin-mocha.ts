/**
 * Catppuccin Mocha Theme
 * Адаптировано из Feishin
 * https://github.com/catppuccin/catppuccin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const catppuccinMocha: KumaFlowTheme = {
  id: 'catppuccin-mocha',
  name: 'Catppuccin Mocha',
  mode: 'dark',
  description: 'Мягкая темная тема с пастельными цветами',
  colors: {
    background: 'rgb(30, 30, 46)',
    'background-alternate': 'rgb(24, 24, 37)',
    foreground: 'rgb(205, 214, 244)',
    'foreground-muted': 'rgb(166, 173, 200)',
    surface: 'rgb(49, 50, 68)',
    'surface-foreground': 'rgb(205, 214, 244)',
    primary: 'rgb(180, 190, 254)',
    'primary-foreground': 'rgb(30, 30, 46)',
    'state-error': 'rgb(243, 139, 168)',
    'state-info': 'rgb(137, 221, 255)',
    'state-success': 'rgb(166, 227, 161)',
    'state-warning': 'rgb(250, 179, 135)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(166, 173, 200, 30%)',
    'scrollbar-handle-hover-background': 'rgba(180, 190, 254, 60%)',
    'scrollbar-handle-active-background': 'rgba(180, 190, 254, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
