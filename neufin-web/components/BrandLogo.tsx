import Image from "next/image";
import Link from "next/link";
import clsx from "clsx";

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
  { width: number; height: number; className: string }
> = {
  "marketing-header": {
    width: 160,
    height: 40,
    className: "h-10 w-auto",
  },
  "marketing-nav": {
    width: 160,
    height: 40,
    className: "h-10 w-auto",
  },
  "marketing-footer-dark": {
    width: 180,
    height: 50,
    className: "h-[3.125rem] w-auto brightness-0 invert",
  },
  "marketing-footer-light": {
    width: 180,
    height: 45,
    className: "h-[45px] w-auto",
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
    <Image
      src="/logo.png"
      alt="NeuFin"
      width={resolved.width}
      height={resolved.height}
      className={clsx(resolved.className, className)}
      priority={
        priority ??
        (variant
          ? variant.startsWith("marketing") || variant === "app-header"
          : size === "lg" || size === "xl")
      }
    />
  );

  if (href === null) {
    return img;
  }

  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      {img}
    </Link>
  );
}
