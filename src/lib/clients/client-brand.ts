/**
 * Client branding helpers.
 *
 * Pure helpers — no Prisma, no React. Used by:
 *   • the `updateClientBrandAction` server action (validation),
 *   • the client brief form (client-side validation),
 *   • any UI that needs to compute a consistent placeholder for a
 *     client without a logo (monogram tile).
 */

export const CLIENT_LOGO_URL_MAX = 2048;
export const CLIENT_LOGO_ALT_MAX = 200;

export type ClientBrandInput = {
  logoUrl: string;
  logoAltText: string;
};

export type ClientBrandValidation =
  | {
      ok: true;
      normalized: {
        logoUrl: string | null;
        logoAltText: string | null;
      };
    }
  | {
      ok: false;
      reason:
        | "LOGO_URL_INVALID"
        | "LOGO_URL_TOO_LONG"
        | "LOGO_ALT_TOO_LONG"
        | "LOGO_ALT_WITHOUT_URL";
      message: string;
    };

/**
 * Validate a client brand form payload. Allows:
 *   • both fields blank (clears branding)
 *   • a valid http(s) URL for the logo (with optional alt text)
 *
 * Rejects alt text without a logo URL to avoid orphaned metadata.
 */
export function validateClientBrandInput(
  input: ClientBrandInput,
): ClientBrandValidation {
  const logoUrl = input.logoUrl.trim();
  const logoAltText = input.logoAltText.trim();

  if (logoUrl.length > CLIENT_LOGO_URL_MAX) {
    return {
      ok: false,
      reason: "LOGO_URL_TOO_LONG",
      message: `Logo URL must be ${String(CLIENT_LOGO_URL_MAX)} characters or fewer.`,
    };
  }

  if (logoUrl && !/^https?:\/\/.+/i.test(logoUrl)) {
    return {
      ok: false,
      reason: "LOGO_URL_INVALID",
      message: "Enter a full https:// URL, or leave blank.",
    };
  }

  if (logoAltText.length > CLIENT_LOGO_ALT_MAX) {
    return {
      ok: false,
      reason: "LOGO_ALT_TOO_LONG",
      message: `Alt text must be ${String(CLIENT_LOGO_ALT_MAX)} characters or fewer.`,
    };
  }

  if (!logoUrl && logoAltText) {
    return {
      ok: false,
      reason: "LOGO_ALT_WITHOUT_URL",
      message: "Add a logo URL before setting alt text, or clear the alt text.",
    };
  }

  return {
    ok: true,
    normalized: {
      logoUrl: logoUrl.length > 0 ? logoUrl : null,
      logoAltText: logoAltText.length > 0 ? logoAltText : null,
    },
  };
}

/**
 * Derive a short monogram for use in the client logo placeholder tile.
 * Takes the first letter of up to the first two space-separated words,
 * uppercased. Falls back to "?" only when `name` is entirely empty.
 */
export function deriveClientMonogram(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (words.length === 0) return "?";
  if (words.length === 1) {
    const first = words[0] ?? "";
    return first.slice(0, 2).toUpperCase();
  }
  const first = (words[0] ?? "").charAt(0);
  const second = (words[1] ?? "").charAt(0);
  return `${first}${second}`.toUpperCase();
}
