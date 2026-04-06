/**
 * NeuFin design tokens — mirror of CSS variables in app/globals.css
 * Use for programmatic access (charts, canvas, etc.)
 */
export const designTokens = {
  canvas: '#080B14',
  surface1: '#0F1420',
  surface2: '#161D2E',
  surface3: '#1E2640',
  border: 'rgba(255,255,255,0.07)',
  borderAccent: 'rgba(245,162,35,0.3)',
  textPrimary: '#F0F4FF',
  textSecondary: '#8B95B0',
  textMuted: '#4A5568',
  amber: '#F5A623',
  emerald: '#00D97E',
  red: '#FF4D6A',
  blue: '#4D9FFF',
  glassBg: 'rgba(15,20,32,0.7)',
  glassBorder: 'rgba(255,255,255,0.08)',
} as const

export type DesignTokenKey = keyof typeof designTokens
