/**
 * Dracula Theme
 * Адаптировано из Feishin
 * https://draculatheme.com/
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const dracula: KumaFlowTheme = {
  id: 'dracula',
  name: 'Dracula',
  mode: 'dark',
  description: 'Темная тема с фиолетовыми акцентами',
  colors: {
    background: 'rgb(40, 42, 54)',
    'background-alternate': 'rgb(34, 35, 46)',
    foreground: 'rgb(248, 248, 242)',
    'foreground-muted': 'rgb(98, 114, 164)',
    surface: 'rgb(68, 71, 90)',
    'surface-foreground': 'rgb(248, 248, 242)',
    primary: 'rgb(189, 147, 249)',
    'primary-foreground': 'rgb(40, 42, 54)',
    'state-error': 'rgb(255, 85, 85)',
    'state-info': 'rgb(139, 233, 253)',
    'state-success': 'rgb(80, 250, 123)',
    'state-warning': 'rgb(255, 184, 108)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(98, 114, 164, 30%)',
    'scrollbar-handle-hover-background': 'rgba(189, 147, 249, 60%)',
    'scrollbar-handle-active-background': 'rgba(189, 147, 249, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
