import { afterAll, describe, expect, it } from "vitest";

/**
 * Row 116 (docs/ops/2026-08-30-row116-production-logging.md): cycle 134 could
 * not tell WHY the Launch button did nothing, because nothing recorded that a
 * server action had even been invoked, let alone that it threw. `onRequestError`
 * in `src/instrumentation.ts` is the fix already wired for that — Next.js calls
 * it for Server Component, Route Handler AND Server Action errors alike
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`,
 * `context.routeType: 'action'`) — but nothing had ever proven it actually
 * reaches Sentry, carrying enough to say WHICH route and client, and carrying
 * nothing a prospect wrote.
 *
 * A syntactically valid DSN pointing at a host that does not exist, exactly
 * like `sentry-config-wiring.test.ts` — nothing here should reach the network,
 * `client.on("beforeSendEvent", ...)` intercepts before the transport does.
 */
process.env.NEXT_PUBLIC_SENTRY_DSN =
  "https://0000000000000000000000000000000@o0.ingest.invalid/0";

describe("an unhandled server action error reaches Sentry with route context and no personal data", () => {
  afterAll(async () => {
    const Sentry = await import("@sentry/nextjs");
    await Sentry.close();
  });

  it("records the error, the route, and the client-identifying path — and nothing a prospect wrote", async () => {
    await import("../sentry.server.config");
    const Sentry = await import("@sentry/nextjs");
    const { onRequestError } = await import("./instrumentation");

    const client = Sentry.getClient();
    expect(client, "Sentry.init did not produce a client").toBeDefined();

    let captured: Record<string, unknown> | undefined;
    client!.on("beforeSendEvent", (event) => {
      captured = event as unknown as Record<string, unknown>;
    });

    // Realistic shape: the error itself never embeds prospect content (nothing
    // in this codebase constructs one that way — the risk this test actually
    // guards is the REQUEST the SDK sees alongside it, which real traffic on
    // this route carries a live session cookie and Graph/Google bearer token
    // on, per `sentry-data-collection.ts`'s own reasoning for `httpHeaders: false`.
    const actionError = new Error("Mailbox send quota exceeded for this workspace");

    await onRequestError(
      Object.assign(actionError, { digest: "test-digest-1" }),
      {
        path: "/clients/opensdoors/sequences/launch",
        method: "POST",
        headers: {
          cookie: "authjs.session-token=super-secret-session-value",
          authorization: "Bearer should-never-appear",
        },
      },
      {
        routerKind: "App Router",
        routePath: "/clients/[slug]/sequences/[id]/launch",
        routeType: "action",
      },
    );

    await Sentry.flush(2000);

    expect(captured, "no event was captured — the error was not recorded at all").toBeDefined();

    const serialised = JSON.stringify(captured);

    // Recorded: enough to say which route, and — via the client-scoped URL
    // path this app puts every route under — which client.
    expect(serialised).toContain("/clients/opensdoors/sequences/launch");
    expect((captured as Record<string, unknown>).contexts).toMatchObject({
      nextjs: { route_type: "action", router_path: "/clients/[slug]/sequences/[id]/launch" },
    });

    // Not recorded, ever: the session cookie / bearer token this route's real
    // requests actually carry — `httpHeaders: false` in
    // `sentry-data-collection.ts` is what this proves is actually load-bearing,
    // not just declared.
    expect(serialised).not.toContain("super-secret-session-value");
    expect(serialised).not.toContain("should-never-appear");
    expect((captured as Record<string, unknown>).user).toBeUndefined();
  });
});
