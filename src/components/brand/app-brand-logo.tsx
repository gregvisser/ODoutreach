import Link from "next/link";

import { cn } from "@/lib/utils";

import { BRAND } from "./brand-config";

type Props = {
  /** Optional destination. Defaults to /dashboard. */
  href?: string;
  /** Extra classes for the outer element (e.g. positioning). */
  className?: string;
  /** Override the displayed height in Tailwind classes. Defaults to the larger
   * `h-8 md:h-10` so the centered header wordmark reads as intentional brand
   * identity on desktop without overwhelming the header on mobile. */
  heightClassName?: string;
  /**
   * Runtime brand overrides. When provided (e.g. from `getGlobalBrand()`),
   * the logo source and alt text come from the live admin-saved values;
   * otherwise they fall back to the static `BRAND` defaults in
   * `brand-config.ts`.
   */
  src?: string;
  alt?: string;
  brandName?: string;
  productName?: string;
  /**
   * When true, renders without a wrapping anchor. Useful when the logo
   * is embedded inside another interactive surface (e.g. a preview
   * card in Settings → Branding) where a nested link would be wrong.
   */
  static?: boolean;
};

/**
 * Centered OpensDoors wordmark for the app shell header. Inherits the
 * surrounding text color via `currentColor` so it works on light and
 * dark backgrounds without any theme plumbing.
 */
export function AppBrandLogo({
  href = "/dashboard",
  className,
  heightClassName = "h-8 md:h-10",
  src,
  alt,
  brandName,
  productName,
  static: isStatic,
}: Props) {
  const resolvedSrc = src ?? BRAND.logoSrc;
  const resolvedBrand = brandName ?? BRAND.name;
  const resolvedProduct = productName ?? BRAND.product;
  const resolvedAlt = alt ?? `${resolvedBrand} ${resolvedProduct}`;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- URL can be external (admin-supplied) or local SVG; optimizer is unnecessary and adds auth friction.
    <img
      src={resolvedSrc}
      alt={resolvedAlt}
      className={cn("block w-auto", heightClassName)}
      width={320}
      height={64}
      decoding="async"
    />
  );

  if (isStatic) {
    return <span className={cn("inline-flex items-center text-foreground", className)}>{img}</span>;
  }

  return (
    <Link
      href={href}
      aria-label={`${resolvedBrand} ${resolvedProduct} home`}
      className={cn(
        "inline-flex items-center text-foreground transition-opacity hover:opacity-80",
        className,
      )}
    >
      {img}
    </Link>
  );
}
