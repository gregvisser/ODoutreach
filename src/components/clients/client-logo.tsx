"use client";

import { useState } from "react";

import { clientLogoSrc } from "@/lib/branding/logo-fetch-policy";
import { deriveClientMonogram } from "@/lib/clients/client-brand";
import { cn } from "@/lib/utils";

type Props = {
  clientName: string;
  logoUrl: string | null;
  logoAltText?: string | null;
  /**
   * When set, a saved logo is loaded through our proxy instead of the
   * customer's site. Omit it for an unsaved preview of a pasted URL.
   */
  clientId?: string | null;
  /** Square pixel size the tile should occupy. Defaults to 48. */
  size?: number;
  className?: string;
};

/**
 * Renders a client's logo when one is set, or a neutral monogram
 * placeholder when it isn't or the image fails to load.
 */
export function ClientLogo({
  clientName,
  logoUrl,
  logoAltText,
  clientId = null,
  size = 48,
  className,
}: Props) {
  const monogram = deriveClientMonogram(clientName);
  const src = clientLogoSrc({ clientId, logoUrl });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && failedSrc === src;
  const dimensionStyle = { width: size, height: size };

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 select-none items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm font-semibold text-muted-foreground",
          className,
        )}
        style={{
          ...dimensionStyle,
          // Floor of 12px: below that a phone user cannot read the monogram
          // (measured — the 32px list-row tile rendered at 11px).
          fontSize: Math.max(12, Math.round(size * 0.35)),
        }}
        title={`No logo for ${clientName}`}
      >
        {monogram}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-background",
        className,
      )}
      style={dimensionStyle}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Served from our logo route, or a staff preview URL. */}
      <img
        src={src}
        alt={logoAltText?.trim() || `${clientName} logo`}
        className="h-full w-full object-contain"
        width={size}
        height={size}
        decoding="async"
        loading="lazy"
        onError={() => setFailedSrc(src)}
      />
    </span>
  );
}
