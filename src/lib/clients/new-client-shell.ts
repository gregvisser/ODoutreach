/**
 * PR I — New client workspace shell.
 *
 * Pure helpers for the minimal "create a client shell" form at
 * `/clients/new`. The shell deliberately captures only identity-level
 * fields (name + slug + optional industry / website / notes); everything
 * else (mailboxes, suppression, templates, sequences) lives in per-client
 * workspace modules so operators must actually complete those modules
 * before launch instead of the old wizard flipping `completedSteps` to
 * `[1,2,3,4]` on submit.
 *
 * These helpers are intentionally dependency-free so they can run in
 * server actions, client components, and unit tests without pulling in
 * Prisma or React.
 */

export const CLIENT_NAME_MIN = 2;
export const CLIENT_NAME_MAX = 120;
export const CLIENT_SLUG_MIN = 2;
export const CLIENT_SLUG_MAX = 60;
export const CLIENT_WEBSITE_MAX = 2048;
export const CLIENT_INDUSTRY_MAX = 120;
export const CLIENT_NOTES_MAX = 2000;

/** Valid slug pattern — matches the server-side Zod schema. */
export const CLIENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Deterministically derive a slug candidate from a freeform client
 * name. Lowercases, strips diacritics, replaces runs of non-alphanumeric
 * characters with a single hyphen, and trims leading/trailing hyphens.
 * Returns an empty string when nothing survives normalization so callers
 * can display a "slug required" message instead of submitting garbage.
 */
export function generateSlugFromName(name: string): string {
  const trimmed = name.normalize("NFKD").toLowerCase();
  const asciiish = trimmed.replace(/[\u0300-\u036f]/g, "");
  const hyphenated = asciiish
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return hyphenated.slice(0, CLIENT_SLUG_MAX);
}

export type NewClientShellInput = {
  name: string;
  slug: string;
  industry?: string;
  website?: string;
  notes?: string;
};

export type NewClientShellValidation =
  | {
      ok: true;
      normalized: {
        name: string;
        slug: string;
        industry: string | null;
        website: string | null;
        notes: string | null;
      };
    }
  | {
      ok: false;
      reason:
        | "NAME_MISSING"
        | "NAME_TOO_SHORT"
        | "NAME_TOO_LONG"
        | "SLUG_MISSING"
        | "SLUG_INVALID"
        | "SLUG_TOO_LONG"
        | "WEBSITE_INVALID"
        | "WEBSITE_TOO_LONG"
        | "INDUSTRY_TOO_LONG"
        | "NOTES_TOO_LONG";
      message: string;
    };

/**
 * Validate and normalize the minimal "new client shell" payload. Kept
 * pure and exhaustive so both the client form and the server action can
 * share the same rules without round-tripping through Prisma.
 */
export function validateNewClientShellInput(
  input: NewClientShellInput,
): NewClientShellValidation {
  const name = input.name.trim();
  if (!name) {
    return {
      ok: false,
      reason: "NAME_MISSING",
      message: "Client name is required.",
    };
  }
  if (name.length < CLIENT_NAME_MIN) {
    return {
      ok: false,
      reason: "NAME_TOO_SHORT",
      message: `Client name must be at least ${String(CLIENT_NAME_MIN)} characters.`,
    };
  }
  if (name.length > CLIENT_NAME_MAX) {
    return {
      ok: false,
      reason: "NAME_TOO_LONG",
      message: `Client name must be ${String(CLIENT_NAME_MAX)} characters or fewer.`,
    };
  }

  const slug = input.slug.trim().toLowerCase();
  if (!slug) {
    return {
      ok: false,
      reason: "SLUG_MISSING",
      message: "Workspace slug is required.",
    };
  }
  if (slug.length > CLIENT_SLUG_MAX) {
    return {
      ok: false,
      reason: "SLUG_TOO_LONG",
      message: `Workspace slug must be ${String(CLIENT_SLUG_MAX)} characters or fewer.`,
    };
  }
  if (!CLIENT_SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      reason: "SLUG_INVALID",
      message: "Slug must use lowercase letters, numbers, and single hyphens.",
    };
  }

  const industry = (input.industry ?? "").trim();
  if (industry.length > CLIENT_INDUSTRY_MAX) {
    return {
      ok: false,
      reason: "INDUSTRY_TOO_LONG",
      message: `Industry must be ${String(CLIENT_INDUSTRY_MAX)} characters or fewer.`,
    };
  }

  const website = (input.website ?? "").trim();
  if (website.length > CLIENT_WEBSITE_MAX) {
    return {
      ok: false,
      reason: "WEBSITE_TOO_LONG",
      message: `Website URL must be ${String(CLIENT_WEBSITE_MAX)} characters or fewer.`,
    };
  }
  if (website && !/^https?:\/\/.+/i.test(website)) {
    return {
      ok: false,
      reason: "WEBSITE_INVALID",
      message: "Enter a full https:// URL or leave blank.",
    };
  }

  const notes = (input.notes ?? "").trim();
  if (notes.length > CLIENT_NOTES_MAX) {
    return {
      ok: false,
      reason: "NOTES_TOO_LONG",
      message: `Internal notes must be ${String(CLIENT_NOTES_MAX)} characters or fewer.`,
    };
  }

  return {
    ok: true,
    normalized: {
      name,
      slug,
      industry: industry.length > 0 ? industry : null,
      website: website.length > 0 ? website : null,
      notes: notes.length > 0 ? notes : null,
    },
  };
}
