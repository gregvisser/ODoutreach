"use server";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  addGoogleOauthTestUsers,
  getConsoleTestUsersUrl,
} from "@/server/integrations/google-oauth-test-users/test-users-api";
import { hasGoogleServiceAccountConfig } from "@/server/integrations/google-sheets/auth";

export type OauthTestUserActionResult =
  | {
      ok: true;
      added: string[];
      alreadyPresent: string[];
      total: number;
    }
  | { ok: false; error: string; consoleUrl?: string };

function parseEmailList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@") && s.length > 3);
}

export async function addOauthTestUsersAction(
  _prev: OauthTestUserActionResult | null,
  formData: FormData,
): Promise<OauthTestUserActionResult> {
  const staff = await requireOpensDoorsStaff();
  if (staff.role !== "ADMIN") {
    return { ok: false, error: "Only administrators can manage OAuth test users." };
  }
  if (!hasGoogleServiceAccountConfig()) {
    return {
      ok: false,
      error:
        "Google service account is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.",
    };
  }

  const raw = (formData.get("emails") as string | null) ?? "";
  const emails = parseEmailList(raw);
  if (emails.length === 0) {
    return { ok: false, error: "Enter at least one valid email address." };
  }
  if (emails.length > 100) {
    return { ok: false, error: "Maximum 100 emails per submission." };
  }

  // The Console API uses SetTrustedUserList (full replace). We need the
  // current list to merge new additions. The "currentKnownUsers" hidden
  // field is maintained by the client from its local state.
  const currentRaw = (formData.get("currentKnownUsers") as string | null) ?? "";
  const currentList = currentRaw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@") && s.length > 3);

  try {
    const result = await addGoogleOauthTestUsers(emails, currentList);
    return {
      ok: true,
      added: result.added,
      alreadyPresent: result.alreadyPresent,
      total: result.total,
    };
  } catch (e) {
    const consoleUrl = getConsoleTestUsersUrl();
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error adding test users.",
      consoleUrl,
    };
  }
}

export async function getConsoleUrlAction(): Promise<string> {
  return getConsoleTestUsersUrl();
}
