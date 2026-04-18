import { describe, expect, it } from "vitest";

import {
  mapGraphInboxMessageToRow,
  type MicrosoftGraphMessage,
} from "./microsoft-graph-inbox";

describe("mapGraphInboxMessageToRow", () => {
  it("maps a standard Graph message", () => {
    const msg: MicrosoftGraphMessage = {
      id: "msg-1",
      subject: "Re: Hello",
      from: { emailAddress: { address: "Contact@Example.com", name: "C" } },
      toRecipients: [{ emailAddress: { address: "You@Tenant.com" } }],
      receivedDateTime: "2026-04-18T12:00:00Z",
      bodyPreview: "Thanks",
      conversationId: "conv-9",
      internetMessageId: "<abc@mail>",
    };
    const r = mapGraphInboxMessageToRow(msg);
    expect(r).not.toBeNull();
    expect(r!.providerMessageId).toBe("msg-1");
    expect(r!.fromEmail).toBe("contact@example.com");
    expect(r!.toEmail).toBe("you@tenant.com");
    expect(r!.subject).toBe("Re: Hello");
    expect(r!.bodyPreview).toBe("Thanks");
    expect(r!.conversationId).toBe("conv-9");
    expect(r!.metadata.internetMessageId).toBe("<abc@mail>");
  });

  it("returns null without id", () => {
    expect(
      mapGraphInboxMessageToRow({ from: { emailAddress: { address: "a@b.co" } } }),
    ).toBeNull();
  });

  it("returns null without from address", () => {
    expect(mapGraphInboxMessageToRow({ id: "x" })).toBeNull();
  });

  it("idempotency key is stable for the same Graph id", () => {
    const a = mapGraphInboxMessageToRow({
      id: "m1",
      from: { emailAddress: { address: "a@b.co" } },
    });
    const b = mapGraphInboxMessageToRow({
      id: "m1",
      from: { emailAddress: { address: "a@b.co" } },
    });
    expect(a?.providerMessageId).toBe(b?.providerMessageId);
  });
});
