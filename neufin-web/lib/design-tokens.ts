/**
 * Programmatic tokens — hex values mirror `app/globals.css` :root.
 * Prefer CSS variables in UI; use this for charts/canvas/PDF only.
 */
export const designTokens = {
  bg: "#F6F8FB",
  surface: "#FFFFFF",
  surface2: "#F8FAFC",
  surface3: "#F1F5F9",
  border: "#E2E8F0",
  borderAccent: "rgba(30, 184, 204, 0.35)",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  /** Strong body copy on light surfaces (legacy “slate”) */
  textBody: "#334155",
  primary: "#1EB8CC",
  primaryDark: "#158A99",
  primaryLight: "#E0F7FA",
  accent: "#F5A623",
  success: "#22C55E",
  warning: "#F5A623",
  danger: "#EF4444",
  glassBg: "rgba(255, 255, 255, 0.92)",
  glassBorder: "rgba(226, 232, 240, 0.95)",
  shellDeep: "#020617",
  shell: "#0F172A",
  shellRaised: "#1E293B",
  shellBorder: "#334155",
  shellFg: "#F8FAFC",
  shellMuted: "#94A3B8",
  shellSubtle: "#64748B",
} as const;

export type DesignTokenKey = keyof typeof designTokens;
