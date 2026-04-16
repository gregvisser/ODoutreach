/**
 * Validates presence of env vars (names only — never prints secret values).
 * Usage:
 *   npx tsx scripts/preflight-staging-env.ts           # core + local-oriented warnings
 *   npx tsx scripts/preflight-staging-env.ts --staging # stricter staging deploy checks
 */
import "dotenv/config";

function empty(name: string): boolean {
  const v = process.env[name];
  return v === undefined || String(v).trim() === "";
}

function main() {
  const staging = process.argv.includes("--staging");
  const errors: string[] = [];
  const warnings: string[] = [];

  const core = [
    "DATABASE_URL",
    "AUTH_SECRET",
    "AUTH_MICROSOFT_ENTRA_ID_ID",
    "AUTH_MICROSOFT_ENTRA_ID_SECRET",
  ] as const;
  for (const k of core) {
    if (empty(k)) errors.push(`Missing required: ${k}`);
  }

  if (empty("AUTH_MICROSOFT_ENTRA_ID_ISSUER")) {
    warnings.push(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER unset — Entra will use common endpoint (any Microsoft account). For single-tenant staff-only, set issuer to https://login.microsoftonline.com/<tenant-id>/v2.0/",
    );
  }

  if (empty("AUTH_URL")) {
    warnings.push(
      "AUTH_URL unset — set to your app origin (e.g. http://localhost:3000) so OAuth redirects match your Entra redirect URIs.",
    );
  }

  if (empty("STAFF_EMAIL_DOMAINS")) {
    warnings.push(
      "STAFF_EMAIL_DOMAINS unset — no email-domain filter (OK for quick UI dev). For realistic Entra verification, set e.g. bidlow.co.uk,opensdoors.co.uk",
    );
  }

  if (staging) {
    if (empty("AUTH_URL")) {
      errors.push(
        "AUTH_URL required for staging — set to public https origin (e.g. https://your-app.azurewebsites.net); must match Entra redirect URI host",
      );
    }
    if (empty("PROCESS_QUEUE_SECRET")) {
      errors.push("Missing required for staging: PROCESS_QUEUE_SECRET (queue drain + queue-status)");
    }
    if (process.env.AUTOPROCESS_OUTBOUND_QUEUE === "true") {
      errors.push(
        "AUTOPROCESS_OUTBOUND_QUEUE must not be \"true\" for staging — use cron/worker (production also ignores in-process autoprocess).",
      );
    }
    const provider = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase();
    if (provider === "resend") {
      if (empty("RESEND_API_KEY")) errors.push("Missing: RESEND_API_KEY (EMAIL_PROVIDER=resend)");
      if (empty("RESEND_WEBHOOK_SECRET")) {
        warnings.push(
          "RESEND_WEBHOOK_SECRET empty — real delivery/bounce webhooks will not verify (set for end-to-end Resend proof).",
        );
      }
    }
    if (!empty("EMAIL_PROVIDER") && (process.env.EMAIL_PROVIDER ?? "").toLowerCase() === "mock") {
      warnings.push(
        "EMAIL_PROVIDER=mock — fine for wiring checks; switch to resend for real provider smoke on staging.",
      );
    }
  } else {
    if (process.env.AUTOPROCESS_OUTBOUND_QUEUE === "true" && process.env.NODE_ENV === "production") {
      warnings.push(
        "AUTOPROCESS_OUTBOUND_QUEUE=true with NODE_ENV=production — in-process autoprocess is ignored; configure worker/cron.",
      );
    }
  }

  console.log(staging ? "[preflight] profile: staging\n" : "[preflight] profile: local/dev\n");

  for (const w of warnings) console.warn(`⚠ ${w}`);
  for (const e of errors) console.error(`✖ ${e}`);

  if (errors.length > 0) {
    console.error(`\nExit 1 — ${errors.length} error(s). Fix .env or pass criteria.`);
    process.exit(1);
  }

  console.log("\nOK — required keys present for selected profile (values not shown).");
  console.log(
    "This script cannot verify: DB connectivity, Entra app registration, Resend domain verification, or webhook reachability from the public internet.",
  );
}

main();
