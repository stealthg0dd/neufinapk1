import Image from "next/image";
import type { ComponentProps } from "react";

const VARIANTS = {
  /** Sticky header — marketing home & light nav */
  header: {
    width: 200,
    height: 52,
    className: "h-[3.25rem] w-auto sm:h-14",
  },
  /** App Router `LandingNav` — matches header with mobile tap target */
  nav: {
    width: 200,
    height: 52,
    className: "h-[3.25rem] w-auto sm:h-14",
  },
  /** Dark footer / inverted marks (e.g. home footer on navy) */
  "footer-on-dark": {
    width: 200,
    height: 52,
    className: "h-14 w-auto sm:h-16 brightness-0 invert",
  },
  /** Light surface footer (`components/landing/Footer.tsx`) */
  "footer-on-light": {
    width: 200,
    height: 52,
    className: "h-12 w-auto sm:h-14",
  },
  /** Compact chrome (pricing footer, dialogs) */
  compact: {
    width: 176,
    height: 46,
    className: "h-11 w-auto sm:h-12",
  },
} as const;

export type NeuFinLogoVariant = keyof typeof VARIANTS;

type Props = {
  variant: NeuFinLogoVariant;
  priority?: boolean;
  className?: string;
} & Omit<ComponentProps<typeof Image>, "src" | "alt" | "width" | "height">;

/**
 * Shared NeuFin wordmark sizing for marketing surfaces.
 * Width/height reserve layout; displayed size comes from `className` scales.
 */
export default function NeuFinLogo({
  variant,
  priority,
  className = "",
  ...rest
}: Props) {
  const v = VARIANTS[variant];
  return (
    <Image
      src="/logo.png"
      alt="NeuFin"
      width={v.width}
      height={v.height}
      className={[v.className, className].filter(Boolean).join(" ")}
      priority={priority}
      {...rest}
    />
  );
}
