import { describe, expect, it } from "vitest";

import {
  MICROSOFT_GRAPH_SCOPE_MAIL_SEND,
  MICROSOFT_GRAPH_SCOPE_MAIL_READ,
  MICROSOFT_GRAPH_SCOPE_MAIL_READ_SHARED,
  MICROSOFT_GRAPH_SCOPE_MAIL_SEND_SHARED,
  microsoftMailboxOAuthScopes,
} from "./oauth-env";

describe("Microsoft mailbox OAuth scopes", () => {
  it("includes Graph mail scopes for self + shared/delegate mailboxes", () => {
    const s = microsoftMailboxOAuthScopes();
    expect(s).toContain(MICROSOFT_GRAPH_SCOPE_MAIL_READ);
    expect(s).toContain(MICROSOFT_GRAPH_SCOPE_MAIL_SEND);
    expect(s).toContain(MICROSOFT_GRAPH_SCOPE_MAIL_READ_SHARED);
    expect(s).toContain(MICROSOFT_GRAPH_SCOPE_MAIL_SEND_SHARED);
  });
});
