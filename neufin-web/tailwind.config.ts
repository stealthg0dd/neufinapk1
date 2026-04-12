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
        primary: {
          DEFAULT: '#1EB8CC',
          dark: '#158A99',
          light: '#E0F7FA',
          foreground: '#ffffff',
        },
        navy: '#0F172A',
        slate2: '#334155',
        muted2: '#64748B',
        'app-bg': '#F6F8FB',
        'card-bg': '#FFFFFF',
        'border-std': '#E2E8F0',
        success2: '#22C55E',
        warning2: '#F5A623',
        danger2: '#EF4444',
        background: '#F6F8FB',
        foreground: '#0F172A',
        accent: {
          DEFAULT: '#8b5cf6',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#F1F5F9',
          foreground: '#64748B',
        },
        border: '#E2E8F0',
        positive: '#22C55E',
        risk: '#EF4444',
        warning: '#F5A623',
        sidebar: '#FFFFFF',
        copilot: '#F8FAFC',
        command: '#FFFFFF',
        surface: {
          DEFAULT: '#FFFFFF',
          2: '#F8FAFC',
          3: '#F1F5F9',
        },
        secondary: {
          DEFAULT: '#F1F5F9',
          foreground: '#0F172A',
        },
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#0F172A',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#0F172A',
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#ffffff',
        },
        ring: '#1EB8CC',
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'page-title': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        section: ['1.5rem', { lineHeight: '1.3' }],
        'card-title': ['1.125rem', { lineHeight: '1.4' }],
        body: ['1rem', { lineHeight: '1.65' }],
        'body-sm': ['0.9375rem', { lineHeight: '1.6' }],
        caption: ['0.8125rem', { lineHeight: '1.5' }],
        label: ['0.75rem', { lineHeight: '1', letterSpacing: '0.08em' }],
      },
      spacing: {
        'page-x': '24px',
        'section-y': '72px',
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
