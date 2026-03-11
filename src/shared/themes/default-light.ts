/**
 * Default Light Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const defaultLight: KumaFlowTheme = {
  id: 'default-light',
  name: 'Default Light',
  mode: 'light',
  description: 'Стандартная светлая тема KumaFlow',
  colors: {
    background: 'rgb(245, 245, 245)',
    'background-alternate': 'rgb(255, 255, 255)',
    foreground: 'rgb(25, 25, 25)',
    'foreground-muted': 'rgb(100, 100, 100)',
    surface: 'rgb(255, 255, 255)',
    'surface-foreground': 'rgb(25, 25, 25)',
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
    'scrollbar-handle-background': 'rgba(100, 100, 100, 20%)',
    'scrollbar-handle-hover-background': 'rgba(100, 100, 100, 60%)',
    'scrollbar-handle-active-background': 'rgba(100, 100, 100, 40%)',
    'scrollbar-track-background': 'transparent',
    'scrollbar-track-hover-background': 'transparent',
    'scrollbar-track-active-background': 'transparent',
    'scrollbar-handle-border-radius': '0',
    'scrollbar-track-border-radius': '0',
  },
};
