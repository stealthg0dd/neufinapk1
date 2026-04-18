import type { Config } from "tailwindcss";
import { designTokens as t } from "./lib/design-tokens";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      maxWidth: {
        content: "80rem",
        prose: "48rem",
      },
      /** Page blocks: `py-section` ≈ py-16; top hero bands: `py-section-hero` ≈ py-24 */
      spacing: {
        section: "4rem",
        "section-hero": "6rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          dark: "#030712",
        },
        primary: {
          DEFAULT: t.primary,
          dark: t.primaryDark,
          light: t.primaryLight,
          foreground: "#ffffff",
        },
        navy: t.textPrimary,
        slate2: t.textBody,
        muted2: t.textSecondary,
        "app-bg": t.bg,
        "card-bg": t.surface,
        "border-std": t.border,
        success2: t.success,
        warning2: t.warning,
        danger2: t.danger,
        background: t.bg,
        foreground: t.textPrimary,
        accent: {
          DEFAULT: t.accent,
          foreground: t.textPrimary,
        },
        muted: {
          DEFAULT: t.surface3,
          foreground: t.textSecondary,
        },
        border: t.border,
        positive: t.success,
        risk: t.danger,
        warning: t.warning,
        sidebar: t.surface,
        copilot: t.surface2,
        command: t.surface,
        surface: {
          DEFAULT: t.surface,
          2: t.surface2,
          3: t.surface3,
        },
        shell: {
          deep: t.shellDeep,
          DEFAULT: t.shell,
          raised: t.shellRaised,
          border: t.shellBorder,
          fg: t.shellFg,
          muted: t.shellMuted,
          subtle: t.shellSubtle,
        },
        secondary: {
          DEFAULT: t.surface3,
          foreground: t.textPrimary,
        },
        card: {
          DEFAULT: t.surface,
          foreground: t.textPrimary,
        },
        popover: {
          DEFAULT: t.surface,
          foreground: t.textPrimary,
        },
        destructive: {
          DEFAULT: t.danger,
          foreground: "#ffffff",
        },
        ring: t.primary,
        /** Landing / marketing — mirrors `app/globals.css` marketing tokens */
        lp: {
          fg: "var(--text-primary)",
          body: "var(--text-body)",
          muted: "var(--readable-muted)",
          "on-dark": "var(--text-on-dark)",
          "on-dark-muted": "var(--text-on-dark-muted)",
          "on-accent": "var(--text-on-accent)",
          border: "var(--border-subtle)",
          card: "var(--bg-card)",
          elevated: "var(--bg-elevated)",
          accent: "var(--primary)",
          "accent-soft": "var(--accent-soft)",
        },
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
        xl: "20px",
        "2xl": "24px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        md: "0 4px 12px rgba(0,0,0,0.08)",
        lg: "0 8px 24px rgba(0,0,0,0.10)",
      },
      fontSize: {
        h1: ["2.25rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "h1-lg": ["3rem", { lineHeight: "1.15", letterSpacing: "-0.025em" }],
        h2: ["1.5rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        h3: ["1.125rem", { lineHeight: "1.45" }],
        body: ["1rem", { lineHeight: "1.65" }],
        "body-sm": ["0.9375rem", { lineHeight: "1.6" }],
        meta: ["0.875rem", { lineHeight: "1.5" }],
      },
      animation: {
        "spin-slow": "spin 2s linear",
        "fade-in": "fadeIn 0.5s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
