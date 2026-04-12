/**
 * Programmatic design tokens — values mirror `app/globals.css` :root.
 * Prefer CSS variables in components; use this for charts/canvas only.
 */
export const designTokens = {
  bgApp: '#F6F8FB',
  surface: '#FFFFFF',
  surface2: '#F8FAFC',
  surface3: '#F1F5F9',
  border: '#E2E8F0',
  borderAccent: 'rgba(30, 184, 204, 0.35)',
  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#64748B',
  primary: '#1EB8CC',
  primaryDark: '#158A99',
  primaryLight: '#E0F7FA',
  /** Semantic warning (not brand primary) */
  amber: '#F5A623',
  emerald: '#22C55E',
  red: '#EF4444',
  blue: '#1EB8CC',
  glassBg: 'rgba(255, 255, 255, 0.92)',
  glassBorder: 'rgba(226, 232, 240, 0.95)',
} as const

export type DesignTokenKey = keyof typeof designTokens
