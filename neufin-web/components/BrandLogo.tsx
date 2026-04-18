import Image from "next/image";
import Link from "next/link";

type Variant = "nav" | "sidebar" | "footer" | "footer-dark";

const SIZE: Record<Variant, { width: number; height: number; cls: string }> = {
  nav:         { width: 160, height: 40, cls: "h-10 w-auto" },
  sidebar:     { width: 140, height: 36, cls: "h-9 w-auto" },
  footer:      { width: 140, height: 36, cls: "h-9 w-auto" },
  "footer-dark": { width: 140, height: 36, cls: "h-9 w-auto brightness-0 invert" },
};

interface BrandLogoProps {
  variant?: Variant;
  href?: string;
  className?: string;
}

export function BrandLogo({ variant = "nav", href = "/", className }: BrandLogoProps) {
  const { width, height, cls } = SIZE[variant];

  const img = (
    <Image
      src="/logo.png"
      alt="NeuFin"
      width={width}
      height={height}
      className={`${cls} ${className ?? ""}`.trim()}
      priority={variant === "nav"}
    />
  );

  return href ? <Link href={href} className="shrink-0">{img}</Link> : img;
}
