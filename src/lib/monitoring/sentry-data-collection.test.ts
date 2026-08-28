import { createRequire } from "node:module";
import path from "node:path";

import type { DataCollection } from "@sentry/core";
import { describe, expect, it } from "vitest";

import { SENTRY_DATA_COLLECTION } from "./sentry-data-collection";

/**
 * Compile-time conformance, deliberately here and not in the module itself.
 * `@sentry/core` is not a declared dependency (see the note on
 * `SentryDataCollectionPolicy`), so this assignability check lives where a
 * resolution failure is a loud test failure rather than a broken build.
 */
const _conformsToSdkType: DataCollection = SENTRY_DATA_COLLECTION;
void _conformsToSdkType;

/**
 * These tests drive the REAL resolver out of the installed `@sentry/core`, not a
 * copy of it. That matters: the whole defect this file exists to prevent is a
 * config that LOOKS restrictive and is not, and only the SDK's own code can
 * settle which it is.
 *
 * `resolveDataCollectionOptions` is not re-exported from the package root and
 * `@sentry/core`'s `exports` map blocks deep subpaths, so it is loaded by
 * absolute path off the package's own `package.json`. If a future SDK moves the
 * file this test fails loudly rather than silently passing on a stub.
 */
const require_ = createRequire(import.meta.url);
const resolverPath = path.join(
  path.dirname(require_.resolve("@sentry/core/package.json")),
  "build",
  "cjs",
  "utils",
  "data-collection",
  "resolveDataCollectionOptions.js",
);

type Resolved = {
  userInfo: boolean;
  cookies: unknown;
  httpHeaders: { request: unknown; response: unknown };
  httpBodies: string[];
  urlQueryParams: unknown;
  graphQL: { document: boolean; variables: boolean };
  genAI: { inputs: boolean; outputs: boolean };
  databaseQueryData: boolean;
  stackFrameVariables: boolean;
  frameContextLines: number;
};

const { resolveDataCollectionOptions } = require_(resolverPath) as {
  resolveDataCollectionOptions: (options: {
    dataCollection?: unknown;
    sendDefaultPii?: boolean;
  }) => Resolved;
};

describe("the empty dataCollection block the Sentry installer writes", () => {
  it("is what TURNS COLLECTION ON — supplying it selects the permissive defaults", () => {
    // This is the finding, stated as an assertion. `options.dataCollection != null`
    // is the branch: `{}` is not null, so the base becomes DEFAULTS, and every
    // commented-out line is `undefined` and falls straight through to it.
    const resolved = resolveDataCollectionOptions({ dataCollection: {} });

    expect(resolved.userInfo).toBe(true);
    expect(resolved.cookies).toBe(true);
    expect(resolved.httpHeaders).toEqual({ request: true, response: true });
    expect(resolved.httpBodies).toEqual([
      "incomingRequest",
      "outgoingRequest",
      "incomingResponse",
      "outgoingResponse",
    ]);
    expect(resolved.urlQueryParams).toBe(true);
    expect(resolved.databaseQueryData).toBe(true);
    expect(resolved.stackFrameVariables).toBe(true);
  });

  it("is MORE permissive than omitting the block entirely", () => {
    // Deleting the block would be safer than leaving it empty — the legacy
    // `sendDefaultPii` bridge runs instead and defaults `userInfo` to false.
    // We do not rely on that: the same source carries a TODO to remove the
    // bridge in v11, at which point an absent block flips to the permissive
    // defaults asserted above. Hence: set it EXPLICITLY.
    expect(resolveDataCollectionOptions({}).userInfo).toBe(false);
    expect(resolveDataCollectionOptions({ dataCollection: {} }).userInfo).toBe(true);
  });
});

describe("SENTRY_DATA_COLLECTION", () => {
  const resolved = resolveDataCollectionOptions({
    dataCollection: SENTRY_DATA_COLLECTION,
  });

  it("keeps prospect identities out of error reports", () => {
    expect(resolved.userInfo).toBe(false);
    expect(resolved.cookies).toBe(false);
  });

  it("keeps the bodies of real outreach and real replies out of error reports", () => {
    expect(resolved.httpBodies).toEqual([]);
  });

  it("keeps prospect rows and local variables out of error reports", () => {
    expect(resolved.databaseQueryData).toBe(false);
    expect(resolved.stackFrameVariables).toBe(false);
  });

  it("keeps headers and query strings out of error reports", () => {
    expect(resolved.httpHeaders).toEqual({ request: false, response: false });
    expect(resolved.urlQueryParams).toBe(false);
  });

  it("sets EVERY field the resolver knows about, so nothing falls through to the defaults", () => {
    // The trap is asymmetric: because we supply `dataCollection`, the base is
    // DEFAULTS (permissive), so any field we leave unset is ON. This asserts our
    // object covers the resolver's whole surface — if a future SDK adds a field,
    // this reds and someone has to decide about it rather than inherit `true`.
    const resolvedKeys = Object.keys(resolved).sort();
    const ourKeys = Object.keys(SENTRY_DATA_COLLECTION).sort();

    expect(ourKeys).toEqual(resolvedKeys);
  });
});
