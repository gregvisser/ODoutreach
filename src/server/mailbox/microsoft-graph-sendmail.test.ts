import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMicrosoftGraphSendMail } from "./microsoft-graph-sendmail";

describe("sendMicrosoftGraphSendMail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns success on 202 from Graph", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 202 }),
      ),
    );
    const r = await sendMicrosoftGraphSendMail({
      accessToken: "t",
      to: "a@b.co",
      subject: "s",
      bodyText: "b",
      correlationId: "corr-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.providerMessageId).toBe("msgraph:sendmail:corr-1");
      expect(r.providerName).toBe("microsoft_graph");
    }
  });

  it("returns failure for 403 (e.g. missing Mail.Send)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("nope", { status: 403, statusText: "Forbidden" }),
      ),
    );
    const r = await sendMicrosoftGraphSendMail({
      accessToken: "t",
      to: "a@b.co",
      subject: "s",
      bodyText: "b",
      correlationId: "corr-2",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("403");
    }
  });
});
