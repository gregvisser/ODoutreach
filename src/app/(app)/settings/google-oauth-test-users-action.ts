"use server";

import { requireOpensDoorsStaff } from "@/server/auth/staff";
import {
  addGoogleOauthTestUsers,
  listGoogleOauthTestUsers,
} from "@/server/integrations/google-oauth-test-users/test-users-api";
import { hasGoogleServiceAccountConfig } from "@/server/integrations/google-sheets/auth";

export type OauthTestUserActionResult =
  | {
      ok: true;
      added: string[];
      alreadyPresent: string[];
      total: number;
    }
  | { ok: false; error: string };

export type OauthTestUserListResult =
  | { ok: true; emails: string[] }
  | { ok: false; error: string };

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

  try {
    const result = await addGoogleOauthTestUsers(emails);
    return {
      ok: true,
      added: result.added,
      alreadyPresent: result.alreadyPresent,
      total: result.total,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error adding test users.",
    };
  }
}

export async function listOauthTestUsersAction(): Promise<OauthTestUserListResult> {
  const staff = await requireOpensDoorsStaff();
  if (staff.role !== "ADMIN") {
    return { ok: false, error: "Forbidden" };
  }
  if (!hasGoogleServiceAccountConfig()) {
    return { ok: false, error: "Google service account not configured." };
  }
  try {
    const emails = await listGoogleOauthTestUsers();
    return { ok: true, emails };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to list test users.",
    };
  }
}
