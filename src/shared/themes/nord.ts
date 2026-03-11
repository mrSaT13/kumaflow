/**
 * Nord Theme
 * Адаптировано из Feishin
 * https://www.nordtheme.com/
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const nord: KumaFlowTheme = {
  id: 'nord',
  name: 'Nord',
  mode: 'dark',
  description: 'Арктическая сине-ледяная тема',
  colors: {
    background: 'rgb(46, 52, 64)',
    'background-alternate': 'rgb(59, 66, 82)',
    foreground: 'rgb(216, 222, 233)',
    'foreground-muted': 'rgb(129, 161, 193)',
    surface: 'rgb(59, 66, 82)',
    'surface-foreground': 'rgb(216, 222, 233)',
    primary: 'rgb(136, 192, 208)',
    'primary-foreground': 'rgb(46, 52, 64)',
    'state-error': 'rgb(191, 97, 106)',
    'state-info': 'rgb(129, 161, 193)',
    'state-success': 'rgb(163, 190, 140)',
    'state-warning': 'rgb(235, 203, 139)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(129, 161, 193, 30%)',
    'scrollbar-handle-hover-background': 'rgba(136, 192, 208, 60%)',
    'scrollbar-handle-active-background': 'rgba(136, 192, 208, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
