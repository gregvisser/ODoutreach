import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Row 157 — proving the fix FIRES, not just that it exists.
 *
 * Building a correctly-formatted banner (`operator-action-messages.test.ts`)
 * proves nothing if the button that calls the action never reads the
 * result, or if the old wrapper (`form-actions.ts`, which discarded
 * `{ok,error}`/`{released}`) is still what the page renders. This locks
 * down the wiring itself, the same way `admin-gate.test.ts` and
 * `reply-claim-wiring.test.ts` do for their features.
 */

function read(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

const buttonsSource = read("src", "components", "ops", "operator-mutation-buttons.tsx");
const pageSource = read(
  "src",
  "app",
  "(app)",
  "operations",
  "outbound",
  "page.tsx",
);

describe("the operations/outbound mutation buttons read and render their action results", () => {
  it("no longer routes through the discarding form-actions.ts wrapper", () => {
    expect(pageSource).not.toContain("form-actions");
    expect(pageSource).not.toContain("releaseStaleFormAction");
    expect(pageSource).not.toContain("requeueFailedFormAction");
    expect(pageSource).not.toContain("verifySenderFormAction");
  });

  it("the page mounts all three real feedback-carrying buttons", () => {
    expect(pageSource).toMatch(/<ReleaseStaleLocksButton[\s/]/);
    expect(pageSource).toMatch(/<VerifySenderReadyButton[\s/]/);
    expect(pageSource).toMatch(/<RequeueFailedButton[\s/]/);
  });

  it("each button disables itself while its action is in flight (useTransition pending)", () => {
    const buttonBlocks = buttonsSource.split(/^export function /m).slice(1);
    expect(buttonBlocks.length).toBe(3);
    for (const block of buttonBlocks) {
      expect(block).toMatch(/useTransition\(\)/);
      expect(block).toMatch(/disabled=\{pending\}/);
    }
  });

  it("each button reads the action's return value into the banner instead of discarding it", () => {
    expect(buttonsSource).toMatch(
      /const result = await releaseStaleProcessingAction\(\);[\s\S]*?setBanner\(releaseStaleLocksMessage\(result\.released\)\)/,
    );
    expect(buttonsSource).toMatch(
      /const result = await operatorRequeueFailedAction\([\s\S]*?setBanner\(requeueResultMessage\(result\)\)/,
    );
    expect(buttonsSource).toMatch(
      /await verifySenderIdentityReadyAction\(clientId\);[\s\S]*?setBanner\(\{ tone: "ok", text: VERIFY_SENDER_SUCCESS_MESSAGE \}\)/,
    );
  });

  it("every button's failure path is caught and shown, never swallowed", () => {
    const catches = buttonsSource.match(/catch \(error\) \{\s*setBanner\(actionErrorMessage\(error\)\);/g) ?? [];
    expect(catches.length).toBe(3);
  });

  it("the release-stale action's banner is actually rendered in JSX, not just computed", () => {
    expect(buttonsSource).toMatch(/<ActionBanner banner=\{banner\} \/>/);
  });
});
