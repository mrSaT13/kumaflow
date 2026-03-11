/**
 * KumaFlow Theme Types
 * Адаптировано из Feishin
 */

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  // Основные цвета
  background: string;
  'background-alternate': string;
  foreground: string;
  'foreground-muted': string;
  
  // Цвета поверхности
  surface: string;
  'surface-foreground': string;
  
  // Акцентные цвета
  primary: string;
  'primary-foreground'?: string;
  
  // Состояния
  'state-error': string;
  'state-info': string;
  'state-success': string;
  'state-warning': string;
  
  // Базовые цвета
  black: string;
  white: string;
}

export interface ThemeApp {
  'content-max-width'?: string;
  'root-font-size'?: string;
  'scrollbar-size'?: string;
  'scrollbar-handle-background'?: string;
  'scrollbar-handle-hover-background'?: string;
  'scrollbar-handle-active-background'?: string;
  'scrollbar-track-background'?: string;
  'scrollbar-track-hover-background'?: string;
  'scrollbar-track-active-background'?: string;
  'scrollbar-handle-border-radius'?: string;
  'scrollbar-track-border-radius'?: string;
  'overlay-header'?: string;
  'overlay-subheader'?: string;
}

export interface KumaFlowTheme {
  id: string;
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
  app: ThemeApp;
  description?: string;
}

// Список всех доступных тем
export const KUMAFLOW_THEMES: KumaFlowTheme[] = [
  // Dark темы
  { id: 'default-dark', name: 'Default Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'dracula', name: 'Dracula', mode: 'dark', colors: {}, app: {} },
  { id: 'github-dark', name: 'GitHub Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'glassy-dark', name: 'Glassy Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'high-contrast-dark', name: 'High Contrast Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'material-dark', name: 'Material Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'monokai', name: 'Monokai', mode: 'dark', colors: {}, app: {} },
  { id: 'night-owl', name: 'Night Owl', mode: 'dark', colors: {}, app: {} },
  { id: 'nord', name: 'Nord', mode: 'dark', colors: {}, app: {} },
  { id: 'one-dark', name: 'One Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'rose-pine', name: 'Rosé Pine', mode: 'dark', colors: {}, app: {} },
  { id: 'rose-pine-moon', name: 'Rosé Pine Moon', mode: 'dark', colors: {}, app: {} },
  { id: 'shades-of-purple', name: 'Shades of Purple', mode: 'dark', colors: {}, app: {} },
  { id: 'solarized-dark', name: 'Solarized Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'tokyo-night', name: 'Tokyo Night', mode: 'dark', colors: {}, app: {} },
  { id: 'vscode-dark', name: 'VS Code Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'ayu-dark', name: 'Ayu Dark', mode: 'dark', colors: {}, app: {} },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', mode: 'dark', colors: {}, app: {} },
  
  // Light темы
  { id: 'default-light', name: 'Default Light', mode: 'light', colors: {}, app: {} },
  { id: 'github-light', name: 'GitHub Light', mode: 'light', colors: {}, app: {} },
  { id: 'gruvbox-light', name: 'Gruvbox Light', mode: 'light', colors: {}, app: {} },
  { id: 'high-contrast-light', name: 'High Contrast Light', mode: 'light', colors: {}, app: {} },
  { id: 'material-light', name: 'Material Light', mode: 'light', colors: {}, app: {} },
  { id: 'solarized-light', name: 'Solarized Light', mode: 'light', colors: {}, app: {} },
  { id: 'vscode-light', name: 'VS Code Light', mode: 'light', colors: {}, app: {} },
  { id: 'ayu-light', name: 'Ayu Light', mode: 'light', colors: {}, app: {} },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', mode: 'light', colors: {}, app: {} },
  { id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', mode: 'light', colors: {}, app: {} },
];
