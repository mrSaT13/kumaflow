/**
 * One Dark Theme
 * Адаптировано из Feishin (Atom One Dark)
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const oneDark: KumaFlowTheme = {
  id: 'one-dark',
  name: 'One Dark',
  mode: 'dark',
  description: 'Темная тема из редактора Atom',
  colors: {
    background: 'rgb(40, 44, 52)',
    'background-alternate': 'rgb(33, 37, 43)',
    foreground: 'rgb(224, 226, 228)',
    'foreground-muted': 'rgb(152, 159, 177)',
    surface: 'rgb(59, 66, 78)',
    'surface-foreground': 'rgb(224, 226, 228)',
    primary: 'rgb(97, 175, 239)',
    'primary-foreground': 'rgb(40, 44, 52)',
    'state-error': 'rgb(224, 108, 117)',
    'state-info': 'rgb(97, 175, 239)',
    'state-success': 'rgb(152, 195, 121)',
    'state-warning': 'rgb(229, 192, 123)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(152, 159, 177, 30%)',
    'scrollbar-handle-hover-background': 'rgba(97, 175, 239, 60%)',
    'scrollbar-handle-active-background': 'rgba(97, 175, 239, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
