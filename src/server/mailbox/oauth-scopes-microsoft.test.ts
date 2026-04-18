import { describe, expect, it } from "vitest";

import {
  MICROSOFT_GRAPH_SCOPE_MAIL_SEND,
  MICROSOFT_GRAPH_SCOPE_MAIL_READ,
  microsoftMailboxOAuthScopes,
} from "./oauth-env";

describe("Microsoft mailbox OAuth scopes", () => {
  it("includes Graph Mail.Read and Mail.Send for delegated send + ingest", () => {
    const s = microsoftMailboxOAuthScopes();
    expect(s).toContain(MICROSOFT_GRAPH_SCOPE_MAIL_READ);
    expect(s).toContain(MICROSOFT_GRAPH_SCOPE_MAIL_SEND);
  });
});
