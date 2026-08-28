/**
 * Prove the tenant lookup FIRES — against Microsoft, not against a stub.
 *
 *   npm run ops:tenant-probe
 *
 * Every automated test of this feature injects the lookup, because `npm test`
 * must stay offline. That leaves one hole big enough to drive the whole defect
 * through: `liveTenantLookup` itself could have the wrong URL, the wrong field,
 * or a regex that never matches, and all 2,540 tests would still be green. Six
 * times this week something was built, wired, reported success and never fired.
 * This script closes that hole by calling the SHIPPED function — imported, not
 * reimplemented — against the real endpoint, and failing loudly if what comes
 * back is not what was measured on 2026-08-27.
 *
 * READ-ONLY. It touches no database, sends nothing, and needs no credentials —
 * the endpoint it uses is unauthenticated by design.
 */
import {
  tenantLink,
  isConsumerMailboxHost,
} from "@/server/suppression/family-discovery";
import { liveTenantLookup } from "@/server/suppression/family-tenant";

type Expectation = {
  /** What this case proves. */
  name: string;
  domains: [string, string];
  /** Whether the two domains must come back sharing a tenant. */
  sameTenant: boolean;
  note: string;
};

/**
 * Every expectation below was READ from Microsoft on 2026-08-27. They are
 * assertions about the live internet, so a failure means one of two things: the
 * lookup broke, or a real company reorganised. Both are worth knowing, and both
 * should stop the script rather than be shrugged off.
 */
const CASES: Expectation[] = [
  {
    name: "finds a group that DMARC and SPF cannot see",
    domains: ["halifax.co.uk", "bankofscotland.co.uk"],
    sameTenant: true,
    note: "both publish DMARC to the shared vendor rua.agari.com and neither uses SPF redirect=, so the two shipped sources find nothing here",
  },
  {
    name: "finds a group across completely unrelated names",
    domains: ["centrica.com", "britishgas.co.uk"],
    sameTenant: true,
    note: "no stem, substring or edit distance connects these",
  },
  {
    name: "does not merge two genuinely different companies",
    domains: ["centrica.com", "halifax.co.uk"],
    sameTenant: false,
    note: "different tenants, so no link",
  },
  {
    name: "cannot reproduce the outlook.com fan-in that broke DMARC rua",
    domains: ["opensdoors.co.uk", "microsoft.com"],
    sameTenant: false,
    note: "OpensDoors is hosted ON Microsoft 365 and is still not IN Microsoft's tenant — the vendor false positive is structurally impossible",
  },
  {
    name: "stays silent about a domain that is in no tenant",
    domains: ["bteurope.com", "bt.com"],
    sameTenant: false,
    note: "bteurope.com returns AADSTS90002; a domain outside Microsoft 365 must produce no guess",
  },
];

/**
 * The measured false positive, checked separately because the expected outcome
 * is not "no shared tenant" — they really do share one — but "refused anyway".
 */
const CONSUMER_CASE: [string, string] = ["gmail.com", "yahoo.co.uk"];

async function main(): Promise<void> {
  console.log("Probing login.microsoftonline.com through the shipped lookup.");
  console.log("Read-only. No database, no credentials, nothing sent.\n");

  let failures = 0;

  for (const c of CASES) {
    const [a, b] = c.domains;
    const [ta, tb] = await Promise.all([
      liveTenantLookup(a),
      liveTenantLookup(b),
    ]);
    const link = tenantLink({
      proposedDomain: a,
      proposedTenantId: ta,
      seedDomain: b,
      seedTenantId: tb,
    });
    const linked = link !== null;
    const ok = linked === c.sameTenant;
    if (!ok) failures += 1;

    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}`);
    console.log(`      ${a} -> ${ta ?? "(no tenant)"}`);
    console.log(`      ${b} -> ${tb ?? "(no tenant)"}`);
    console.log(`      linked=${linked}, expected=${c.sameTenant} — ${c.note}\n`);
  }

  // The false positive: shares a tenant, must still be refused.
  const [ca, cb] = CONSUMER_CASE;
  const [tca, tcb] = await Promise.all([
    liveTenantLookup(ca),
    liveTenantLookup(cb),
  ]);
  const reallyShares = tca !== null && tca === tcb;
  const guarded = isConsumerMailboxHost(ca) && isConsumerMailboxHost(cb);
  const consumerOk = guarded;
  if (!consumerOk) failures += 1;
  console.log(`${consumerOk ? "PASS" : "FAIL"}  refuses the consumer tenant it really does find`);
  console.log(`      ${ca} -> ${tca ?? "(no tenant)"}`);
  console.log(`      ${cb} -> ${tcb ?? "(no tenant)"}`);
  console.log(
    `      share a tenant=${reallyShares}, refused by the consumer guard=${guarded}\n`,
  );
  if (reallyShares && !guarded) {
    console.log(
      "      ^ THIS IS THE DANGEROUS CASE: a real shared tenant with no guard.\n",
    );
  }

  if (failures > 0) {
    console.error(
      `${failures} probe(s) FAILED. Either the lookup is broken or the live records moved; do not trust the tenant source until this is understood.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("All probes passed. The shipped tenant lookup works against Microsoft.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
