import { describe, expect, it } from "vitest";

import {
  classifyInvitationError,
  formatInvitationErrorForBanner,
} from "./invitation-errors";

function graphError(
  code: string,
  message: string,
  extra?: { requestId?: string; innerCode?: string },
): string {
  return JSON.stringify({
    error: {
      code,
      message,
      innerError: {
        "request-id": extra?.requestId ?? "00000000-0000-0000-0000-000000000000",
        date: "2026-04-23T12:00:00",
        ...(extra?.innerCode ? { code: extra.innerCode } : {}),
      },
    },
  });
}

describe("classifyInvitationError", () => {
  it("classifies 401 Authorization_RequestDenied / insufficient privileges as missing_graph_permission", () => {
    const body = graphError(
      "Authorization_RequestDenied",
      "Insufficient privileges to complete the operation.",
      { requestId: "req-1" },
    );
    const result = classifyInvitationError({ status: 401, body });
    expect(result.code).toBe("missing_graph_permission");
    expect(result.status).toBe(401);
    expect(result.requestId).toBe("req-1");
    expect(result.graphCode).toBe("Authorization_RequestDenied");
    expect(result.message).toMatch(/not currently authorised/i);
    expect(result.guidance).toMatch(/User\.Invite\.All/);
  });

  it("classifies 403 Authorization_RequestDenied similarly as missing_graph_permission", () => {
    const body = graphError(
      "Authorization_RequestDenied",
      "Insufficient privileges to complete the operation.",
    );
    const result = classifyInvitationError({ status: 403, body });
    expect(result.code).toBe("missing_graph_permission");
  });

  it("classifies admin-consent messages as admin_consent_required", () => {
    const body = graphError(
      "AccessDenied",
      "The application needs admin consent before it can call this API.",
    );
    const result = classifyInvitationError({ status: 403, body });
    expect(result.code).toBe("admin_consent_required");
    expect(result.message).toMatch(/admin consent/i);
    expect(result.guidance).toMatch(/admin consent/i);
  });

  it("classifies access-denied payloads as missing_graph_permission when no admin-consent hint", () => {
    const body = graphError("AccessDenied", "Access is denied.");
    const result = classifyInvitationError({ status: 403, body });
    expect(result.code).toBe("missing_graph_permission");
  });

  it("classifies a tenant-disabled invitation policy as guest_invitation_not_allowed_by_tenant", () => {
    const body = graphError(
      "AccessDenied",
      "Guest invitations are disabled for this tenant by policy.",
    );
    const result = classifyInvitationError({ status: 403, body });
    expect(result.code).toBe("guest_invitation_not_allowed_by_tenant");
    expect(result.guidance).toMatch(/B2B|External Identities/i);
  });

  it("classifies duplicate-invite / already-exists as invited_user_already_exists", () => {
    const body = graphError(
      "Request_BadRequest",
      "Another object with the same value for property 'userPrincipalName' already exists.",
    );
    const result = classifyInvitationError({ status: 409, body });
    expect(result.code).toBe("invited_user_already_exists");
  });

  it("also uses 'ObjectConflict' hint to classify as invited_user_already_exists", () => {
    const body = graphError(
      "ObjectConflict",
      "User already invited.",
    );
    const result = classifyInvitationError({ status: 400, body });
    expect(result.code).toBe("invited_user_already_exists");
  });

  it("classifies signed-in-user restriction as signed_in_admin_lacks_required_role", () => {
    const body = graphError(
      "Authorization_RequestDenied",
      "The signed-in user is not allowed to invite guest users.",
    );
    const result = classifyInvitationError({ status: 403, body });
    expect(result.code).toBe("signed_in_admin_lacks_required_role");
    expect(result.guidance).toMatch(/Guest Inviter|User Administrator/);
  });

  it("classifies invalid invitee email as invited_user_email_invalid", () => {
    const body = graphError(
      "Request_BadRequest",
      "Property 'invitedUserEmailAddress' is not a valid email address.",
    );
    const result = classifyInvitationError({ status: 400, body });
    expect(result.code).toBe("invited_user_email_invalid");
  });

  it("classifies 429 as graph_rate_limited", () => {
    const result = classifyInvitationError({ status: 429, body: "" });
    expect(result.code).toBe("graph_rate_limited");
  });

  it("classifies 5xx as graph_service_unavailable", () => {
    const result = classifyInvitationError({ status: 503, body: "" });
    expect(result.code).toBe("graph_service_unavailable");
  });

  it("falls back to unknown_graph_invite_error for unrecognised payloads", () => {
    const result = classifyInvitationError({
      status: 400,
      body: graphError("Something_Weird", "An unexpected thing happened."),
    });
    expect(result.code).toBe("unknown_graph_invite_error");
    expect(result.guidance).toMatch(/request id/i);
  });

  it("handles null/empty body safely and still returns a classification", () => {
    const result = classifyInvitationError({ status: 500, body: null });
    expect(result.code).toBe("graph_service_unavailable");
    expect(result.requestId).toBeNull();
    expect(result.graphCode).toBeNull();
  });

  it("handles non-JSON garbage in body without throwing", () => {
    const result = classifyInvitationError({
      status: 401,
      body: "<html>proxy error</html>",
    });
    expect(result.code).toBe("unknown_graph_invite_error");
  });
});

describe("formatInvitationErrorForBanner", () => {
  it("includes status + request-id but never raw Graph JSON", () => {
    const body = JSON.stringify({
      error: {
        code: "Authorization_RequestDenied",
        message: "Insufficient privileges to complete the operation.",
        innerError: { "request-id": "abc-123", path: "/beta/invites" },
      },
    });
    const classified = classifyInvitationError({ status: 401, body });
    const banner = formatInvitationErrorForBanner(classified);

    expect(banner).toMatch(/not currently authorised/i);
    expect(banner).toMatch(/Graph 401/);
    expect(banner).toMatch(/request-id abc-123/);
    // The raw Graph JSON and internal path must never leak to the UI.
    expect(banner).not.toMatch(/\/beta\/invites/);
    expect(banner).not.toMatch(/"error"\s*:/);
    expect(banner).not.toMatch(/innerError/);
  });

  it("omits the diagnostic block cleanly when status and request-id are absent", () => {
    const classified = classifyInvitationError({ status: null, body: null });
    const banner = formatInvitationErrorForBanner(classified);
    expect(banner).not.toMatch(/\(\)/);
    expect(banner).not.toMatch(/request-id/);
  });
});
