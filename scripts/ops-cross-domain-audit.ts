/**
 * Cross-domain link audit (READ-ONLY).
 *
 * The 2026 quarantine incident was caused by link misalignment: an email whose
 * `From:` is `@customerdomain.com` while its links point somewhere else matches
 * the classic phishing pattern, and secure email gateways score it heavily.
 *
 * The tracking pixel and the unsubscribe link are handled in code. This script
 * covers everything else — the DATA that ends up inside an outgoing email and
 * can carry a foreign host:
 *
 *   * `ClientMailboxIdentity.senderSignatureHtml` / `senderSignatureText`
 *     — stored signature markup, sent verbatim. The highest-risk surface,
 *       because it may contain images hosted anywhere.
 *   * `ClientEmailTemplate` subject/body — operator-authored, may contain any link.
 *   * `Client.logoUrl` — woven into branded signatures as an <img src>.
 *   * `Client.website` — linked from branded signatures.
 *
 * Each URL's host is compared against that client's OWN domains, derived from
 * its sending mailbox addresses plus its configured website and link domain.
 *
 * Severity:
 *   HIGH   — a remote IMAGE on a foreign host (loads on open, behaves like a
 *            tracking pixel), or ANY reference to the OpensDoors app domain.
 *   MEDIUM — a link to a foreign host that is not a well-known professional
 *            destination. Often legitimate (booking pages, landing pages) but
 *            it is a misalignment signal and should be a deliberate choice.
 *   LOW    — well-known professional domains (LinkedIn, Calendly, etc.).
 *
 * This script ONLY reads. It changes nothing.
 *
 *   Run:  DATABASE_URL=... npx tsx scripts/ops-cross-domain-audit.ts
 */
import { prisma } from "@/lib/db";
import {
  appDomainsFromEnv,
  extractLinks,
  ownDomainsFor,
  severityForLink,
  type ExtractedLink,
  type LinkSeverity,
} from "@/lib/clients/signature-link-alignment";

async function main(): Promise<void> {
  const appDomains = appDomainsFromEnv();
  // Refuse to run with app-domain detection silently off.
  //
  // `appDomainsFromEnv()` seeds only `azurewebsites.net` when none of AUTH_URL /
  // INTERNAL_APP_URL / NEXT_PUBLIC_APP_URL is set. The FIRST production run of
  // this audit on 2026-08-24 was made with DATABASE_URL exported but AUTH_URL
  // not, so the one severity that blocks — our own domain in a customer's email
  // — could not fire at all, and the run printed a clean bill of health on that
  // axis. A check that cannot run is a failure, not a pass.
  if (appDomains.size <= 1) {
    console.error(
      "REFUSING TO RUN: no app URL in the environment (AUTH_URL / INTERNAL_APP_URL / NEXT_PUBLIC_APP_URL).",
    );
    console.error(
      "Without one, a link to the OpensDoors app domain cannot be detected and this audit would report a false clean.",
    );
    process.exitCode = 1;
    return;
  }

  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      website: true,
      logoUrl: true,
      outreachLinkDomain: true,
      mailboxIdentities: {
        select: { email: true, senderSignatureHtml: true, senderSignatureText: true },
      },
      emailTemplates: {
        select: { id: true, name: true, subject: true, content: true },
      },
    },
    orderBy: { name: "asc" },
  });

  let totalHigh = 0;
  let totalMedium = 0;
  let totalLow = 0;
  let clientsWithFindings = 0;

  for (const c of clients) {
    const own = ownDomainsFor({
      mailboxEmails: c.mailboxIdentities.map((m) => m.email),
      website: c.website,
      outreachLinkDomain: c.outreachLinkDomain,
    });
    const ctx = { ownDomains: own, appDomains };

    const found: ExtractedLink[] = [];
    for (const m of c.mailboxIdentities) {
      found.push(...extractLinks(m.senderSignatureHtml, `signature HTML (${m.email})`));
      found.push(...extractLinks(m.senderSignatureText, `signature text (${m.email})`));
    }
    for (const t of c.emailTemplates) {
      found.push(...extractLinks(t.subject, `template subject "${t.name}"`));
      found.push(...extractLinks(t.content, `template body "${t.name}"`));
    }
    if (c.logoUrl?.trim()) {
      found.push(...extractLinks(`<img src="${c.logoUrl.trim()}">`, "Client.logoUrl"));
    }

    const flagged = found
      .map((f) => ({ f, sev: severityForLink(f, ctx) }))
      .filter((x): x is { f: ExtractedLink; sev: LinkSeverity } => x.sev !== null);

    if (flagged.length === 0) continue;
    clientsWithFindings += 1;

    console.log(`\n=== ${c.name} ===`);
    console.log(`own domains: ${[...own].sort().join(", ") || "(none resolved)"}`);
    for (const sev of ["HIGH", "MEDIUM", "LOW"] as const) {
      for (const { f } of flagged.filter((x) => x.sev === sev)) {
        if (sev === "HIGH") totalHigh += 1;
        else if (sev === "MEDIUM") totalMedium += 1;
        else totalLow += 1;
        const kind = f.isImage ? "IMG " : "LINK";
        console.log(`  [${sev}] ${kind} ${f.host}  — ${f.where}`);
        console.log(`         ${f.url.slice(0, 120)}`);
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Clients scanned:        ${clients.length}`);
  console.log(`Clients with findings:  ${clientsWithFindings}`);
  console.log(`HIGH (our own app domain in a customer's email):   ${totalHigh}`);
  console.log(`MEDIUM (foreign link, not well-known):            ${totalMedium}`);
  console.log(`LOW (well-known professional domain):             ${totalLow}`);
  if (totalHigh === 0 && totalMedium === 0) {
    console.log("\nNo meaningful cross-domain exposure in signatures or templates.");
  }
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
