/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      spacing: {
        header: 'var(--header-height)',
        player: 'var(--player-height)',
        content: 'var(--content-height)',
        'empty-content': 'var(--empty-content-height)',
        'shadow-header': 'var(--shadow-header-height)',
        'shadow-header-distance': 'var(--shadow-header-distance)',
        toast: 'var(--toastify-toast-container-height)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: {
          DEFAULT: 'hsl(var(--background))',
          foreground: 'hsl(var(--background-foreground))',
        },
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        'windows-red': 'hsl(var(--windows-red))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        marquee: {
          '0%': { transform: 'translate3d(0, 0, 0)' },
          '5%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(var(--tw-translate-x-end), 0, 0)' },
          '55%': { transform: 'translate3d(var(--tw-translate-x-end), 0, 0)' },
          '100%': { transform: 'translate3d(0, 0, 0)' },
        },
        'slide-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        'slide-up': {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: '0' },
        },

        // ===== «ВАУ»-слой: награды, блики, пульс =====

        /** Появление с лёгким overshoot — для карточек и тостов. */
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '60%': { opacity: '1', transform: 'scale(1.03)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pop-sm': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        /** Бегущий блик по карточке (как «shine» на витринах). */
        shimmer: {
          '0%': { transform: 'translateX(-200%) skewX(-12deg)' },
          '100%': { transform: 'translateX(600%) skewX(-12deg)' },
        },
        /** Свечение вокруг себя. --pulse (0..1) вешается из аудио-пульса. */
        'glow-pulse': {
          '0%, 100%': {
            boxShadow:
              '0 0 calc(6px + var(--pulse, 0) * 26px) calc(var(--pulse, 0) * 8px) var(--progress-color, rgba(16,185,129,0.6))',
          },
          '50%': {
            boxShadow:
              '0 0 calc(10px + var(--pulse, 0) * 40px) calc(2px + var(--pulse, 0) * 14px) var(--progress-color, rgba(16,185,129,0.75))',
          },
        },
        /** Мягкое парение — для иконок и бейджей. */
        'float-y': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        /** Падение частиц (конфетти без библиотеки). */
        'confetti-fall': {
          '0%': {
            opacity: '1',
            transform: 'translate3d(0, -12vh, 0) rotate(0deg)',
          },
          '100%': {
            opacity: '0',
            transform: 'translate3d(var(--confetti-x, 0), 108vh, 0) rotate(720deg)',
          },
        },
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        /** Бегущий градиент для полос прогресса и заголовков. */
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        /** Расходящееся кольцо — «вау» при разблокировке. */
        'ring-expand': {
          '0%': { opacity: '0.6', transform: 'scale(0.7)' },
          '100%': { opacity: '0', transform: 'scale(2.1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        /** Пламя стрика: чем длиннее стрик, тем заметнее. */
        'streak-flame': {
          '0%, 100%': { transform: 'scale(1) rotate(-2deg)' },
          '50%': { transform: 'scale(1.12) rotate(3deg)' },
        },
        /** Каустика/мерцание для праздничного фона. */
        'caustic-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '33%': { transform: 'translate3d(4%, -3%, 0) scale(1.08)' },
          '66%': { transform: 'translate3d(-4%, 3%, 0) scale(0.96)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        marquee: 'marquee var(--tw-marquee-time) linear 2s infinite',
        'slide-down': 'slide-down 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',

        pop: 'pop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'pop-sm': 'pop-sm 0.22s ease-out',
        shimmer: 'shimmer 1.1s ease-in-out',
        'glow-pulse': 'glow-pulse 1.4s ease-in-out infinite',
        'float-y': 'float-y 3s ease-in-out infinite',
        'confetti-fall': 'confetti-fall var(--confetti-duration, 1.6s) cubic-bezier(0.25, 0.6, 0.4, 1) forwards',
        'bounce-soft': 'bounce-soft 2s ease-in-out infinite',
        'gradient-x': 'gradient-x 3s ease infinite',
        'ring-expand': 'ring-expand 1.1s ease-out forwards',
        'slide-in-right': 'slide-in-right 0.25s ease-out',
        'streak-flame': 'streak-flame 1.6s ease-in-out infinite',
        'caustic-drift': 'caustic-drift 14s ease-in-out infinite',
      },
      gridTemplateColumns: {
        player:
          'minmax(250px, 1fr) minmax(0px, 1fr) minmax(0px, 1fr) minmax(250px, 1fr)',
        'table-fallback':
          'minmax(40px, 50px) minmax(0px, 3fr) minmax(0px, 2fr) minmax(0px, 1fr) minmax(0px, 1fr) minmax(0px, 1fr) minmax(60px, 70px) minmax(100px, 120px)',
        header:
          'minmax(180px, 1fr) minmax(0px, 1fr) minmax(0px, 1fr) minmax(180px, 1fr)',
        'mid-player-info': 'minmax(40px, 70px) minmax(168px, 1fr)',
        'mini-player': 'minmax(30px, 40px) minmax(80px, 1fr) 64px',
      },
      gridTemplateRows: {
        'floating-player': 'minmax(0, 1fr) 40px',
      },
      flexBasis: {
        '1/8': '12.5%',
      },
      maskImage: {
        'marquee-fade':
          'linear-gradient(270deg, transparent 0%, rgb(0, 0, 0) 3%, rgb(0, 0, 0) 97%, transparent 100%)',
        'marquee-fade-finished':
          'linear-gradient(270deg, transparent 0%, rgb(0, 0, 0) 3%, rgb(0, 0, 0) 100%, transparent 100%)',
        'carousel-item': 'radial-gradient(circle, white 100%, transparent 0)',
        'big-player-lyrics':
          'linear-gradient(180deg, transparent 0%, rgb(0, 0, 0) 25%, rgb(0, 0, 0) 75%, transparent 100%)',
        lyrics:
          'linear-gradient(180deg, transparent 0%, rgb(0, 0, 0) 10%, rgb(0, 0, 0) 90%, transparent 100%)',
        'unsynced-lyrics':
          'linear-gradient(180deg, transparent 0%, rgb(0, 0, 0) 4%, rgb(0, 0, 0) 96%, transparent 100%)',
      },
      boxShadow: {
        'custom-3': '0 0 3px rgba(255, 255, 255, 0.03)',
        'custom-5': '0 0 5px rgba(255, 255, 255, 0.05)',
        'header-image': '0 4px 35px rgba(0, 0, 0, 0.6)',
        kbd: '0 0.1rem 0 1px hsl(var(--border))',
      },
      textShadow: {
        xs: '0px 1px 1px rgb(0 0 0 / 0.2)',
        sm: '0px 1px 0px rgb(0 0 0 / 0.075), 0px 1px 1px rgb(0 0 0 / 0.075), 0px 2px 2px rgb(0 0 0 / 0.075)',
        md: '0px 1px 1px rgb(0 0 0 / 0.1), 0px 1px 2px rgb(0 0 0 / 0.1), 0px 2px 4px rgb(0 0 0 / 0.1)',
        lg: '0px 1px 2px rgb(0 0 0 / 0.1), 0px 3px 2px rgb(0 0 0 / 0.1), 0px 4px 8px rgb(0 0 0 / 0.1)',
        xl: '0px 1px 2px rgb(0 0 0 / 0.1), 0px 3px 4px rgb(0 0 0 / 0.1), 0px 6px 12px rgb(0 0 0 / 0.1)',
        '2xl':
          '0px 2px 4px rgb(0 0 0 / 0.15), 0px 6px 8px rgb(0 0 0 / 0.15), 0px 10px 24px rgb(0 0 0 / 0.15)',
      },
      screens: {
        'mid-player': { raw: '(min-height: 133px) and (max-height: 170px)' },
        'mini-player': { raw: '(max-height: 132px)' },
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    require('tailwind-extended-shadows'),
    function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          maskImage: (value) => {
            return {
              maskImage: value,
            }
          },
        },
        {
          values: theme('maskImage'),
        },
      )
    },
    function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          'text-shadow': (value) => {
            return {
              textShadow: value,
            }
          },
        },
        {
          values: theme('textShadow'),
        },
      )
    },
  ],
}
