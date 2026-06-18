import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PR #138 — Global Contacts duplication cleanup (G10).
 * PR #140 — Demotes the route from "everyone with workspace access" to
 *           admin-only. Non-admin staff are redirected to `/universe`,
 *           where the canonical cross-client directory lives. The route
 *           itself is preserved so admins can still run the cross-client
 *           CSV import + per-row send sheet when they need to.
 *
 * The `/contacts` route is not in the sidebar (see `nav-config.ts`
 * + `staff-handover-copy.test.ts`).
 */

const pagePath = join(process.cwd(), "src/app/(app)/contacts/page.tsx");
const pageSource = readFileSync(pagePath, "utf8");

describe("Global Contacts page (PR #138 + PR #140 admin-only)", () => {
  it("surfaces a banner pointing staff at Universe and Sources", () => {
    expect(pageSource).toContain('href="/universe"');
    expect(pageSource).toContain("Sources");
    expect(pageSource).toMatch(/not in the\s+staff sidebar/);
  });

  it("titles itself as an admin-only legacy tools surface (PR #140)", () => {
    expect(pageSource).toContain("Contacts (admin legacy tools)");
    expect(pageSource).toMatch(/Admin-only legacy tools/);
  });

  it("redirects non-admin staff to /universe (PR #140)", () => {
    expect(pageSource).toContain('redirect("/universe")');
    expect(pageSource).toMatch(/!staff\.isSuperAdmin/);
  });

  it("uses requireOpensDoorsStaff, not the looser requireStaffUser (PR #140)", () => {
    expect(pageSource).toContain("requireOpensDoorsStaff");
    expect(pageSource).not.toContain("requireStaffUser");
  });

  it("does not expose a Send button to normal staff (admin redirect happens first)", () => {
    // Sanity check: the redirect happens before any contact rendering, so
    // even though the file still imports SendToContactForm for the admin
    // path, the redirect runs first for non-admin staff.
    const redirectIdx = pageSource.indexOf('redirect("/universe")');
    const sendImportIdx = pageSource.indexOf("SendToContactForm");
    expect(redirectIdx).toBeGreaterThan(-1);
    expect(sendImportIdx).toBeGreaterThan(-1);
    // The export default function must be where the redirect lives.
    expect(pageSource).toMatch(
      /export default async function ContactsPage[\s\S]*?!staff\.isSuperAdmin[\s\S]*?redirect\("\/universe"\)/,
    );
  });
});
