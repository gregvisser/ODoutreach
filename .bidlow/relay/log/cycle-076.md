# Cycle 76 - queue row 44, the 429 fix and what it did to error monitoring

## In one sentence a non-coder can check

Production error monitoring is **on** - proven by finding the Sentry address
inside the code Azure is actually serving right now - and the grade record,
which claimed it was on for a reason that stopped being true three weeks ago,
now says the real reason and has a test that fails if anyone breaks it.

---

## The pull request sweep

`gh pr list --state open` returned nothing. Cycles 71-75 cleared the seventeen
Greg counted and the pile has not rebuilt. Two minutes, and the right two.

---

## The four things, written before touching anything

1. **Files.** `.bidlow/GRADES.json`,
   `src/lib/monitoring/sentry-config-wiring.test.ts`, `.bidlow/relay/QUEUE.md`,
   this log.
2. **The red-first test.** `sentry-config-wiring.test.ts`, asserting the deploy
   workflow sets `NEXT_PUBLIC_SENTRY_DSN` as a **literal** on the **build**
   step. Watched red by making exactly the regression it guards against.
3. **Done.** The grade record says something true about error monitoring, and a
   test stops it becoming false again.
4. **Not touched.** The three Sentry config files (correct as they stand),
   `sentry-data-collection.ts`, any send path, any schema.

---

## Half this row was already done, and the row did not know it

**Part (b) is closed and has been since cycle 62.** The row says `dataCollection`
is "now an EMPTY object" with the installer's hints deleted and nothing
replacing them. That was true when the row was written and was fixed by
`47692b9` (#312) two cycles later, which went considerably further than this row
asked: not just `userInfo: false` and `httpBodies: []`, but a shared
`src/lib/monitoring/sentry-data-collection.ts` naming **every** field the SDK
knows about, wired into all three entry points, with two test files behind it.

That fix also found the thing this row missed. The row assumes an empty
`dataCollection` block means "the defaults still apply". It is worse: in
`@sentry/core` 10.67.0 the resolver picks its base with
`options.dataCollection != null ? DEFAULTS : legacyBridge(sendDefaultPii)`, and
an empty object is not null - so **supplying** the block is what selects the
permissive defaults. Deleting it would have been safer than leaving it empty.

I confirmed that fix is not merely merged but **live**, which is a different
claim. The bundle Azure is serving right now contains:

```
dataCollection:{userInfo:!1,cookies:!1,httpHeaders:{request:!1,response:!1},
httpBodies:[],urlQueryParams:!1,...}
```

Observed in `main-app-dd8eeb3ffd7afc58.js` fetched from
`app-opensdoors-outreach-prod.azurewebsites.net`. That is better evidence than
the test, because it is the running system.

---

## Part (a): the answer is no, and the reasoning that got there matters

The row's fear: the DSN moved to `process.env.NEXT_PUBLIC_SENTRY_DSN`, so if
that variable is not set on the App Service, production has been blind since the
deploy. The row could not check and said so, which was the right thing to do.

**It could be checked. The Azure CLI worked without any interactive step** -
`az webapp config appsettings list` returned 38 settings. That correction
belongs in the row: the tool did not refuse.

**There is no Sentry setting on the App Service.** Not misspelled, not empty -
absent. 38 settings, none matching SENTRY.

And monitoring is on anyway. `NEXT_PUBLIC_*` is not a runtime lookup: Next.js
substitutes the value present when `next build` ran and freezes it
(`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`, lines
164-166). `deploy-production.yml` sets the DSN as a literal on the build step,
so it is baked in before the app ever reaches Azure.

### The part I nearly got wrong

The docs talk about the browser bundle. This product's errors mostly happen on
the **server** - the send pipeline, the database - so "the browser bundle has
it" is not the answer to the question the grade record actually makes.

I built locally with the variable unset and grepped `.next/server`. The
reference `process.env.NEXT_PUBLIC_SENTRY_DSN` was **still there**, live, in the
server chunk and in `edge-instrumentation.js`. Read alone, that looks like proof
that the server depends on a runtime setting that does not exist - i.e. that
server-side monitoring in production is off.

It is not. I rebuilt with a distinctive throwaway DSN set, and:

| | var UNSET | var SET |
|---|---|---|
| literal baked into `.next/server` | no | **yes** (chunk + edge-instrumentation) |
| `process.env` read left in `.next/server` | yes | **none anywhere** |
| literal in browser bundle | no | yes |

```
init({dsn:"https://deadbeef...@o9999999999999999.ingest.de.sentry.io/1234567890",
tracesSampleRate:.1,enableLogs:!0,dataCollection:{userInfo:...
```

The reference survives only when there is no value to substitute. All three
runtimes inline from the build environment. The first measurement was an
artefact of the unset variable, and stopping there would have produced a
confident, wrong, alarming finding.

**Three independent confirmations, then:** no Azure setting exists and none is
needed; the value inlines into server, edge and browser at build time; and the
DSN is present in the JavaScript the production URL is serving.

---

## What I changed

**`.bidlow/GRADES.json`, two entries.** The `met` line said "the Sentry DSN is
hard-coded in `sentry.server.config.ts`". False since `72a11bd` in cycle 52. The
row was right to flag it. The *conclusion* - error monitoring cannot be switched
off by a missing setting - survives, for a different and now-measured reason, so
the line is corrected rather than removed, with the three checks named.

The `not_met` line repeated the same false premise. Corrected, and its real
point sharpened: what is proven is that the DSN **reaches** the deployed code;
what is still unproven is that an event **lands**. Nobody has watched the Sentry
dashboard receive one. That gap is untouched and still the only thing between
this grade and a 9 - I did not close it and have not pretended to.

**A drift guard**, in the existing wiring test. That one literal in
`deploy-production.yml` is now the single point of failure for production
observability, and there are two silent ways to lose it: turn it into
`${{ secrets.X }}` or `${{ vars.X }}` (an unset one expands to an empty string -
no error, no warning, SDK off), or move it off the build step, where it inlines
nothing. Neither shows up in lint, tests, or a green deploy.

Four assertions: the DSN is set on the step that runs the build; its value
contains no `${{`; it matches the shape of a real DSN (shape, not value - pinning
the project id would fail the first time it is rotated); and all three configs
keep the exact literal text Next.js needs in order to substitute it.

**Watched red**, by making the regression rather than describing it:

```
FAIL  sets it as a literal DSN, not an expression that can expand to empty
AssertionError: expected '${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}' not to contain '${{'
```

Workflow restored, green again.

---

## Gates

- `npm run lint` - clean, no output
- `npm run typecheck` - clean
- `npm test` - **314 files, 3133 tests, all passing**
- `npx next build --webpack` - exit 0, twice
- `.bidlow/GRADES.json` re-parsed after editing

One caveat, honestly: the first full run showed `relay/cycle-log-reaches-git.test.ts`
failing on a **5s timeout**, not an assertion. Alone it passes in 1.4s; the
second full run was green. It is a slow `git` call under 15-worker contention on
this machine, and it touches nothing I changed. **I am flagging it rather than
fixing it** - a merge-blocking test that fails on timing is a real problem, but
it is not this row and bumping a timeout without understanding it is how flakes
get buried. Added to the queue as its own row.

No schema change, no migration, nothing sent, no client data touched - none of
the three stop-and-ask conditions applies.

---

## For the next cycle

The remaining Sentry gap is **one look at a dashboard**: has an event actually
arrived? Everything up to the boundary is now proven; arrival is not. Given this
project's habit of building things that report success and never fire, that last
step is worth more than it looks - and it is the only thing standing between the
engineering grade and a 9.

Note the shape of this row, because it is likely to recur: it was written from a
correct reading of a diff, and by the time it was taken, half of it was fixed and
the other half rested on a premise about Next.js that was wrong in a way that
would have produced a false alarm. Both halves needed measuring rather than
reasoning about.
