import { describe, expect, it } from "vitest";

import {
  buildSenderSignatureViewModel,
  chooseSignatureForSend,
  type SenderSignatureMailbox,
} from "./sender-signature";
import { getOperatorSignatureState } from "./signature-operator-state";

import type { OperatorMailboxRow } from "./mailboxes-operator-model";

const brief = {
  senderDisplayNameFallback: "Client",
  emailSignatureFallback: "Brief sig",
} as const;

function row(
  o: Partial<OperatorMailboxRow & { id: string }> = {},
): Pick<OperatorMailboxRow, "connectionStatus" | "provider" | "email" | "id"> {
  return {
    id: "m1",
    email: "a@b.com",
    provider: "MICROSOFT",
    connectionStatus: "CONNECTED",
    ...o,
  };
}

function mbox(over: Partial<SenderSignatureMailbox> = {}): SenderSignatureMailbox {
  return {
    provider: "MICROSOFT",
    email: "a@b.com",
    displayName: null,
    senderDisplayName: null,
    senderSignatureHtml: null,
    senderSignatureText: null,
    senderSignatureSource: null,
    senderSignatureSyncedAt: null,
    senderSignatureSyncError: null,
    ...over,
  };
}

describe("getOperatorSignatureState", () => {
  it("returns not_connected when mailbox is not CONNECTED", () => {
    const r = row({ connectionStatus: "DRAFT" });
    const mb = mbox();
    const vm = buildSenderSignatureViewModel(mb, brief);
    const sel = chooseSignatureForSend({ mailbox: mb, clientBrief: brief });
    const s = getOperatorSignatureState(r, vm, sel);
    expect(s.kind).toBe("not_connected");
    expect(s.sendReadyFromSignature).toBe(false);
  });

  it("returns error_sync when Gmail sync has an error (even with stored text)", () => {
    const r = row({ provider: "GOOGLE" });
    const mb = mbox({
      provider: "GOOGLE",
      senderSignatureText: "X",
      senderSignatureSource: "gmail_send_as",
      senderSignatureSyncError: "forbidden",
    });
    const vm = buildSenderSignatureViewModel(mb, brief);
    const sel = chooseSignatureForSend({ mailbox: mb, clientBrief: brief });
    const s = getOperatorSignatureState(r, vm, sel);
    expect(s.kind).toBe("error_sync");
    expect(s.sendReadyFromSignature).toBe(false);
  });

  it("Gmail: ready_gmail with send-as text and no error", () => {
    const r = row({ provider: "GOOGLE" });
    const mb = mbox({
      provider: "GOOGLE",
      senderSignatureText: "G\nSig",
      senderSignatureSource: "gmail_send_as",
    });
    const vm = buildSenderSignatureViewModel(mb, brief);
    const sel = chooseSignatureForSend({ mailbox: mb, clientBrief: brief });
    const s = getOperatorSignatureState(r, vm, sel);
    expect(s.kind).toBe("ready_gmail");
    expect(s.sendReadyFromSignature).toBe(true);
  });

  it("Microsoft: ready_od for manual text", () => {
    const r = row();
    const mb = mbox({
      senderSignatureText: "MS",
      senderSignatureSource: "manual",
    });
    const vm = buildSenderSignatureViewModel(mb, brief);
    const sel = chooseSignatureForSend({ mailbox: mb, clientBrief: brief });
    const s = getOperatorSignatureState(r, vm, sel);
    expect(s.kind).toBe("ready_od");
    expect(s.sendReadyFromSignature).toBe(true);
  });

  it("uses warning_fallback when only client brief supplies text", () => {
    const r = row();
    const mb = mbox();
    const vm = buildSenderSignatureViewModel(mb, brief);
    const sel = chooseSignatureForSend({ mailbox: mb, clientBrief: brief });
    const s = getOperatorSignatureState(r, vm, sel);
    expect(sel.source).toBe("client_brief_fallback");
    expect(s.kind).toBe("warning_fallback");
    expect(s.sendReadyFromSignature).toBe(true);
  });

  it("returns missing with no text and no fallback (Microsoft)", () => {
    const r = row();
    const mb = mbox({ provider: "MICROSOFT" });
    const noBrief = { senderDisplayNameFallback: null, emailSignatureFallback: null };
    const vm = buildSenderSignatureViewModel(mb, noBrief);
    const sel = chooseSignatureForSend({ mailbox: mb, clientBrief: noBrief });
    const s = getOperatorSignatureState(r, vm, sel);
    expect(s.kind).toBe("missing");
    expect(s.sendReadyFromSignature).toBe(false);
  });
});
