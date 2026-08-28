import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The test that stops this from being the seventh "built, wired, reports
 * success and never fires".
 *
 * The callback route tests mock the token exchange and the Graph resolver, so
 * they prove the callback CARRIES a reason — they cannot prove the real code
 * ever ATTACHES one. If a single throw site went back to a plain `Error`,
 * everything downstream would keep passing and production would quietly return
 * to `callback_failed`, which is the exact defect this work exists to remove.
 *
 * So nothing here is mocked except the network: these are the real functions
 * the two callbacks call, driven against stubbed provider responses, asserting
 * the reason that comes out.
 */

import {
  exchangeGoogleMailboxAuthCode,
  fetchGoogleUserEmailAndSub,
} from "./google-mailbox-oauth";
import {
  MailboxOAuthFailure,
  mailboxOAuthFailureReasonOf,
} from "./mailbox-oauth-callback-shared";
import { resolveMicrosoftMailboxOAuthConnection } from "./mailbox-oauth-microsoft-resolve";
import {
  exchangeMicrosoftMailboxAuthCode,
  fetchMicrosoftGraphPrimaryEmail,
} from "./microsoft-mailbox-oauth";

/** Runs `fn`, requires it to throw, and returns the reason code it carried. */
async function reasonThrownBy(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    expect(
      e,
      "throw site raised a plain Error — the reason is lost and the operator is back to `callback_failed`",
    ).toBeInstanceOf(MailboxOAuthFailure);
    return mailboxOAuthFailureReasonOf(e);
  }
  throw new Error("expected a throw");
}

const OAUTH_ENV = {
  MAILBOX_GOOGLE_OAUTH_CLIENT_ID: "gid",
  MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET: "gsecret",
  MAILBOX_MICROSOFT_OAUTH_CLIENT_ID: "mid",
  MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET: "msecret",
  MAILBOX_OAUTH_REDIRECT_BASE_URL: "https://app.example.com",
  NEXTAUTH_URL: "https://app.example.com",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mailbox OAuth throw sites attach a reason", () => {
  beforeEach(() => {
    for (const [k, v] of Object.entries(OAUTH_ENV)) vi.stubEnv(k, v);
    vi.stubGlobal("fetch", vi.fn() as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("Google", () => {
    it("marks a refused token exchange as token_exchange_rejected", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          { error: "invalid_grant", error_description: "Bad Request" },
          400,
        ),
      );

      await expect(
        reasonThrownBy(() => exchangeGoogleMailboxAuthCode("code")),
      ).resolves.toBe("token_exchange_rejected");
    });

    it("marks a token response with no access_token as token_exchange_rejected", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ scope: "gmail" }, 200));

      await expect(
        reasonThrownBy(() => exchangeGoogleMailboxAuthCode("code")),
      ).resolves.toBe("token_exchange_rejected");
    });

    it("marks an unset client secret as oauth_app_misconfigured", async () => {
      vi.stubEnv("MAILBOX_GOOGLE_OAUTH_CLIENT_SECRET", "");

      await expect(
        reasonThrownBy(() => exchangeGoogleMailboxAuthCode("code")),
      ).resolves.toBe("oauth_app_misconfigured");
      // Nothing was sent: a misconfigured app is caught before the network.
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it("marks a failed userinfo lookup as provider_profile_unavailable", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ error: "invalid_token" }, 401),
      );

      await expect(
        reasonThrownBy(() => fetchGoogleUserEmailAndSub("at")),
      ).resolves.toBe("provider_profile_unavailable");
    });

    it("marks userinfo without an email as provider_profile_unavailable", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ sub: "s" }, 200));

      await expect(
        reasonThrownBy(() => fetchGoogleUserEmailAndSub("at")),
      ).resolves.toBe("provider_profile_unavailable");
    });

    it("keeps the message the row's lastError has always stored", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          { error: "invalid_grant", error_description: "Bad Request" },
          400,
        ),
      );

      await expect(exchangeGoogleMailboxAuthCode("code")).rejects.toThrow(
        "Google token exchange failed: invalid_grant — Bad Request",
      );
    });
  });

  describe("Microsoft", () => {
    it("marks a refused token exchange as token_exchange_rejected", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          { error: "invalid_grant", error_description: "expired" },
          400,
        ),
      );

      await expect(
        reasonThrownBy(() => exchangeMicrosoftMailboxAuthCode("code")),
      ).resolves.toBe("token_exchange_rejected");
    });

    it("marks an unset client secret as oauth_app_misconfigured", async () => {
      vi.stubEnv("MAILBOX_MICROSOFT_OAUTH_CLIENT_SECRET", "");

      await expect(
        reasonThrownBy(() => exchangeMicrosoftMailboxAuthCode("code")),
      ).resolves.toBe("oauth_app_misconfigured");
    });

    it("marks a failed Graph /me as provider_profile_unavailable", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ error: { message: "token expired" } }, 401),
      );

      await expect(
        reasonThrownBy(() => fetchMicrosoftGraphPrimaryEmail("at")),
      ).resolves.toBe("provider_profile_unavailable");
    });

    /**
     * The delegate case that is NOT a wrong-person mistake: the sign-in is
     * valid and the mailbox exists, but the account has no rights over it. 401
     * and 403 stay `oauth_account_mismatch`; anything else is a permissions job
     * for the customer's IT administrator and must say so.
     */
    it("marks a mailbox it cannot open as mailbox_access_denied", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const u = String(input instanceof Request ? input.url : input);
        if (u.endsWith("/me")) {
          return jsonResponse(
            { id: "admin-graph", mail: "it@opensdoors.co.uk" },
            200,
          );
        }
        return new Response("Not Found", { status: 404 });
      });

      await expect(
        reasonThrownBy(() =>
          resolveMicrosoftMailboxOAuthConnection({
            accessToken: "at",
            mailboxEmailNormalized: "lucy@opensdoors.co.uk",
          }),
        ),
      ).resolves.toBe("mailbox_access_denied");
    });

    it("still marks a 403 on the delegate probe as the wrong-account case", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const u = String(input instanceof Request ? input.url : input);
        if (u.endsWith("/me")) {
          return jsonResponse(
            { id: "admin-graph", mail: "it@opensdoors.co.uk" },
            200,
          );
        }
        return new Response("Forbidden", { status: 403 });
      });

      await expect(
        reasonThrownBy(() =>
          resolveMicrosoftMailboxOAuthConnection({
            accessToken: "at",
            mailboxEmailNormalized: "lucy@opensdoors.co.uk",
          }),
        ),
      ).resolves.toBe("oauth_account_mismatch");
    });

    it("marks a directory lookup that returns no id as mailbox_access_denied", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const u = String(input instanceof Request ? input.url : input);
        if (u.endsWith("/me")) {
          return jsonResponse(
            { id: "admin-graph", mail: "it@opensdoors.co.uk" },
            200,
          );
        }
        if (u.includes("/mailFolders/inbox/messages")) {
          return jsonResponse({ value: [] }, 200);
        }
        return jsonResponse({}, 200);
      });

      await expect(
        reasonThrownBy(() =>
          resolveMicrosoftMailboxOAuthConnection({
            accessToken: "at",
            mailboxEmailNormalized: "lucy@opensdoors.co.uk",
          }),
        ),
      ).resolves.toBe("mailbox_access_denied");
    });
  });
});
