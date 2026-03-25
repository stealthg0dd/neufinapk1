/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,jsx,ts,tsx}',
    './screens/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary:    '#1E88E5',
        secondary:  '#FF6F00',
        background: '#0F172A',
        surface:    '#1E293B',
        // Terminal palette
        amber:      '#FFB900',
        terminal:   '#080808',
        'surface-dark': '#0D0D0D',
        border:     '#1E1E1E',
      },
      fontFamily: {
        mono: ['Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
