/**
 * Hits public /api/health and optional authenticated queue-status.
 * Does not print secrets. Usage:
 *   npx tsx scripts/verify-deployment-health.ts
 *   npx tsx scripts/verify-deployment-health.ts https://staging.example.com
 *
 * Uses PROCESS_QUEUE_SECRET from env for queue-status when set.
 */
import "dotenv/config";

async function main() {
  const baseArg = process.argv[2]?.trim();
  const base =
    baseArg ||
    process.env.DEPLOYMENT_BASE_URL?.trim() ||
    process.env.INTERNAL_APP_URL?.trim() ||
    "http://localhost:3000";
  const origin = base.replace(/\/$/, "");

  const healthUrl = `${origin}/api/health`;
  console.log(`GET ${healthUrl}`);

  const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(15000) });
  const healthText = await healthRes.text();
  let healthJson: unknown;
  try {
    healthJson = JSON.parse(healthText);
  } catch {
    healthJson = healthText;
  }
  console.log(JSON.stringify(healthJson, null, 2));

  if (!healthRes.ok) {
    console.error(`Health check failed: HTTP ${healthRes.status}`);
    process.exit(1);
  }

  const secret = process.env.PROCESS_QUEUE_SECRET?.trim();
  if (secret) {
    const statusUrl = `${origin}/api/internal/outbound/queue-status`;
    console.log(`\nGET ${statusUrl} (authenticated)`);
    const stRes = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15000),
    });
    const stText = await stRes.text();
    let stJson: unknown;
    try {
      stJson = JSON.parse(stText);
    } catch {
      stJson = stText;
    }
    console.log(JSON.stringify(stJson, null, 2));
    if (!stRes.ok) {
      console.error(`queue-status failed: HTTP ${stRes.status}`);
      process.exit(1);
    }
  } else {
    console.log(
      "\nPROCESS_QUEUE_SECRET not set — skipping queue-status (set secret to verify authenticated metrics).",
    );
  }

  console.log("\nOK — endpoints reachable.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
