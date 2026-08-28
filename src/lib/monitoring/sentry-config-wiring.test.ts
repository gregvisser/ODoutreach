import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * The constant being correct proves nothing on its own. This repository's
 * signature defect is a thing that is built, wired, reports success and never
 * fires, so this file proves the policy REACHES `Sentry.init`.
 *
 * Two levels, on purpose:
 *
 *  - Runtime, for the server config: import the real file, let it call
 *    `Sentry.init`, and read the options back off the live client. That is the
 *    only assertion here that is evidence rather than inference.
 *  - Static, for all three configs: the edge and client configs cannot be
 *    imported under a Node test runner (edge and browser runtimes), so they are
 *    checked by source — they must pass the shared constant and must not carry
 *    an inline block. A file-content check is weak, which is why it is not the
 *    only one.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const CONFIGS = [
  "sentry.server.config.ts",
  "sentry.edge.config.ts",
  path.join("src", "instrumentation-client.ts"),
];

describe("every Sentry entry point uses the shared collection policy", () => {
  for (const relative of CONFIGS) {
    it(`${relative} passes SENTRY_DATA_COLLECTION and carries no inline block`, () => {
      const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");

      expect(source).toContain(
        'import { SENTRY_DATA_COLLECTION } from "@/lib/monitoring/sentry-data-collection"',
      );
      expect(source).toContain("dataCollection: SENTRY_DATA_COLLECTION,");
      // The installer's shape. An empty or partial inline object silently
      // selects the permissive defaults for anything it omits.
      expect(source).not.toMatch(/dataCollection:\s*\{/);
    });
  }
});

describe("the server config, actually initialised", () => {
  afterAll(async () => {
    const Sentry = await import("@sentry/nextjs");
    await Sentry.close();
  });

  it("hands Sentry a client that will not collect prospect data", async () => {
    // A syntactically valid DSN pointing at a host that does not exist. It is
    // needed only because an empty DSN disables the SDK and leaves no client to
    // inspect; nothing in this test captures an event, so nothing is sent.
    process.env.NEXT_PUBLIC_SENTRY_DSN =
      "https://0000000000000000000000000000000@o0.ingest.invalid/0";

    await import("../../../sentry.server.config");

    const Sentry = await import("@sentry/nextjs");
    const client = Sentry.getClient();
    expect(client, "Sentry.init did not produce a client").toBeDefined();

    const resolved = client!.getDataCollectionOptions();

    expect(resolved.userInfo).toBe(false);
    expect(resolved.cookies).toBe(false);
    expect(resolved.httpHeaders).toEqual({ request: false, response: false });
    expect(resolved.httpBodies).toEqual([]);
    expect(resolved.urlQueryParams).toBe(false);
    expect(resolved.databaseQueryData).toBe(false);
    expect(resolved.stackFrameVariables).toBe(false);
    expect(resolved.genAI).toEqual({ inputs: false, outputs: false });
    expect(resolved.graphQL).toEqual({ document: false, variables: false });
  });
});
