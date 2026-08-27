# Related-domain detection: what was promised, what was built, what now exists

**Date:** 2026-08-27 · **Queue item 23** (31 August client commitments)
**Author:** relay cycle 34 · **Status:** mechanism built and proven; one decision left to Greg

---

## The complaint, and it was fair

The signed-off email to Sam and James said two things that were not true of the
system:

1. **"Near-certain matches are blocked automatically, weaker ones are flagged
   for the team."** What existed proposed everything and blocked nothing.
2. **"The strongest signal is companies sharing a Microsoft tenant, which we can
   verify directly."** That signal was not implemented. DMARC and SPF records
   were used instead.

Both criticisms were correct. This document records what was measured about it
and what has changed.

**Greg did not write that email — Claude did.** The gap is not his oversight.

---

## Was the weaker substitute actually weaker? Yes, badly — and this is measurable

The two shipped sources read a domain's DMARC `rua=` address and its SPF
`redirect=`. Here is what they see for three real corporate groups, read live on
2026-08-27:

| Group | DMARC `rua` points at | SPF `redirect=` | Shipped sources find the link? |
|---|---|---|---|
| Halifax / Bank of Scotland / Lloyds | `rua.agari.com` (a shared vendor) | none — uses `include:` | **No** |
| Centrica / British Gas | `vali.email` (a shared vendor) | none — uses `include:` | **No** |
| NatWest / RBS | `rua.netcraft.com` (a shared vendor) | none | **No** |

All three are the same organisation. The shipped detection finds **none of
them**, and would instead propose that Halifax belongs to *Agari*, a DMARC
reporting vendor.

The tenant signal finds **all three**:

| Domain | Microsoft tenant |
|---|---|
| `halifax.co.uk` | `3ded2960-214a-46ff-8cf4-611f125e2398` |
| `bankofscotland.co.uk` | `3ded2960-…` (same) |
| `lloydsbanking.com` | `3ded2960-…` (same) |
| `centrica.com` | `a603898f-7de2-45ba-b67d-d35fb519b2cf` |
| `britishgas.co.uk` | `a603898f-…` (same) |
| `natwest.com` | `7c917db0-71f2-438e-9554-388ffcab8764` |
| `rbs.co.uk` | `7c917db0-…` (same) |

Note that no name-matching rule could ever connect `rbs.co.uk` to
`natwest.com`. This is not inference — it is a fact each organisation asserted
to Microsoft about its own domains.

---

## Q1: Is tenant matching feasible against Graph?

**Against Graph specifically: not without a new standing permission — and it is
unnecessary.** Both routes were tested, not assumed.

| Route | Result |
|---|---|
| Graph `GET /v1.0/organization` → `verifiedDomains` | Answers "which domains are **ours**". Cannot see a prospect's tenant at all. Wrong tool. |
| Graph `GET /v1.0/tenantRelationships/findTenantInformationByDomainName(...)` | Does answer it. Returns **401** unauthenticated. Would require adding `CrossTenantInformation.ReadBasic.All` to the OpensDoors app registration plus admin consent. |
| **OpenID Connect discovery** — `login.microsoftonline.com/<domain>/v2.0/.well-known/openid-configuration` | **Works. No token, no consent, no new permission.** The `issuer` field carries the tenant GUID. |
| Autodiscover `GetFederationInformation` (would have listed a whole tenant's domains in one call) | **Dead.** Tested 2026-08-27: now echoes back only the domain you asked about. Microsoft closed tenant-domain enumeration. |

**This is implemented, using the third route.** The client should be told tenant
matching is in — done a simpler way that needs no extra permissions over their
data — not that the promise was dropped.

### Cost, measured not guessed

100 distinct real UK corporate domains, through the shipped function:

- **5ms per lookup at concurrency 16** (10ms at concurrency 8).
- Full sweep of the current universe (966 contact + 15,714 suppressed domains):
  **~80 seconds**. It fits inside the nightly job's request window.
- **90 of the 100 were in a Microsoft tenant.** This signal covers almost the
  whole universe, unlike SPF `redirect=`, which is rare.

---

## Q2: Can a near-certain match auto-block safely?

### The one real false positive, found by measuring

`gmail.com`, `hotmail.com`, `live.com` **and `yahoo.co.uk`** all return tenant
`9cd80435-793b-4f48-844b-6b3f37d1c1f3`. Four unrelated consumer mail providers
in one Microsoft tenant. Auto-blocking on a naive tenant match would, for a
client with any of those on their list, delete every personal address from their
universe in a single run.

The existing consumer-mailbox guard already catches all four by name, and there
is now a test pinning exactly that.

### What did *not* go wrong

- **The vendor false positive is structurally impossible.** `outlook.com`,
  `google.com` and `salesforce.com` each sit in their own tenant, distinct from
  every customer's. The 216-way `outlook.com` fan-in that forced the fan-in cap
  on the DMARC source cannot happen here. Verified: `opensdoors.co.uk` is hosted
  *on* Microsoft 365 and is still not *in* Microsoft's tenant.
- **Shared services do not collapse.** Every NHS trust checked
  (`gstt`, `uhs`, `mft`, `ouh`, `leedsth`) has its **own** tenant, and none
  shares `nhs.net`'s. The `nhs.net` problem that fan-in could not solve does not
  reproduce here.
- **It fails closed.** A domain in no tenant returns `AADSTS90002`, not a
  fallback. `bteurope.com` is one such domain — so this signal would *not* have
  caught the original `bt.com`/`bteurope.com` case. Recall is incomplete, and
  deliberately so.

### The gap I could not close, stated plainly

**The MSP case is unmeasured.** A small IT provider can put two unrelated
customers' domains into its own tenant. From the outside that is
indistinguishable from a corporate group. OpensDoors' universe is full of SMEs,
which is exactly where this shape lives.

**I could not measure it, because this environment has no route to the
production database.** Every measurement above is against the live internet and
a hand-picked sample of ~30 real domains, not against OpensDoors' 966 contact
domains. That is the single biggest hole in this assessment and it should not be
papered over.

### The verdict

**Auto-blocking is defensible, is built, is proven to work — and is shipped
OFF.**

It is defensible because the error is asymmetric. The irreversible action in
this product is *sending*; blocking prevents it. A wrong block costs a prospect
we could have emailed — visible, reversible, and undone with one click. A missed
block costs an email to a company the client explicitly asked us not to contact,
which is the exact harm they are paying us to prevent.

It is off because turning it on is **not a technical decision**:

- It reverses **RULING 3** (Greg, 2026-08-24) — that family membership is a
  listed fact and never machine-created.
- It silently removes prospects from a **paying client's** universe.
- The MSP false-positive rate is **unmeasured on the real universe**.

That is money, a client relationship, and a ruling Greg made by name. Per the
standing rules, this is written down for him rather than decided by code.

---

## What "near-certain" means in the code

A match auto-blocks only when **all** of these hold:

1. The source is a **shared Microsoft tenant**. DMARC and SPF matches are never
   auto-blocked, however clean — they are publishing arrangements, not ownership.
2. **Neither side is a consumer mailbox provider** (the gmail/yahoo case above).
3. **Fan-in is exactly 1** — no other company on the client's list shares that
   tenant. Clusters are the MSP shape as well as the corporate-group shape, and
   until that is measured a cluster stays a question.
4. **It would remove at most 25 contacts.** This number is a judgement, not a
   measurement — it bounds the worst case so a mistake is noticeable and small.
5. **No rejection tombstone exists.** A pair a person has refused is never
   auto-blocked, and there is a test proving the tombstone outranks the flag.

Everything else is raised as a question, exactly as before.

---

## How to turn it on — and what to do first

```bash
# 1. Measure it on the real universe FIRST. Dry run, writes nothing.
npm run ops:family-proposals
#    Read the "Would block AUTOMATICALLY if enabled" section. Every pair is
#    listed with its evidence and its contact count.

# 2. Only if that list looks right:
#    set SUPPRESSION_TENANT_AUTO_BLOCK_ENABLED=true in Azure App Service config.
```

Blocks appear on the client's do-not-contact page labelled *"added
automatically — we found it shares a Microsoft 365 account with a blocked
company. Remove it if that is wrong."* and are removed with the existing Remove
button. The nightly job emits a GitHub `::warning` naming the count whenever it
blocks anything.

---

## Evidence — what was actually run

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing warning in an untracked relay file) |
| `npm run typecheck` | 0 errors |
| `npm test` | 2,537 passed / 260 files |
| `npm run test:integration` | 104 passed / 10 files (3 of them new, against a real Postgres) |
| `npm run build` | green |
| `npm run ops:tenant-probe` | 6/6 passed against **live** Microsoft |
| `prisma migrate deploy` on a fresh database | all migrations applied, enum has the three expected values |

`ops:tenant-probe` is the one that matters most. Every automated test injects
the tenant lookup so the suite stays offline — which means the shipped
`liveTenantLookup` could be broken and everything would still be green. The
probe calls the **shipped function** against the **real endpoint** and asserts
the tenant ids recorded here. Run it if the tenant source ever looks wrong.

The auto-block integration test's final assertion is deliberately not "a row was
written" but `evaluateSuppression(...)` — the real send gate, given a real
address, returning suppressed. Both flag states are pinned.

---

## What to tell the client

Suggested, and honest:

> Related-domain detection now uses the Microsoft 365 tenant signal we described
> — we verify it directly with Microsoft, and it finds groups the earlier
> DNS-based checks could not see at all (it correctly links Halifax to Bank of
> Scotland, for example, which no name- or DNS-based rule can).
>
> Automatic blocking is built and tested. We are holding it switched off until
> we have run it in report-only mode against your live list, because switching
> it on removes prospects from your universe without asking, and we would rather
> show you exactly which ones first. That report takes minutes to produce.

## Open questions for Greg — 2

1. **Do you want automatic blocking on?** It reverses your RULING 3 of
   2026-08-24. Recommendation: run `npm run ops:family-proposals` against
   production first, look at the "would block automatically" list, then decide.
2. **Can a future cycle get read access to the production database?** The MSP
   false-positive rate cannot be measured without it, and that is the only
   remaining unknown in this assessment.
