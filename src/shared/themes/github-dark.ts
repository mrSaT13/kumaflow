/**
 * GitHub Dark Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const githubDark: KumaFlowTheme = {
  id: 'github-dark',
  name: 'GitHub Dark',
  mode: 'dark',
  description: 'Темная тема в стиле GitHub',
  colors: {
    background: 'rgb(13, 17, 23)',
    'background-alternate': 'rgb(22, 27, 34)',
    foreground: 'rgb(201, 209, 217)',
    'foreground-muted': 'rgb(139, 148, 158)',
    surface: 'rgb(22, 27, 34)',
    'surface-foreground': 'rgb(201, 209, 217)',
    primary: 'rgb(88, 166, 255)',
    'primary-foreground': 'rgb(13, 17, 23)',
    'state-error': 'rgb(248, 81, 73)',
    'state-info': 'rgb(88, 166, 255)',
    'state-success': 'rgb(46, 160, 67)',
    'state-warning': 'rgb(210, 153, 34)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(139, 148, 158, 30%)',
    'scrollbar-handle-hover-background': 'rgba(88, 166, 255, 60%)',
    'scrollbar-handle-active-background': 'rgba(88, 166, 255, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
