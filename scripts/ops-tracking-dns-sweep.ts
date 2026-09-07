/**
 * Re-check every tracked client's DNS, and switch OFF the ones that regressed.
 *
 * Row 41: "Re-check on a schedule and DISABLE AUTOMATICALLY if it regresses."
 *
 * Runs against PRODUCTION data from a scheduled GitHub Action, deliberately not
 * as an HTTP route: this needs no request, no session and no public surface, and
 * the workflow already has a database secret. Same shape as
 * `ops-cross-domain-audit.ts`.
 *
 * IT REFUSES TO REPORT A CLEAN SWEEP AGAINST NO DATABASE. A job that runs on an
 * empty database, finds nothing wrong and exits 0 is a false green, and this
 * estate has a named history of exactly that — six recorded cases of something
 * built, wired, reporting success and never actually firing. So: no
 * DATABASE_URL, non-zero exit, loud message.
 *
 * Note what this job is NOT load-bearing for. If it stops running entirely,
 * tracking still closes itself: `decideClientOpenTracking` expires any
 * verification older than TRACKING_DNS_MAX_AGE_DAYS at dispatch time. This
 * sweep makes the state FRESH; it is not what makes the state SAFE.
 *
 * Sends nothing. Touches only the tracking columns of clients that already have
 * tracking switched on.
 */

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error(
      "DATABASE_URL is not configured — refusing to report a clean tracking-DNS sweep against no database.",
    );
    process.exit(1);
  }

  // Validate configuration before importing the database module. The npm
  // command explicitly selects the server-only package's react-server export.
  const {
    countClientsForTrackingDnsSweep,
    liveTrackingDnsResolver,
    loadTrackedClientsForDnsSweep,
    sweepTrackingDnsRegressions,
    disableTrackingForDnsRegression,
    persistTrackingDnsCheck,
  } = await import("../src/server/clients/tracking-dns-sweep-entry");

  const currentClients = await countClientsForTrackingDnsSweep();
  if (currentClients === 0) {
    console.error("No current clients found — refusing to report a clean tracking-DNS sweep against an empty database.");
    process.exit(1);
  }
  const clients = await loadTrackedClientsForDnsSweep();
  const now = new Date();

  console.log(
    `Tracking-DNS sweep starting: ${currentClients} current client(s) in the database; ${String(clients.length)} currently have open tracking ON.`,
  );

  const result = await sweepTrackingDnsRegressions({
    clients,
    resolver: liveTrackingDnsResolver,
    now,
    disableTracking: async (input) => {
      console.error(
        `Disabling open tracking for a client — failed checks: ${input.failedLabels.join(", ")}`,
      );
      // Workflow logs are public. Client identities and DNS details belong in
      // the application audit record written by this operation.
      await disableTrackingForDnsRegression(input);
    },
    recordCheck: persistTrackingDnsCheck,
  });

  console.log(
    `Tracking-DNS sweep finished: checked ${String(result.checked)}, disabled ${String(result.disabled.length)}.`,
  );

  // A regression is not a job failure — the system handled it correctly by
  // switching that client off. But it must be VISIBLE in the run summary rather
  // than buried in a green tick, because somebody has to go and talk to that
  // customer's IT department.
  if (result.disabled.length > 0) {
    console.error(
      `::warning::Open tracking was switched OFF for ${String(result.disabled.length)} client(s). See the application audit log for affected clients and DNS details.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error("Tracking-DNS sweep FAILED:", e instanceof Error ? e.name : "Unknown error");
    process.exit(1);
  });
