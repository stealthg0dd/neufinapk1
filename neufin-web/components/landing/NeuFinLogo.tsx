import type { ComponentProps } from "react";
import { BrandLogo, type BrandLogoVariant } from "@/components/BrandLogo";

/** Maps legacy marketing variant names → BrandLogo presets */
const MAP: Record<string, BrandLogoVariant> = {
  header: "marketing-header",
  nav: "marketing-nav",
  "footer-on-dark": "marketing-footer-dark",
  "footer-on-light": "marketing-footer-light",
  compact: "marketing-compact",
};

export type NeuFinLogoVariant = keyof typeof MAP;

type Props = {
  variant: NeuFinLogoVariant;
} & Omit<ComponentProps<typeof BrandLogo>, "variant">;

/**
 * @deprecated import `BrandLogo` from `@/components/BrandLogo` instead
 */
export default function NeuFinLogo({ variant, ...rest }: Props) {
  return <BrandLogo variant={MAP[variant]} {...rest} />;
}
