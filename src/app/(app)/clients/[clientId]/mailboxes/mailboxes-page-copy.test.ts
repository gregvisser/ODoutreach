import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MAILBOXES_PAGE_INTRO } from "@/lib/mailboxes/mailbox-workspace-model";

const forbidden = [
  "Clients do not need ODoutreach sign-in",
  "Tokens are stored",
  "shared sending pool",
  "MFA in the browser",
  "authorised operator on this client",
] as const;

describe("Client Mailboxes page copy", () => {
  it("keeps MAILBOXES_PAGE_INTRO free of removed clutter phrases", () => {
    for (const phrase of forbidden) {
      expect(MAILBOXES_PAGE_INTRO).not.toContain(phrase);
    }
  });

  it("does not reintroduce clutter in mailboxes page or mailbox panel sources", () => {
    const pagePath = join(process.cwd(), "src/app/(app)/clients/[clientId]/mailboxes/page.tsx");
    const panelPath = join(process.cwd(), "src/components/clients/client-mailbox-identities-panel.tsx");
    const modelPath = join(process.cwd(), "src/lib/mailboxes/mailbox-workspace-model.ts");
    const combined = [pagePath, panelPath, modelPath]
      .map((p) => readFileSync(p, "utf8"))
      .join("\n");
    for (const phrase of forbidden) {
      expect(combined).not.toContain(phrase);
    }
  });
});
