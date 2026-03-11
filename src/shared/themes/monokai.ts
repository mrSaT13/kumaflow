/**
 * Monokai Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const monokai: KumaFlowTheme = {
  id: 'monokai',
  name: 'Monokai',
  mode: 'dark',
  description: 'Классическая тема для редакторов кода',
  colors: {
    background: 'rgb(39, 40, 34)',
    'background-alternate': 'rgb(32, 33, 28)',
    foreground: 'rgb(248, 248, 242)',
    'foreground-muted': 'rgb(117, 117, 117)',
    surface: 'rgb(68, 69, 62)',
    'surface-foreground': 'rgb(248, 248, 242)',
    primary: 'rgb(166, 226, 46)',
    'primary-foreground': 'rgb(39, 40, 34)',
    'state-error': 'rgb(249, 38, 114)',
    'state-info': 'rgb(102, 217, 239)',
    'state-success': 'rgb(166, 226, 46)',
    'state-warning': 'rgb(253, 151, 31)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(117, 117, 117, 30%)',
    'scrollbar-handle-hover-background': 'rgba(166, 226, 46, 60%)',
    'scrollbar-handle-active-background': 'rgba(166, 226, 46, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
