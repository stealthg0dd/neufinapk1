import Link from "next/link";
import clsx from "clsx";
import type { CSSProperties } from "react";

/**
 * Single source for NeuFin wordmark sizing across marketing, auth, shell, and upload.
 * Prefer `variant` over legacy `size` + `dark`.
 */
export type BrandLogoVariant =
  | "marketing-header"
  | "marketing-nav"
  | "marketing-footer-dark"
  | "marketing-footer-light"
  | "marketing-compact"
  | "app-header"
  | "app-sidebar"
  | "app-command"
  | "shell-inverted"
  | "research-footer"
  | "admin-wordmark";

const VARIANTS: Record<
  BrandLogoVariant,
  { width: number; height: number; className: string; style?: CSSProperties }
> = {
  "marketing-header": {
    width: 140,
    height: 36,
    className: "object-contain",
    style: {
      width: "140px",
      height: "36px",
      objectFit: "contain",
    },
  },
  "marketing-nav": {
    width: 140,
    height: 36,
    className: "object-contain",
    style: {
      width: "140px",
      height: "36px",
      objectFit: "contain",
    },
  },
  "marketing-footer-dark": {
    width: 180,
    height: 45,
    className: "object-contain",
    style: {
      width: "180px",
      height: "45px",
      display: "block",
    },
  },
  "marketing-footer-light": {
    width: 180,
    height: 45,
    className: "object-contain",
    style: {
      width: "180px",
      height: "45px",
      display: "block",
    },
  },
  "marketing-compact": {
    width: 176,
    height: 46,
    className: "h-11 w-auto sm:h-12",
  },
  "app-header": {
    width: 180,
    height: 48,
    className: "h-12 w-auto",
  },
  "app-sidebar": {
    width: 180,
    height: 48,
    className: "h-11 w-auto shrink-0 object-contain object-left",
  },
  "app-command": {
    width: 160,
    height: 44,
    className: "hidden h-9 w-auto sm:block",
  },
  "shell-inverted": {
    width: 200,
    height: 52,
    className: "h-11 w-auto brightness-0 invert",
  },
  "research-footer": {
    width: 160,
    height: 42,
    className: "h-8 w-auto sm:h-9 opacity-95",
  },
  "admin-wordmark": {
    width: 140,
    height: 36,
    className: "h-8 w-auto brightness-0 invert",
  },
};

/** @deprecated prefer BrandLogoVariant */
type LegacySize = "sm" | "md" | "lg" | "xl";

const LEGACY_SIZE_MAP: Record<LegacySize, string> = {
  sm: "h-9 w-auto",
  md: "h-10 w-auto",
  lg: "h-12 w-auto",
  xl: "h-14 w-auto",
};

export interface BrandLogoProps {
  variant?: BrandLogoVariant;
  /** @deprecated use `variant` */
  size?: LegacySize;
  /** @deprecated use `variant` with `marketing-footer-dark` / `shell-inverted` */
  dark?: boolean;
  href?: string | null;
  className?: string;
  priority?: boolean;
}

export function BrandLogo({
  variant,
  size = "lg",
  dark = false,
  href = "/",
  className,
  priority,
}: BrandLogoProps) {
  const resolved = variant
    ? VARIANTS[variant]
    : {
        width: 160,
        height: 40,
        className: clsx(
          LEGACY_SIZE_MAP[size],
          dark && "brightness-0 invert",
        ),
      };

  const img = (
    <svg
      viewBox="0 0 420 80"
      width={180}
      height={34}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Neufin AI"
      style={{ display: "block", flexShrink: 0 }}
    >
      <g transform="translate(0,12) scale(0.314)">
        <rect x="0" y="0" width="46" height="175" rx="4" fill="#EDE8E1" />
        <polygon points="10,0 54,0 98,175 54,175" fill="#2C2C2C" />
        <rect x="90" y="0" width="46" height="175" rx="4" fill="#3A5BF0" />
        <rect x="90" y="0" width="120" height="44" rx="4" fill="#3A5BF0" />
        <rect x="90" y="62" width="90" height="40" rx="4" fill="#3A5BF0" />
      </g>
      <text
        x="74"
        y="50"
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fontSize="36"
        fontWeight="300"
        letterSpacing="1.5"
        fill="#3A5BF0"
      >
        Neufin AI
      </text>
    </svg>
  );

  if (href === null) {
    return img;
  }

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center"
      style={{ display: "flex", alignItems: "center", flexShrink: 0, minWidth: "140px" }}
    >
      {img}
    </Link>
  );
}
