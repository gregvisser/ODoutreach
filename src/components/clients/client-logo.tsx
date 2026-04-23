import { deriveClientMonogram } from "@/lib/clients/client-brand";
import { cn } from "@/lib/utils";

type Props = {
  clientName: string;
  logoUrl: string | null;
  logoAltText?: string | null;
  /** Square pixel size the tile should occupy. Defaults to 48. */
  size?: number;
  className?: string;
};

/**
 * Renders a client's logo when one is set, or a neutral monogram
 * placeholder when it isn't. Never fires a network request beyond the
 * provided `logoUrl`, and gracefully collapses to the monogram in the
 * `<noscript>` / loading cases because both layouts share the same
 * outer dimensions.
 */
export function ClientLogo({
  clientName,
  logoUrl,
  logoAltText,
  size = 48,
  className,
}: Props) {
  const monogram = deriveClientMonogram(clientName);
  const dimensionStyle = { width: size, height: size };

  if (logoUrl) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/80 bg-background",
          className,
        )}
        style={dimensionStyle}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Arbitrary client-provided URL, cannot be proxied by next/image without domain allowlist. */}
        <img
          src={logoUrl}
          alt={logoAltText?.trim() || `${clientName} logo`}
          className="h-full w-full object-contain"
          width={size}
          height={size}
          decoding="async"
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm font-semibold text-muted-foreground",
        className,
      )}
      style={{
        ...dimensionStyle,
        fontSize: Math.max(10, Math.round(size * 0.35)),
      }}
      title={`No logo for ${clientName}`}
    >
      {monogram}
    </span>
  );
}
