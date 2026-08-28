# Cycle 62 — queue row 69

**The empty Sentry block was not a safe default. It was the switch that turned
prospect-data collection on.**

Date: 2026-08-28. Branch `fix/sentry-data-collection-explicit`, PR #312.

## The brief was right, and I checked before I believed it

The brief for this cycle was written by the relay off QUEUE.md, and it made a
strong claim about code inside `node_modules`. Claims like that are exactly the
kind that get repeated until nobody remembers who verified them, so the first
thing this cycle did was run the SDK rather than read it:

```
resolveDataCollectionOptions({ dataCollection: {} }).userInfo  -> true
resolveDataCollectionOptions({}).userInfo                      -> false
```

That is the whole finding in two lines, and it is the opposite of how the config
files read. `@sentry/core` 10.67.0,
`utils/data-collection/resolveDataCollectionOptions.js`:

```js
const base = options.dataCollection != null ? DEFAULTS : defaultPiiToCollectionOptions(options.sendDefaultPii)
```

An empty object is not null. So **supplying** the block selects `DEFAULTS`, and
`DEFAULTS` is `userInfo` true, `cookies` true, request and response headers true,
all four `httpBodies`, `urlQueryParams` true, `databaseQueryData` true,
`stackFrameVariables` true. Every commented-out line in the installer's scaffold
is `undefined` and falls straight through to it.

`sentry.server.config.ts`, `sentry.edge.config.ts` and
`src/instrumentation-client.ts` all carried that block.

On this product that is prospects' names and email addresses, the bodies of real
outreach and real replies, prospect rows off the database, and — via
`stackFrameVariables` — the recipient address and the rendered email body sitting
in local variables inside the send pipeline. The public privacy policy describing
how that data is handled was merged this same morning, as PR #302.

## The four things, written before anything was touched

1. **Files.** New `src/lib/monitoring/sentry-data-collection.ts`; the three
   config files; two new test files beside the module; `.bidlow/GRADES.json`;
   `.bidlow/relay/QUEUE.md`; this log.
2. **Red-first test.** `sentry-data-collection.test.ts`, asserting through the
   real installed resolver that the old shape gives `userInfo: true` and ours
   gives `false`.
3. **Done.** Sentry no longer receives prospect names, email addresses, email
   bodies, database values or local variables — proven by running Sentry's own
   code.
4. **Not touched.** The send pipeline, the schema, the DSN, `tracesSampleRate`.

## What was built

One shared policy, `SENTRY_DATA_COLLECTION`, used by all three entry points.

It names **every** field the SDK knows about, and that is not tidiness. Because
the block is supplied, the base is `DEFAULTS`, so any field left unset is ON.
There is no partial version of this object.

Two decisions worth recording rather than burying:

* **`httpHeaders: { request: false, response: false }`**, decided rather than
  copied off the brief's list. Not a deny-list: request headers carry the
  next-auth session cookie and outgoing ones carry Microsoft Graph and Google
  bearer tokens, and a deny-list only redacts the key names the SDK happens to
  ship — a list that can change under us on an upgrade. `false` cannot regress.
* **The block is set, not deleted.** Deleting it would be safer *today* — the
  legacy `sendDefaultPii` bridge defaults `userInfo` to false — but the SDK
  source carries a TODO to remove that bridge in v11, at which point an absent
  block would silently flip to the permissive defaults. Explicit survives the
  upgrade; absent does not.

Monitoring is not reduced. Stack traces, error messages, breadcrumbs, route
names, span timings and sanitised parameterised SQL are all still collected.

## Assume the seventh exists

The brief's standing warning is that this repository's signature defect is
something built, wired, reporting success, and never firing. A test that only
checks the constant would have been exactly that defect: it would prove a
correct object exists and nothing at all about what `Sentry.init` receives.

So there are two test files.

* `sentry-data-collection.test.ts` drives the **real installed resolver**, loaded
  by absolute path off the package's own `package.json` because it is not
  re-exported from the root and `exports` blocks deep subpaths. It asserts both
  directions, and it asserts that our object's key set equals the resolver's
  whole output surface — so a field added by a future SDK version reds the build
  instead of quietly inheriting `true`. That is the seventh case, guarded.
* `sentry-config-wiring.test.ts` imports the **real** `sentry.server.config.ts`,
  lets it call `Sentry.init`, and reads `client.getDataCollectionOptions()` back
  off the live client.

Both were watched red before they were made green. The first failed on a missing
module. The second was then proven capable of failing by restoring
`dataCollection: {}` in the server config:

```
× the server config, actually initialised > hands Sentry a client that will not collect prospect data
  → expected true to be false
```

That `true` is `userInfo`, read off a live Sentry client in this application. The
finding, observed rather than argued.

The edge and client configs are covered by source assertions only, because
neither can be imported under a Node test runner. That is a weaker check and it
is written down as such in the test file, which is why it is not the only one.

## Gates

All three run, all three green.

* `npm run lint` — clean.
* `npm run typecheck` — clean, **after** `npm run db:generate`. The first run
  failed with fifteen errors in `tracking-dns-persistence.ts` and
  `open-tracking-opt-in.ts` — a stale local Prisma client from cycle 61's
  tracking fields, nothing to do with this change. Recorded because a future
  cycle will hit it and should not go looking for a real bug.
* `npm test` — **2900 tests in 293 files, all passed.**

## Records

`CR-06` is `CLOSED` in `.bidlow/GRADES.json`, citing both tests and the
capability-to-fail demonstration.

**Dimension 8's score is deliberately left at 6.** It was set by a customer walk,
and closing a cause is not the same as re-running the walk that produced the
number. The dimension carries a dated note saying exactly that, and naming CR-05
as its remaining input. Moving a score I did not re-measure would be the false-9
this project keeps a whole protocol to prevent.

Two claims in CR-06's original text were **already stale when it was written**,
and are corrected in the closing record rather than left to be rediscovered: the
DSN is env-driven, not hard-coded (since cycle 52, `72a11bd`), and
`tracesSampleRate` is 0.1, not 1, in all three configs. Neither was touched here.
The brief for this cycle did not repeat either error.

## The PR sweep, and why #311 cost more than it should have

Four open at the start, not seventeen — cycle 61's sweep had already done most of
the work.

* **#308** (autonomous send toggle) — green and CLEAN, merged.
* **#302** (privacy policy and terms pages) — updated, CI green, merged. Directly
  relevant to this cycle: it is the document that makes CR-06 a contradiction and
  not just an untidiness.
* **#301** (suppression sheet range) — updated, CI running at the end of this
  cycle.
* **#311** (the cycle 61 record) — was `DIRTY` and needed a manual rebase.

`gh pr merge --auto` is **not available on this repository** —
`enablePullRequestAutoMerge` is refused. Every future sweep has to
update-branch, wait for CI, and merge by hand, one at a time, in that order. This
is worth knowing before planning a sweep around it.

The #311 rebase had two conflicts. The queue conflict was row 41: `main` said
`TODO`, the branch said `DONE 61`, and the branch was right — the tracking DNS
verifier really did ship as `7250cc7` in PR #309. Resolved to the branch's
version. The `cycle-060.md` conflict was an add/add over the watcher's
"Interrupted" note; kept. Both files were then checked for stray conflict markers
and the whole queue was re-parsed against the six-word status rule before
pushing, because a marker left in QUEUE.md would stop the relay outright.

## Not done, and deliberately

* **The edge and client configs have no runtime proof**, only source assertions.
  Their runtimes cannot be started under vitest. The server config's runtime
  proof plus the shared constant is the strongest available position; a genuine
  browser-side proof would need a Playwright assertion on the client's resolved
  options, which is a bigger piece of work than this row.
* **Dimension 8 not re-scored** — see above.

## Open questions for Greg

**One.**

CR-05 (Article 28 / DPA acceptance for Sentry, Resend and RocketReach) is a
commercial and contractual question, not an engineering one, and row 71 says it
was settled on 2026-08-28 without the record being updated. This cycle did not
touch it. With CR-06 closed, CR-05 is now the sole remaining data-protection
input to dimension 8.
