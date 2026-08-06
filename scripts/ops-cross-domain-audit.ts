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

/** Hosts that are normal in a business signature and carry their own reputation. */
const WELL_KNOWN_HOSTS = new Set([
  "linkedin.com",
  "calendly.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "google.com",
  "microsoft.com",
  "office.com",
]);

/** Multi-part public suffixes we care about, so bt.co.uk resolves to bt.co.uk. */
const MULTI_PART_SUFFIXES = [
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.za", "com.br", "co.jp", "co.in",
];

/**
 * Registrable domain (eTLD+1), using a short suffix list rather than the full
 * Public Suffix List. Adequate for this audit; the production DNC matcher
 * should use the real PSL.
 */
function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIXES.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

type Found = { url: string; host: string; isImage: boolean; where: string };

/** Pull every http(s) URL out of HTML or plain text, noting image contexts. */
function extractUrls(content: string | null | undefined, where: string): Found[] {
  if (!content) return [];
  const out: Found[] = [];
  const seen = new Set<string>();

  // src="..." / href="..." (quoted or single-quoted), plus bare URLs in text.
  const attrRe = /\b(src|href)\s*=\s*["']([^"']+)["']/gi;
  const bareRe = /https?:\/\/[^\s<>"')]+/gi;

  // Dedupe by URL alone, NOT by URL+isImage. The attribute pass and the bare-URL
  // pass both match the same `src="…"` value, so keying on isImage would report
  // every logo twice — once as an image and once as a link — and inflate the
  // counts. First match wins, and the attribute pass runs first so a src is
  // correctly classified as an image.
  const push = (raw: string, isImage: boolean) => {
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) return;
    const key = `${where}|${url}`;
    if (seen.has(key)) return;
    seen.add(key);
    try {
      out.push({ url, host: new URL(url).hostname, isImage, where });
    } catch {
      /* unparseable — ignore */
    }
  };

  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(content)) !== null) {
    push(m[2], m[1].toLowerCase() === "src");
  }
  while ((m = bareRe.exec(content)) !== null) {
    push(m[0], false);
  }
  return out;
}

function severity(f: Found, ownDomains: Set<string>, appHosts: Set<string>): "HIGH" | "MEDIUM" | "LOW" | null {
  const reg = registrableDomain(f.host);
  if (ownDomains.has(reg)) return null; // aligned — this is good, not a problem
  if (appHosts.has(reg)) return "HIGH"; // our own app domain in a customer's email
  if (f.isImage) return "HIGH"; // remote image on a foreign host
  if (WELL_KNOWN_HOSTS.has(reg)) return "LOW";
  return "MEDIUM";
}

async function main(): Promise<void> {
  // Hosts belonging to the OpensDoors platform itself.
  const appHosts = new Set<string>();
  for (const raw of [
    process.env.AUTH_URL,
    process.env.INTERNAL_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]) {
    if (!raw?.trim()) continue;
    try {
      appHosts.add(registrableDomain(new URL(raw.trim()).hostname));
    } catch {
      /* ignore */
    }
  }
  appHosts.add("azurewebsites.net");

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
    // The client's own domains: every sending mailbox, plus website + link domain.
    const own = new Set<string>();
    for (const m of c.mailboxIdentities) {
      const at = m.email.indexOf("@");
      if (at > 0) own.add(registrableDomain(m.email.slice(at + 1)));
    }
    for (const raw of [c.website, c.outreachLinkDomain]) {
      if (!raw?.trim()) continue;
      const v = raw.trim();
      try {
        own.add(registrableDomain(new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname));
      } catch {
        /* ignore */
      }
    }

    const found: Found[] = [];
    for (const m of c.mailboxIdentities) {
      found.push(...extractUrls(m.senderSignatureHtml, `signature HTML (${m.email})`));
      found.push(...extractUrls(m.senderSignatureText, `signature text (${m.email})`));
    }
    for (const t of c.emailTemplates) {
      found.push(...extractUrls(t.subject, `template subject "${t.name}"`));
      found.push(...extractUrls(t.content, `template body "${t.name}"`));
    }
    if (c.logoUrl?.trim()) {
      found.push(...extractUrls(`<img src="${c.logoUrl.trim()}">`, "Client.logoUrl"));
    }

    const flagged = found
      .map((f) => ({ f, sev: severity(f, own, appHosts) }))
      .filter((x): x is { f: Found; sev: "HIGH" | "MEDIUM" | "LOW" } => x.sev !== null);

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
  console.log(`HIGH (image on foreign host, or our app domain):  ${totalHigh}`);
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
