/**
 * Pure classifier for Microsoft Graph guest-invitation failures.
 *
 * Goal: take the HTTP status + raw response body from a POST to
 * `https://graph.microsoft.com/v1.0/invitations` and turn it into a
 * stable, operator-friendly code + message pair. No raw Graph JSON
 * should ever reach the UI.
 *
 * This module is intentionally pure (no server-only imports, no fetch,
 * no Prisma) so it can be unit-tested and reused anywhere.
 */

export type InvitationErrorCode =
  | "missing_graph_permission"
  | "admin_consent_required"
  | "guest_invitation_not_allowed_by_tenant"
  | "signed_in_admin_lacks_required_role"
  | "invited_user_already_exists"
  | "invited_user_email_invalid"
  | "graph_rate_limited"
  | "graph_service_unavailable"
  | "unknown_graph_invite_error";

export type ClassifiedInvitationError = {
  code: InvitationErrorCode;
  /** Short operator-facing message (no raw Graph payload). */
  message: string;
  /** Longer admin-actionable guidance shown under the banner. */
  guidance: string;
  /** HTTP status returned by Graph, if known. */
  status: number | null;
  /** Microsoft request-id if present — useful for tenant admin tickets. */
  requestId: string | null;
  /** Stable Graph error code (e.g. "Authorization_RequestDenied") if present. */
  graphCode: string | null;
};

const GENERIC_ADMIN_GUIDANCE =
  "Ask the Bidlow Entra admin to grant the Microsoft Graph application permission " +
  "User.Invite.All on the ODoutreach Entra app registration, grant admin consent, " +
  "and confirm that B2B guest invitations are enabled in the tenant.";

type GraphErrorShape = {
  error?: {
    code?: string;
    message?: string;
    innerError?: {
      "request-id"?: string;
      requestId?: string;
      code?: string;
    };
  };
};

function safeParse(body: string | null | undefined): GraphErrorShape | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as GraphErrorShape;
  } catch {
    return null;
  }
}

function containsIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Classify a Microsoft Graph invitations failure into a stable code +
 * clean, operator-facing message. Never returns raw Graph JSON.
 */
export function classifyInvitationError(input: {
  status: number | null;
  body: string | null | undefined;
}): ClassifiedInvitationError {
  const { status } = input;
  const parsed = safeParse(input.body);
  const rawMessage = parsed?.error?.message ?? "";
  const graphCode = parsed?.error?.code ?? null;
  const innerCode = parsed?.error?.innerError?.code ?? null;
  const requestId =
    parsed?.error?.innerError?.["request-id"] ??
    parsed?.error?.innerError?.requestId ??
    null;

  const haystack = `${graphCode ?? ""} ${innerCode ?? ""} ${rawMessage}`;

  const base = {
    status,
    requestId,
    graphCode,
  };

  // --- Already exists / duplicate invite -----------------------------------
  if (
    status === 409 ||
    containsIgnoreCase(haystack, "already exists") ||
    containsIgnoreCase(haystack, "already invited") ||
    containsIgnoreCase(haystack, "ObjectConflict")
  ) {
    return {
      ...base,
      code: "invited_user_already_exists",
      message: "This user already exists in the Bidlow tenant.",
      guidance:
        "If they cannot sign in, check the guest user in Entra ID and re-send the invitation from the Microsoft admin centre, or use “Sync invite status”.",
    };
  }

  // --- Invalid invitee email ----------------------------------------------
  if (
    status === 400 &&
    (containsIgnoreCase(haystack, "invitedUserEmailAddress") ||
      containsIgnoreCase(haystack, "not a valid email") ||
      containsIgnoreCase(haystack, "invalid recipient"))
  ) {
    return {
      ...base,
      code: "invited_user_email_invalid",
      message: "Microsoft rejected the invitee email address.",
      guidance:
        "Check that the address is a valid external email, not a .local / internal-only address.",
    };
  }

  // --- Tenant disables B2B invitations ------------------------------------
  if (
    (status === 403 || status === 401) &&
    (containsIgnoreCase(haystack, "invitation") ||
      containsIgnoreCase(haystack, "invitations")) &&
    (containsIgnoreCase(haystack, "disabled") ||
      containsIgnoreCase(haystack, "not allowed") ||
      containsIgnoreCase(haystack, "policy"))
  ) {
    return {
      ...base,
      code: "guest_invitation_not_allowed_by_tenant",
      message: "Guest invitations are disabled in the Bidlow tenant.",
      guidance:
        "Ask the Bidlow Entra admin to enable external collaboration / B2B guest invitations in the tenant’s External Identities settings.",
    };
  }

  // --- Admin consent required ---------------------------------------------
  if (
    containsIgnoreCase(haystack, "admin consent") ||
    containsIgnoreCase(haystack, "consent_required") ||
    containsIgnoreCase(haystack, "needs admin approval")
  ) {
    return {
      ...base,
      code: "admin_consent_required",
      message:
        "Microsoft Graph needs admin consent before ODoutreach can send guest invitations.",
      guidance:
        "Ask the Bidlow Entra admin to grant admin consent for the ODoutreach Entra app registration’s Microsoft Graph User.Invite.All application permission.",
    };
  }

  // --- 401/403 Authorization_RequestDenied / insufficient privileges ------
  if (
    (status === 401 || status === 403) &&
    (containsIgnoreCase(haystack, "Authorization_RequestDenied") ||
      containsIgnoreCase(haystack, "insufficient privileges") ||
      containsIgnoreCase(haystack, "access is denied") ||
      containsIgnoreCase(haystack, "access denied") ||
      containsIgnoreCase(haystack, "forbidden"))
  ) {
    // Distinguish "signed-in admin lacks role" vs "app lacks permission".
    // App-only (client credentials) failures normally come back as
    // Authorization_RequestDenied with no user context, so we treat 401/403
    // + Authorization_RequestDenied as a missing-permission problem unless
    // the payload clearly points to a delegated user restriction.
    if (
      containsIgnoreCase(haystack, "signed-in user") ||
      containsIgnoreCase(haystack, "user is not allowed") ||
      containsIgnoreCase(haystack, "caller is not authorized")
    ) {
      return {
        ...base,
        code: "signed_in_admin_lacks_required_role",
        message:
          "The signed-in admin account is not allowed to invite guest users in this tenant.",
        guidance:
          "Ask the Bidlow Entra admin to assign the signed-in admin the Guest Inviter (or User Administrator) role, or enable tenant-default guest-invite for all members.",
      };
    }

    return {
      ...base,
      code: "missing_graph_permission",
      message:
        "Guest invitations are not currently authorised for the ODoutreach Microsoft app.",
      guidance: GENERIC_ADMIN_GUIDANCE,
    };
  }

  // --- Throttling ---------------------------------------------------------
  if (status === 429) {
    return {
      ...base,
      code: "graph_rate_limited",
      message: "Microsoft Graph is rate-limiting invitation requests.",
      guidance: "Wait a minute and try again. Do not retry in a loop.",
    };
  }

  // --- Graph outage -------------------------------------------------------
  if (status !== null && status >= 500) {
    return {
      ...base,
      code: "graph_service_unavailable",
      message: "Microsoft Graph is unavailable right now.",
      guidance:
        "This is a Microsoft-side issue. Wait a few minutes and retry; if it persists, check Microsoft 365 service health.",
    };
  }

  // --- Fallback -----------------------------------------------------------
  return {
    ...base,
    code: "unknown_graph_invite_error",
    message: "Microsoft Graph refused the invitation.",
    guidance:
      "Share the Microsoft request id below with the Bidlow Entra admin so they can review Sign-in / Audit logs for the ODoutreach app registration.",
  };
}

/**
 * Render a short banner-safe line for the operator UI. Includes the Graph
 * status and request-id (if present) but NEVER the raw response body.
 */
export function formatInvitationErrorForBanner(
  e: ClassifiedInvitationError,
): string {
  const parts: string[] = [e.message];
  const diag: string[] = [];
  if (e.status !== null) diag.push(`Graph ${e.status}`);
  if (e.requestId) diag.push(`request-id ${e.requestId}`);
  if (diag.length > 0) parts.push(`(${diag.join(" · ")})`);
  parts.push(e.guidance);
  return parts.join(" ");
}
