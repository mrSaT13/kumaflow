export enum Theme {
  Light = 'light',
  Dark = 'dark',
  Black = 'black',
  OneDark = 'one-dark',
  NightOwlLight = 'night-owl-light',
  MarmaladeBeaver = 'marmalade-beaver',
  NoctisLilac = 'noctis-lilac',
  MaterialTheme = 'material-theme',
  MonokaiPro = 'monokai-pro',
  GithubDark = 'github-dark',
  ShadesOfPurple = 'shades-of-purple',
  BeardedSolarized = 'bearded-solarized',
  CatppuccinMocha = 'catppuccin-mocha',
  NuclearDark = 'nuclear-dark',
  Achiever = 'achiever',
  Dracula = 'dracula',
  Discord = 'discord',
  TinaciousDesign = 'tinacious-design',
  VueDark = 'vue-dark',
  VimDarkSoft = 'vim-dark-soft',
  
  // Новые темы из Feishin
  Neon = 'neon',
  Cyberpunk = 'cyberpunk',
  Sunset = 'sunset',
  Ocean = 'ocean',
  Forest = 'forest',
  Candy = 'candy',
  Midnight = 'midnight',
  
  // Темы из Feishin (адаптированные)
  Nord = 'nord',
  GruvboxDark = 'gruvbox-dark',
  TokyoNight = 'tokyo-night',
  RosePine = 'rose-pine',
  SolarizedDark = 'solarized-dark',
  AyuDark = 'ayu-dark',
  GlassyDark = 'glassy-dark',
  HighContrastDark = 'high-contrast-dark',
  VSCODEDark = 'vscode-dark',
  DefaultLight = 'default-light',
  GruvboxLight = 'gruvbox-light',
  SolarizedLight = 'solarized-light',
  AyuLight = 'ayu-light',
  CatppuccinLatte = 'catppuccin-latte',
  RosePineDawn = 'rose-pine-dawn',
  MaterialDark = 'material-dark',
  NightOwl = 'night-owl',
  Monokai = 'monokai',
  OneDarkPro = 'one-dark-pro',
  GithubLight = 'github-light',
  VSCODELight = 'vscode-light',
}

export interface IThemeContext {
  theme: Theme
  setTheme: (theme: Theme) => void
}
