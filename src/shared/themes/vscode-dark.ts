/**
 * VS Code Dark+ Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const vscodeDark: KumaFlowTheme = {
  id: 'vscode-dark',
  name: 'VS Code Dark+',
  mode: 'dark',
  description: 'Темная тема из Visual Studio Code',
  colors: {
    background: 'rgb(30, 30, 30)',
    'background-alternate': 'rgb(25, 25, 25)',
    foreground: 'rgb(204, 204, 204)',
    'foreground-muted': 'rgb(153, 153, 153)',
    surface: 'rgb(37, 37, 38)',
    'surface-foreground': 'rgb(204, 204, 204)',
    primary: 'rgb(0, 122, 204)',
    'primary-foreground': 'rgb(255, 255, 255)',
    'state-error': 'rgb(244, 67, 54)',
    'state-info': 'rgb(0, 122, 204)',
    'state-success': 'rgb(76, 175, 80)',
    'state-warning': 'rgb(255, 193, 7)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '10px',
    'scrollbar-handle-background': 'rgba(153, 153, 153, 30%)',
    'scrollbar-handle-hover-background': 'rgba(0, 122, 204, 60%)',
    'scrollbar-handle-active-background': 'rgba(0, 122, 204, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
