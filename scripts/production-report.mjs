#!/usr/bin/env node
/**
 * PRODUCTION REPORT — two numbers, in plain English.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS SCRIPT IS READ-ONLY. IT CANNOT CHANGE ANYTHING.
 *
 * It is pointed at a LIVE CLIENT DATABASE, by a non-technical operator, so that
 * is not a promise in a comment — it is enforced three times over:
 *
 *   1. Every statement is checked by `assertReadOnly` before it is sent.
 *      Anything that is not a single SELECT — no INSERT, UPDATE, DELETE, DROP,
 *      ALTER, TRUNCATE, CREATE, GRANT, and no second statement after a
 *      semicolon — throws before the database is touched. That function is
 *      exported and unit-tested in src/lib/production-report-guard.test.ts,
 *      which imports THIS function rather than a copy of it.
 *   2. The session is opened with `default_transaction_read_only=on`.
 *   3. The queries run inside an explicit `BEGIN READ ONLY` transaction, so
 *      even a statement that somehow slipped past (1) would be refused by
 *      Postgres itself.
 *
 * It never prints the connection string and never writes it anywhere. It uses
 * `pg` directly rather than the Prisma client so it needs no code generation,
 * no build step and no configured application environment — you can run it on
 * a laptop with nothing set up.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHERE TO GET THE CONNECTION STRING
 *   Azure Portal → App Services → app-opensdoors-outreach-prod
 *     → Settings → Environment variables (Application settings)
 *     → copy the value of DATABASE_URL
 *
 * HOW TO RUN IT — one line, from the repo root:
 *
 *   PRODUCTION_DATABASE_URL="paste-it-here" node scripts/production-report.mjs
 *
 * Windows PowerShell:
 *
 *   $env:PRODUCTION_DATABASE_URL="paste-it-here"; node scripts/production-report.mjs
 *
 * Afterwards, close the terminal (or run `Remove-Item Env:PRODUCTION_DATABASE_URL`)
 * so the credential is not left sitting in your shell for the rest of the day.
 */

import pg from "pg";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Read-only enforcement. Exported so it is tested for real, not as a copy.
// ---------------------------------------------------------------------------

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|merge|refresh|reindex|vacuum|set|comment)\b/i;

export function assertReadOnly(sql, name) {
  const stripped = String(sql).replace(/--[^\n]*/g, "").trim();
  if (!/^select\b/i.test(stripped)) {
    throw new Error(`REFUSED: query "${name}" does not start with SELECT.`);
  }
  const withoutTrailing = stripped.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    throw new Error(`REFUSED: query "${name}" contains more than one statement.`);
  }
  if (FORBIDDEN.test(withoutTrailing)) {
    throw new Error(`REFUSED: query "${name}" contains a write or DDL keyword.`);
  }
  return withoutTrailing;
}

// ---------------------------------------------------------------------------
// The queries. Every one a single SELECT.
// ---------------------------------------------------------------------------

export const QUERIES = {
  sendTotals: `
    SELECT
      count(*) FILTER (WHERE "sentAt" IS NOT NULL) AS sent,
      count(*) FILTER (WHERE status = 'BOUNCED')   AS marked_bounced,
      min("sentAt")                                AS first_send,
      max("sentAt")                                AS last_send
    FROM "OutboundEmail"
  `,
  // Suppression rows with no source come from the bounce / unsubscribe paths
  // rather than a sheet sync — this is where a detected NDR actually lands.
  suppressionEvidence: `
    SELECT count(*) AS rows_without_source
    FROM "SuppressedEmail"
    WHERE "sourceId" IS NULL
  `,
  ndrAudit: `
    SELECT count(*) AS ndr_events
    FROM "AuditLog"
    WHERE "entityType" = 'SuppressedEmail'
      AND metadata::text ILIKE '%mailbox_sync_ndr%'
  `,
  mailboxes: `
    SELECT
      m.email AS email,
      COALESCE(m."dailySendCap", 30) AS daily_cap,
      count(DISTINCT date(o."sentAt" AT TIME ZONE 'UTC')) AS sending_days,
      floor(EXTRACT(EPOCH FROM (now() - COALESCE(m."connectedAt", m."createdAt"))) / 86400)::int AS age_days
    FROM "ClientMailboxIdentity" m
    LEFT JOIN "OutboundEmail" o
      ON o."mailboxIdentityId" = m.id AND o."sentAt" IS NOT NULL
    WHERE m."isActive" = true
    GROUP BY m.id, m.email, m."dailySendCap", m."connectedAt", m."createdAt"
    ORDER BY sending_days ASC, m.email ASC
  `,
};

// Mirrors src/lib/mailboxes/mailbox-warmup.ts. Duplicated on purpose: this
// script must run standalone against production with no build step.
const WARMUP_BASE_CAP = 5;
const WARMUP_STEP = 5;
const WARMUP_STEP_DAYS = 5;

export function rampCap(steadyCap, steps) {
  const steady = Math.max(1, steadyCap);
  const s = Math.max(0, Math.floor(steps));
  return Math.max(
    1,
    Math.min(steady, WARMUP_BASE_CAP + WARMUP_STEP * Math.floor(s / WARMUP_STEP_DAYS)),
  );
}

const n = (v) => (typeof v === "bigint" ? Number(v) : Number(v ?? 0));
const pct = (a, b) => (b === 0 ? "n/a" : `${((a / b) * 100).toFixed(2)}%`);
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

export function renderReport({ totals, evidence, ndr, mailboxes }) {
  const t = totals ?? {};
  const sent = n(t.sent);
  const marked = n(t.marked_bounced);
  const noSource = n(evidence?.rows_without_source);
  const ndrEvents = n(ndr?.ndr_events);

  const L = [];
  L.push("");
  L.push("==========================================================");
  L.push("  ODoutreach — production report");
  L.push(`  ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
  L.push("==========================================================");

  L.push("");
  L.push("A. BOUNCES");
  L.push("");
  L.push(`  Emails actually sent:   ${sent.toLocaleString()}`);
  L.push(`  Period:                 ${day(t.first_send)} to ${day(t.last_send)}`);
  L.push(`  Marked BOUNCED:         ${marked.toLocaleString()}  (${pct(marked, sent)})`);
  L.push("");
  L.push("  WHAT THAT NUMBER DOES AND DOES NOT INCLUDE — read this before");
  L.push("  treating it as your bounce rate:");
  L.push("");
  L.push('  It counts emails whose status is "BOUNCED". Only the legacy ESP');
  L.push("  webhook path ever writes that status. Live sending goes through the");
  L.push("  client's own mailbox, and THAT path detects a bounce and suppresses");
  L.push("  the address but never marks the email row. So the percentage above");
  L.push("  is a floor, not the truth.");
  L.push("");
  L.push("  Two better signals, from where a detected bounce actually lands:");
  L.push("");
  L.push(`    Addresses suppressed outside a sheet sync:  ${noSource.toLocaleString()}`);
  L.push(`    Audit entries from mailbox NDR detection:   ${ndrEvents.toLocaleString()}`);
  L.push("");
  if (ndrEvents > 0) {
    L.push(`  >>> NDR detection HAS fired ${ndrEvents.toLocaleString()} time(s). Bounces are being`);
    L.push("      caught and blocked — they are simply invisible to the report.");
    L.push(`      A truer bounce rate is roughly ${pct(ndrEvents, sent)} of sends.`);
    if (sent > 0 && ndrEvents / sent > 0.02) {
      L.push("");
      L.push("      *** THAT IS ABOVE 2%. Do not increase sending volume until");
      L.push("      *** someone has looked at why.");
    }
  } else if (noSource > 0) {
    L.push(`  >>> ${noSource.toLocaleString()} address(es) are suppressed outside a sheet sync, but no`);
    L.push("      NDR audit entries exist. Those are most likely unsubscribes or");
    L.push("      manual blocks rather than bounces.");
  } else {
    L.push("  >>> No evidence of ANY detected bounce, by any route. Either the");
    L.push("      lists really are clean, or NDRs are not reaching the mailbox");
    L.push("      sync at all. This report cannot tell those apart — that needs");
    L.push("      someone to look in the mailbox.");
  }

  L.push("");
  L.push("");
  L.push("B. WARM-UP IMPACT, PER MAILBOX");
  L.push("");
  L.push("  The ramp used to count how long ago a mailbox was CONNECTED. It now");
  L.push("  counts days it has actually SENT on.");
  L.push("");
  const head = `  ${"mailbox".padEnd(38)}${"sent".padStart(6)}${"age".padStart(6)}${"old".padStart(6)}${"new".padStart(6)}   change`;
  L.push(head);
  L.push(`  ${"-".repeat(head.length - 2)}`);

  let drops = 0;
  let lowest = null;
  for (const m of mailboxes ?? []) {
    const cap = n(m.daily_cap);
    const sd = n(m.sending_days);
    const age = n(m.age_days);
    const oldCap = rampCap(cap, age);
    const newCap = rampCap(cap, sd);
    if (newCap < oldCap) {
      drops += 1;
      lowest = lowest === null ? newCap : Math.min(lowest, newCap);
    }
    const email = String(m.email ?? "").slice(0, 36);
    L.push(
      `  ${email.padEnd(38)}${String(sd).padStart(6)}${String(age).padStart(6)}` +
        `${String(oldCap).padStart(6)}${String(newCap).padStart(6)}   ` +
        (newCap === oldCap
          ? "no change"
          : newCap < oldCap
            ? `DROPS to ${newCap}/day`
            : `rises to ${newCap}/day`),
    );
  }

  L.push("");
  const count = (mailboxes ?? []).length;
  if (count === 0) {
    L.push("  No active mailboxes found.");
  } else if (drops === 0) {
    L.push(`  >>> No mailbox changes. All ${count} have enough sending history that`);
    L.push("      the corrected ramp gives them the same allowance as before.");
  } else {
    L.push(`  >>> ${drops} of ${count} mailbox(es) drop, the lowest to ${lowest}/day.`);
    L.push("      Those are mailboxes connected a while ago that have not actually");
    L.push("      been sending. Under the old rule they would have started at full");
    L.push("      volume on their first send — which is what the fix prevents.");
  }
  L.push("");
  L.push("==========================================================");
  L.push("  Read-only. Nothing in your database was changed.");
  L.push("==========================================================");
  L.push("");
  return L.join("\n");
}

async function main() {
  const url = process.env.PRODUCTION_DATABASE_URL;
  if (!url) {
    console.error(
      [
        "",
        "  PRODUCTION_DATABASE_URL is not set, so there is nothing to report on.",
        "",
        "  Get it from: Azure Portal -> App Services -> app-opensdoors-outreach-prod",
        "               -> Settings -> Environment variables -> DATABASE_URL",
        "",
        '  Then run:   PRODUCTION_DATABASE_URL="paste-it-here" node scripts/production-report.mjs',
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  for (const [name, sql] of Object.entries(QUERIES)) assertReadOnly(sql, name);

  const client = new pg.Client({
    connectionString: url,
    // Belt: the whole session refuses writes.
    options: "-c default_transaction_read_only=on",
  });

  await client.connect();
  try {
    // Braces: and so does this transaction, explicitly.
    await client.query("BEGIN READ ONLY");
    // Sequential, not Promise.all: a single pg Client cannot run queries
    // concurrently (it warns, and pg 9 will remove the behaviour). Four small
    // reads against one database — there is nothing to parallelise anyway.
    const totals = await client.query(assertReadOnly(QUERIES.sendTotals, "sendTotals"));
    const evidence = await client.query(
      assertReadOnly(QUERIES.suppressionEvidence, "suppressionEvidence"),
    );
    const ndr = await client.query(assertReadOnly(QUERIES.ndrAudit, "ndrAudit"));
    const mailboxes = await client.query(assertReadOnly(QUERIES.mailboxes, "mailboxes"));
    await client.query("COMMIT");

    console.log(
      renderReport({
        totals: totals.rows[0],
        evidence: evidence.rows[0],
        ndr: ndr.rows[0],
        mailboxes: mailboxes.rows,
      }),
    );
  } finally {
    await client.end();
  }
}

// Only run when executed directly, so the guard can be imported by tests.
// pathToFileURL rather than building the URL by hand: on Windows argv[1] is
// `C:\...` while import.meta.url is `file:///C:/...`, which never string-matched
// and silently produced no output at all.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    // Never let a connection string surface in an error message.
    const msg = String(e?.message ?? e).replace(
      /postgres(ql)?:\/\/[^\s"']+/gi,
      "[connection string hidden]",
    );
    console.error(`\n  Report failed: ${msg}\n`);
    process.exit(1);
  });
}
