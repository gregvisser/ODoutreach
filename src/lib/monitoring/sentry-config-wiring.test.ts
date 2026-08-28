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

/**
 * The DSN half of the same question: the policy above governs WHAT is collected,
 * this governs WHETHER anything is collected at all in production.
 *
 * Since `72a11bd` the DSN is `process.env.NEXT_PUBLIC_SENTRY_DSN` rather than a
 * string in the source, and an absent DSN disables the SDK outright. That raised
 * an obvious fear — that production had been running blind on a missing Azure
 * App Service setting. It has not, and the reason is worth pinning down because
 * it is not intuitive:
 *
 *   `NEXT_PUBLIC_*` is not a runtime lookup. Next.js replaces every reference to
 *   `process.env.NEXT_PUBLIC_SENTRY_DSN` with the value present when `next build`
 *   ran, and the result is frozen
 *   (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
 *   lines 164-166).
 *
 * Measured on 2026-08-28 rather than reasoned about, because the docs emphasise
 * the browser bundle and the server side is where this product's errors actually
 * happen:
 *
 *  - Built once with the variable UNSET: the server chunk and
 *    `edge-instrumentation.js` still contained a live
 *    `process.env.NEXT_PUBLIC_SENTRY_DSN` read. On its own that looks like proof
 *    that the server depends on a runtime setting. It is not.
 *  - Built again with it SET: the literal is baked into the server chunk, the
 *    edge instrumentation AND the browser bundle, and NO `process.env` read
 *    remains anywhere in `.next/server`. The reference survives only when there
 *    is no value to substitute.
 *
 * So all three runtimes are inlined from the build environment. The App Service
 * has no Sentry setting at all — 38 settings, none matching SENTRY — and
 * production monitoring is on regardless, because `deploy-production.yml`
 * supplies the DSN as a literal on the BUILD step. Confirmed against the running
 * deployment the same day: the DSN is present in the `main-app-*.js` actually
 * served by app-opensdoors-outreach-prod.azurewebsites.net.
 *
 * So the single point of failure is that one literal, and these are the two ways
 * it could regress silently:
 *
 *  1. Someone turns the literal into `${{ secrets.X }}` or `${{ vars.X }}` for
 *     tidiness. An unset secret expands to an empty string — no error, no warning,
 *     and error monitoring is off from that deploy onward.
 *  2. Someone moves it off the build step. Set anywhere later it inlines nothing,
 *     because the build has already happened.
 *
 * Neither shows up in lint, tests or a green deploy, which is why they are
 * asserted here rather than trusted to review.
 */
describe("production error monitoring cannot be switched off by a missing setting", () => {
  const WORKFLOW = path.join(".github", "workflows", "deploy-production.yml");
  const workflow = readFileSync(path.join(REPO_ROOT, WORKFLOW), "utf8");

  // Steps are `      - name: ...` at a fixed indent; splitting on that gives one
  // chunk per step, so "is it on the BUILD step" is a containment check rather
  // than a guess about line ordering.
  const buildStep = workflow
    .split(/^ {6}- name: /m)
    .find((step) => step.startsWith("Build"));

  it("sets the DSN on the build step, where inlining can still happen", () => {
    expect(buildStep, `no Build step found in ${WORKFLOW}`).toBeDefined();
    expect(buildStep).toMatch(/^\s*NEXT_PUBLIC_SENTRY_DSN:/m);
    // The step must be the one that actually runs the build, otherwise the env
    // var is set on something that inlines nothing.
    expect(buildStep).toContain("npm run build");
  });

  it("sets it as a literal DSN, not an expression that can expand to empty", () => {
    const value = buildStep?.match(/^\s*NEXT_PUBLIC_SENTRY_DSN:\s*(.+)$/m)?.[1].trim();

    expect(value, "NEXT_PUBLIC_SENTRY_DSN has no value").toBeDefined();
    // A GitHub Actions expression is the failure mode: an unset secret or
    // variable expands to "" and disables the SDK without failing the deploy.
    expect(value).not.toContain("${{");
    // Shape-checked, not value-checked: pinning the exact project id here would
    // fail for a reason nobody cares about the first time the DSN is rotated.
    expect(value?.replace(/^["']|["']$/g, "")).toMatch(
      /^https:\/\/[a-f0-9]+@o\d+\.ingest\.[a-z.]*sentry\.io\/\d+$/,
    );
  });

  for (const relative of CONFIGS) {
    it(`${relative} reads the DSN in a form Next.js can inline`, () => {
      const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");

      // Next.js substitutes the literal text `process.env.NEXT_PUBLIC_SENTRY_DSN`.
      // Routed through a helper, a destructure or a computed key there is nothing
      // to substitute, the value is undefined in production, and the SDK is off.
      expect(source).toContain("dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,");
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
