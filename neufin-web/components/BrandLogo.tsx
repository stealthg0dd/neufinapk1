import Image from "next/image";
import Link from "next/link";

/**
 * Size scale:
 *   sm  → h-9  (36px)  footer, compact areas
 *   md  → h-10 (40px)  sidebar
 *   lg  → h-12 (48px)  main nav, dashboard header, mobile
 *   xl  → h-14 (56px)  auth pages, hero moments
 */
type Size = "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<Size, string> = {
  sm: "h-9 w-auto",
  md: "h-10 w-auto",
  lg: "h-12 w-auto",
  xl: "h-14 w-auto",
};

interface BrandLogoProps {
  size?: Size;
  /** Apply brightness-0 invert for dark backgrounds */
  dark?: boolean;
  href?: string;
  className?: string;
  priority?: boolean;
}

export function BrandLogo({
  size = "lg",
  dark = false,
  href = "/",
  className,
  priority,
}: BrandLogoProps) {
  const sizeCls = SIZE_MAP[size];
  const darkCls = dark ? "brightness-0 invert" : "";

  const img = (
    <Image
      src="/logo.png"
      alt="NeuFin"
      width={160}
      height={40}
      className={[sizeCls, darkCls, className].filter(Boolean).join(" ")}
      priority={priority ?? (size === "lg" || size === "xl")}
    />
  );

  return href ? (
    <Link href={href} className="shrink-0 flex-none">
      {img}
    </Link>
  ) : (
    img
  );
}
