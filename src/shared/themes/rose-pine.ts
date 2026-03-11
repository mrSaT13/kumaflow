/**
 * Rosé Pine Theme
 * Адаптировано из Feishin
 */

import { KumaFlowTheme } from './kumaflow-theme-types';

export const rosePine: KumaFlowTheme = {
  id: 'rose-pine',
  name: 'Rosé Pine',
  mode: 'dark',
  description: 'Минималистичная тема с розовыми оттенками',
  colors: {
    background: 'rgb(30, 28, 45)',
    'background-alternate': 'rgb(22, 20, 34)',
    foreground: 'rgb(224, 222, 244)',
    'foreground-muted': 'rgb(156, 154, 174)',
    surface: 'rgb(47, 43, 65)',
    'surface-foreground': 'rgb(224, 222, 244)',
    primary: 'rgb(194, 178, 228)',
    'primary-foreground': 'rgb(30, 28, 45)',
    'state-error': 'rgb(234, 118, 203)',
    'state-info': 'rgb(125, 207, 255)',
    'state-success': 'rgb(152, 205, 149)',
    'state-warning': 'rgb(241, 196, 107)',
    black: 'rgb(0, 0, 0)',
    white: 'rgb(255, 255, 255)',
  },
  app: {
    'content-max-width': '1800px',
    'root-font-size': '16px',
    'scrollbar-size': '9px',
    'scrollbar-handle-background': 'rgba(156, 154, 174, 30%)',
    'scrollbar-handle-hover-background': 'rgba(194, 178, 228, 60%)',
    'scrollbar-handle-active-background': 'rgba(194, 178, 228, 80%)',
    'scrollbar-track-background': 'transparent',
  },
};
