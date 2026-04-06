import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist)', 'system-ui', 'sans-serif'],
        display: ['var(--font-instrument)', 'Georgia', 'serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          blue: '#3b82f6',
          purple: '#8b5cf6',
          dark: '#030712',
        },
      },
      animation: {
        'spin-slow': 'spin 2s linear',
        'fade-in': 'fadeIn 0.5s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
