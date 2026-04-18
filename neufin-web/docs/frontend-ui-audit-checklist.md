# Frontend UI audit checklist (Neufin web)

Use this when reviewing new pages or refactors for contrast and consistency.

## Primitives

- [ ] **Text on light surfaces** — body uses `text-slate2` or `text-foreground`; muted uses `text-readable` / `text-ui-muted` / `text-lp-muted` (not raw `gray-400` for small text).
- [ ] **Text on dark / shell** — `text-shell-fg`, `text-shell-muted`, `text-lp-on-dark` / `text-lp-on-dark-muted` as appropriate.
- [ ] **Links** — visible default + hover; primary links `text-primary` with underline where needed.
- [ ] **Buttons** — `btn-primary` / `btn-outline` / `btn-outline-on-dark` / `lp-btn-*`; focus-visible ring present.
- [ ] **Inputs** — label `text-ui-text-secondary` or `text-shell-muted`; placeholder `placeholder:text-[var(--readable-muted)]` or equivalent.
- [ ] **Disabled** — `opacity-50` + `cursor-not-allowed` + no information-only-glyph.
- [ ] **Cards** — `border-border`, `bg-white` or `surface-*`; GlassCard uses token borders.
- [ ] **Tables** — header distinct from body (`bg-surface-2`, `text-foreground` / `text-readable`).
- [ ] **Badges / pills** — semantic colors with sufficient contrast (avoid light-on-light).
- [ ] **Toasts** — themed via `RootProviders` (success/error backgrounds + borders).
- [ ] **Modals** — focus trap + backdrop; body text meets contrast on modal surface.

## Brand

- [ ] **Logo** — `BrandLogo` with a named `variant` (no ad hoc `Image` + `logo.png` in chrome).

## Tokens

Canonical CSS variables live in `app/globals.css` (`:root`). Tailwind maps: `lp.*`, `ui.*`, `readable`, plus existing `primary`, `shell`, `surface`, `border`.
