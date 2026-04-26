import { describe, expect, it } from "vitest";

import {
  computePoolDailyMax,
  countConnectedMailboxes,
  countMailboxNeedsAttention,
  mailboxesWhatToDoNext,
  mailboxRowOperatorStatus,
  operatorSignatureTableLabel,
  type OperatorMailboxRow,
} from "./mailboxes-operator-model";
import type { SenderSignatureViewModel } from "@/lib/mailboxes/sender-signature";

const base = (): OperatorMailboxRow => ({
  id: "m1",
  email: "a@b.co",
  displayName: null,
  provider: "MICROSOFT",
  connectionStatus: "CONNECTED",
  workspaceRemovedAt: null,
  isActive: true,
  isPrimary: false,
  isSendingEnabled: true,
  dailySendCap: 30,
  emailsSentToday: 0,
  dailyWindowResetAt: null,
  lastError: null,
});

function vm(over: Partial<SenderSignatureViewModel>): SenderSignatureViewModel {
  return {
    resolvedDisplayName: "A",
    resolvedSignatureText: "",
    hasMailboxSignature: false,
    source: "missing",
    lastSyncedAtIso: null,
    syncError: null,
    automaticSyncSupported: true,
    ...over,
  };
}

describe("mailboxRowOperatorStatus", () => {
  it("uses plain labels for key states", () => {
    const r0 = { ...base(), connectionStatus: "DRAFT" as const };
    expect(mailboxRowOperatorStatus(r0).label).toBe("Needs connection");
    const r1 = { ...base(), connectionStatus: "PENDING_CONNECTION" as const };
    expect(mailboxRowOperatorStatus(r1).label).toBe("Needs approval");
    const r2 = { ...base(), connectionStatus: "CONNECTION_ERROR" as const, provider: "MICROSOFT" as const };
    expect(mailboxRowOperatorStatus(r2).sublabel).toContain("Microsoft 365");
    const r3 = { ...base(), isSendingEnabled: false };
    expect(mailboxRowOperatorStatus(r3).label).toBe("Sending paused");
  });

  it("does not use EMAIL_PROVIDER or global transport in labels", () => {
    const r = { ...base() };
    const t = JSON.stringify(mailboxRowOperatorStatus(r));
    expect(t).not.toContain("EMAIL_PROVIDER");
    expect(t).not.toContain("Resend");
    expect(t).not.toContain("legacy");
  });
});

describe("countMailboxNeedsAttention", () => {
  it("counts connection issues and missing signatures", () => {
    const rows: OperatorMailboxRow[] = [
      { ...base(), id: "a", connectionStatus: "CONNECTED" },
      { ...base(), id: "b", connectionStatus: "DRAFT" },
    ];
    const vms: SenderSignatureViewModel[] = [
      vm({ source: "missing", resolvedSignatureText: "" }),
      vm({ source: "manual", resolvedSignatureText: "ok" }),
    ];
    expect(
      countMailboxNeedsAttention({ activeRows: rows, viewModels: vms }),
    ).toBe(2);
  });
});

describe("mailboxesWhatToDoNext", () => {
  it("returns add-first for empty", () => {
    expect(
      mailboxesWhatToDoNext({ activeRowCount: 0, needsAttentionCount: 0 })
        .kind,
    ).toBe("add_first");
  });
  it("returns all ready when no attention", () => {
    expect(
      mailboxesWhatToDoNext({ activeRowCount: 1, needsAttentionCount: 0 })
        .kind,
    ).toBe("all_ready");
  });
});

describe("computePoolDailyMax", () => {
  it("uses ledger cap when available", () => {
    const rows = [base()];
    const max = computePoolDailyMax(rows, { m1: { cap: 30, bookedInUtcDay: 0, remaining: 30 } });
    expect(max).toBe(30);
  });
});

describe("countConnectedMailboxes", () => {
  it("counts only CONNECTED", () => {
    const rows: OperatorMailboxRow[] = [
      { ...base(), id: "a", connectionStatus: "CONNECTED" },
      { ...base(), id: "b", connectionStatus: "DRAFT" },
    ];
    expect(countConnectedMailboxes(rows)).toBe(1);
  });
});

describe("operatorSignatureTableLabel", () => {
  it("keeps Microsoft honest: no auto-sync", () => {
    const t = operatorSignatureTableLabel(
      { provider: "MICROSOFT", connectionStatus: "CONNECTED" },
      vm({ source: "unsupported_provider" }),
    );
    expect(t.isSyncedGmail).toBe(false);
    expect(t.label).toBe("Needs signature");
  });

  it("labels Gmail as synced from Gmail when send-as and timestamp exist", () => {
    const t = operatorSignatureTableLabel(
      { provider: "GOOGLE", connectionStatus: "CONNECTED" },
      vm({ source: "gmail_send_as", lastSyncedAtIso: "2026-01-01" }),
    );
    expect(t.label).toBe("Synced from Gmail");
    expect(t.isSyncedGmail).toBe(true);
  });
});
