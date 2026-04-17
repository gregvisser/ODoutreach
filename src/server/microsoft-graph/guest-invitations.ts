import "server-only";

import { graphFetch } from "./app-client";

export type GraphInvitationResult = {
  invitationId: string;
  invitedUserObjectId: string;
  status: string;
};

/**
 * Create a B2B guest invitation in the Entra tenant (sends email when sendInvitationMessage is true).
 */
export async function createGuestInvitation(
  email: string,
  inviteRedirectUrl: string,
): Promise<GraphInvitationResult> {
  const res = await graphFetch("/invitations", {
    method: "POST",
    jsonBody: {
      invitedUserEmailAddress: email,
      inviteRedirectUrl,
      sendInvitationMessage: true,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Graph invitation failed (${res.status}): ${text}`);
  }

  const json = JSON.parse(text) as {
    id?: string;
    status?: string;
    invitedUser?: { id?: string };
  };

  if (!json.id || !json.invitedUser?.id) {
    throw new Error("Graph invitation response missing id or invitedUser.id");
  }

  return {
    invitationId: json.id,
    invitedUserObjectId: json.invitedUser.id,
    status: json.status ?? "unknown",
  };
}

/** externalUserState on user: PendingAcceptance | Accepted | etc. */
export async function getGuestUserExternalState(
  invitedUserObjectId: string,
): Promise<string | null> {
  const path = `/users/${encodeURIComponent(invitedUserObjectId)}?$select=id,externalUserState`;
  const res = await graphFetch(path, { method: "GET" });
  if (!res.ok) {
    if (res.status === 404) return null;
    const t = await res.text();
    throw new Error(`Graph user read failed (${res.status}): ${t}`);
  }
  const json = (await res.json()) as { externalUserState?: string | null };
  return json.externalUserState ?? null;
}
