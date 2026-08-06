# Phase 1 — Production Hardening Audit (READ-ONLY)

**Branch:** `chore/prod-hardening` (cut from `main`, HEAD `75debff`). **No application code changed.**
**Baseline before audit:** 195 test files / **1537 tests green**.
**Method:** 11 parallel read-only dimension auditors → adversarial refutation of every CRITICAL/HIGH finding → completeness critic. 17 agents. Two contested findings were re-verified by hand against the live code (results folded in below).

---

## Headline verdict

The core architecture is **sound**: every send path converges on a single worker (`executeOutboundSend`), which is the only code that calls a provider; the queue claim is atomic (`FOR UPDATE SKIP LOCKED`); terminal writes are idempotent conditional updates; suppression is re-checked live immediately before dispatch; opt-out persistence is append-only. **No CRITICAL found** — there is no normal-operation path that sends to an already-suppressed address, no unauthenticated send path, and no hardcoded secrets.

The gaps that matter are **reliability and compliance** ones, concentrated in two themes:
1. **The live mailbox transport (Gmail/Graph) has no inbound signal ingestion** — bounces and spam-complaints are never captured, so dead/complaining addresses keep getting mailed. The complaint/bounce-suppression *code* exists but is wired only to the legacy Resend path that real outreach never uses.
2. **A few prospect-facing correctness gaps** — one-click unsubscribe returns 405, a permanently-failed intro still unlocks its follow-up, and a rare crash-window + manual operator action can double-send.

### Direct answers to the Phase-1 questions
| Question | Answer |
|---|---|
| Can a suppressed/unsubscribed address EVER receive mail? | **Not in normal operation.** All paths share one live recheck (`evaluateSuppression`) immediately before send, keyed identically on write & read. The only residual is an unavoidable **sub-second TOCTOU window** between the recheck and the external provider accepting the message (M1) — architectural, not a logic hole. |
| Is suppression atomic with the send? | **No (and can't be** — an external HTTP send can't join a DB transaction). Window is tight; can be tightened further (M1). |
| Unsubscribe honoured immediately & one-click? | In-body link: **yes**. Mailbox-native **one-click: NO — returns 405** (H1). |
| Hard bounces auto-suppress? | **Not on the live transport** (H2). Only the unused Resend path suppresses. |
| Complaints processed & suppressed? | **No capture on the live transport** (H3). |
| Throttling / caps / no blast path? | Per-mailbox daily cap is solid & atomic. **No per-domain throttle, no pacing, cap configurable to 5000/mailbox** (M5/M6/M7). No accidental unbounded-blast path. |
| Send-path idempotency / no double-send? | Same-row double-send prevented. **One residual double-send** via stranded-PROCESSING + manual release with dedup OFF by default (H4). |
| Safe state transitions / no orphans? | Mostly. **Follow-up unlocks after a FAILED intro** (H5); minor reservation/position drift (LOW). |

---

## Severity-ranked findings

### 🔴 HIGH (5)

**H1 — Mailbox one-click unsubscribe returns 405 (RFC 8058 non-functional).** *[CODE, confirmed by hand]*
The `List-Unsubscribe` header carries `<base>/unsubscribe/<token>` ([unsubscribe-token.ts:77](src/lib/unsubscribe/unsubscribe-token.ts:77)), and `src/app/unsubscribe/[token]/` contains **only `page.tsx` (GET)**. The working POST handler is at a *different* URL, `src/app/api/unsubscribe/[token]/route.ts`, which is never placed in the header. So a Gmail/Yahoo/Apple native "Unsubscribe" one-click `POST List-Unsubscribe=One-Click` hits a GET-only page → **405 → `performUnsubscribe` never runs → no `SuppressedEmail` written**. The human in-body link still works (GET renders a confirm form posting to the `/api/` path).
*Risk:* recipients who click the mailbox-native unsubscribe keep getting follow-ups; failed one-click drives spam complaints and violates Gmail/Yahoo bulk-sender rules. **Fix (S):** point `List-Unsubscribe` at `/api/unsubscribe/<token>` and have that route handle GET (render/redirect) + POST (one-click); add a test that POSTs to the emitted header URL and asserts a `SuppressedEmail` row.

**H2 — No hard-bounce (NDR) detection on the live Gmail/Graph path.** *[CODE, confirmed]*
Gmail/Graph sends have no webhook; the inbox sync drops anything that isn't a `Re:/Fwd:` reply ([process-synced-replies.ts:91-99](src/server/mailbox/process-synced-replies.ts)), so bounce-back NDRs are discarded. Only the unused Resend webhook ever writes `BOUNCED` ([outbound-provider-events.ts:213](src/server/email/webhooks/outbound-provider-events.ts)).
*Risk:* dead addresses are never suppressed and get re-emailed, inflating bounce rate and risking mailbox throttling/blacklisting. **Fix (L):** detect DSN/NDR messages in inbox sync and call `suppressRecipientForHardBounce` for permanent bounces.

**H3 — No spam-complaint / feedback-loop capture on the live path.** *[CODE, confirmed]*
The complaint→suppress logic (`maybeSuppressComplaint`) is reachable only via the Resend webhook + dev simulators; live sends are `google_gmail`/`microsoft_graph` and match by a `providerMessageId` scheme a Resend event never carries. Inbox sync also ignores the Junk/Spam folder. **The complaint suppressor is dead code for 100% of real outreach** — green tests mask this.
*Risk:* "Report spam" is never learned; complainers keep receiving follow-ups, driving spam-folder placement and bulk-sender complaint-rate penalties — a CAN-SPAM/PECR opt-out weakness. **Fix (L):** sync the Junk folder and/or classify abuse/"stop"/"unsubscribe me" replies → `suppressRecipientForHardBounce(reason:'complaint')`; until then, annotate the complaint code as ESP-only so it isn't assumed-covered.

> H2 + H3 share one root cause: **the mailbox transport has no inbound event ingestion.** A single "inbound signal processor" (NDR + complaint classifier over synced mail) closes both.

**H4 — Double-send via stranded-PROCESSING + manual release (dedup OFF by default).** *[CODE, confirmed]*
If a worker dies between the provider accepting the message and the conditional `SENT` commit, the row stays `PROCESSING, providerMessageId=null`. The claim only selects `QUEUED`, so it's never auto-reclaimed; the **only** recovery is the super-admin "release stale claims" button, which re-queues it ([operator-recovery.ts:14](src/server/email/outbound/operator-recovery.ts)) — and the Gmail/Graph re-send carries no provider idempotency key. The sole guard, `SEND_PREFLIGHT_DEDUP_ENABLED`, **ships OFF** (`.env.example:102`). The row is stamped "requeued for safe retry," actively encouraging the action that re-sends.
*Risk:* a real prospect receives the same cold email twice (needs crash-window **and** a manual release, so low-frequency, but the default config has zero protection). **Fix (S):** enable preflight-dedup by default; have the release reconcile via preflight rather than blind re-queue. **Immediate mitigation (no code): set `SEND_PREFLIGHT_DEDUP_ENABLED=true` in prod.**

**H5 — Follow-up fires after a permanently FAILED introduction.** *[CODE, confirmed]*
In the dispatch transaction the `stepSend` is flipped to `SENT` and the enrollment advanced **before** the email is actually sent ([send-introduction.ts:1074](src/server/email-sequences/send-introduction.ts)); the worker sends later, and on terminal `FAILED` it updates only `OutboundEmail.status`, never the `stepSend`. The follow-up gate reads only `stepSend=SENT`, so a never-delivered intro unlocks `FOLLOW_UP_1`.
*Risk:* prospects get "just following up on my last email" for an email that never arrived — poor experience + deliverability drag. **Fix (M):** gate the follow-up on the linked `OutboundEmail.status='SENT'`, or reconcile `stepSend SENT→FAILED` when its outbound goes terminal.

### 🟠 MEDIUM (13)
| ID | Finding | Area | Fix effort |
|---|---|---|---|
| M1 | Suppression recheck not atomic with the external send (sub-second TOCTOU); move the recheck to immediately before the provider call | Suppression | S |
| M2 | **Open-tracking pixel is auth-walled** — `/api/track` missing from `isPublicPath`, middleware 302s every pixel load to `/sign-in` → opens never recorded, open metrics silently ~0 *(confirmed by hand)* | Tracking/metrics | XS |
| M3 | Auto-reply / out-of-office marks `REPLIED` and **permanently stops** the sequence (no `Auto-Submitted`/`Precedence` check) | Reply matching | M |
| M4 | Gmail `buildRfc5322PlainTextEmail` doesn't strip CR/LF from `Subject`/`To`/`From` → header/BCC injection via imported contact fields (`{{company_name}}` etc.) | Security/injection | S |
| M5 | No per-recipient-domain throttle — a batch can hit one company's domain with the full daily cap | Sending controls | M |
| M6 | No per-hour pacing/jitter — a whole day's quota can fire back-to-back in minutes (bot-like pattern) | Send pacing | M |
| M7 | `dailySendCap` accepts up to **5000**/mailbox × 5 mailboxes = 25k/day/client; no system ceiling | Cap config | S |
| M8 | No automatic reaper for stranded `PROCESSING` rows — recovery is a manual super-admin button (feeds H4) | Queue recovery | M |
| M9 | Graph preflight dedup is fuzzy (subject+recipient) — can false-reconcile (under-send) or miss (double-send) even when the flag is on | Idempotency | M |
| M10 | Inbound reply webhook accepts **unauthenticated** injection when `INBOUND_WEBHOOK_SECRET` is unset (forge replies → stop campaigns) | Auth/data-integrity | S |
| M11 | Cross-domain tracking/unsub links + Microsoft HTML-only + no `List-Unsubscribe-Post` *(already fixed on branch `fix/microsoft-deliverability-mime-and-pixel` / commit `566418c`)* | Deliverability | merge |
| M12 | No in-app SPF/DKIM/DMARC readiness; Settings still says "delivered via Resend / verify DKIM in the Resend dashboard" (stale, misdirects staff) | Auth readiness | M |
| M13 | **[DNS/EXTERNAL]** sending-domain DNS gaps (SPF spacing typo, unconfirmed DKIM signing, DMARC `ruf` typo, outreach on primary domain) — per the deliverability investigation | External DNS | S |

### 🟡 LOW / INFO (notable)
- Suppressed addresses are imported as live contacts (caught at send by the live recheck; brief stale-flag window). **LOW**
- No syntactic email re-validation before send (both live import paths validate; latent for future direct-create paths). **LOW**
- Reservation capacity leak when a client is paused/archived with QUEUED backlog (self-heals at 00:00 UTC). **LOW**
- `SENT`-write and reservation `CONSUME` in separate transactions → cosmetic ledger drift on an ill-timed crash. **LOW**
- Support-ticket attachment download not tenant-scoped (all staff trusted internal, so low). **LOW**
- OAuth mailbox callbacks don't enforce `oauthStateExpiresAt` (defense-in-depth; state is 32-byte single-use). **LOW**
- Webhook status match by non-unique `providerMessageId` with `findFirst`, no tenant scope. **LOW**
- RocketReach import lacks within-batch dedup + try/catch (one dup aborts the import). **LOW**
- `providerIdempotencyKey` is per-attempt and unused by Gmail/Graph — misleading name. **LOW**
- Permissive email regex (accepts `a..b@x.com`). **INFO**
- From header has no display name on Gmail/Graph. **INFO**

---

## Security summary (Phase-1 required)
- **Secrets:** no hardcoded secrets/keys/passwords found in source. OAuth blobs are AES-GCM encrypted; unsubscribe tokens stored SHA-256-only; DB stores opaque refs, not raw tokens. ✅
- **Injection:** Gmail raw-MIME header path is the one real gap (M4); Graph JSON path is safe; List-Unsubscribe header builder rejects CR/LF.
- **Authz:** internal cron routes enforce `PROCESS_QUEUE_SECRET` (503 when unset); dev routes 404 in prod unless explicit flags + secret; Resend webhook verifies Svix signatures. Gaps: inbound webhook optional auth (M10), support attachment tenant scope (LOW).
- **PII in logs:** no systemic PII logging found; error messages are sliced/bounded.

---

## Proposed change plan (NOT being implemented in this phase)

Per the Phase-1 instruction, I am **stopping here for review** and will change nothing beyond the two approved features. Recommended remediation order when you're ready (each its own flagged/tested PR on a branch, staging-first):

**Immediate, config-only (no code, your call):**
- Set `SEND_PREFLIGHT_DEDUP_ENABLED=true` in prod (mitigates H4).
- Set `INBOUND_WEBHOOK_SECRET` in prod if unset (closes M10).
- Lower the mailbox `dailySendCap` ceiling expectation operationally until M7 is coded.

**Wave 1 — compliance/correctness (HIGH):** H1 (one-click URL, S) · H5 (follow-up gate on real send, M) · H4 (dedup default-on + safe release, S) · H2+H3 (inbound NDR/complaint processor, L).
**Wave 2 — controls & metrics (MEDIUM):** M2 (pixel public-path, XS) · M3 (auto-reply guard, M) · M4 (Gmail header sanitize, S) · M5/M6/M7 (per-domain throttle + pacing + cap ceiling) · M8 (stale-PROCESSING reaper).
**Wave 3 — deliverability/readiness:** merge `566418c` (M11) · M12 (Settings copy + DNS readiness surface) · M13 (hand the DNS list to each tenant).

**Effort note:** Wave 1 is roughly 2–4 focused days; the inbound NDR/complaint processor (H2/H3) is the single biggest item (L).

---

## Phase 2 — the two approved features (gated)
- **Feature A (internal seed allowlist):** integrates exactly where the audit confirms the single chokepoint is — `evaluateSuppression` (short-circuit when flag ON) + guards on the four suppression-write paths (unsubscribe, bounce, manual DNC, refresh). Stored as a **new additive table `InternalSeedAddress`** → **needs an additive, reversible migration**. Per Phase-0 + your standing rule, **this migration is the one item I need your explicit nod on before I apply it even locally.** Flag-gated, OFF by default → zero change to the live send path when off.
- **Feature B (pre-send preview):** reuses the real render pipeline (`composeSequenceEmail` + `buildMailboxGovernedEmailBodies`) in a sandboxed iframe; no schema change, flag-gated. Test asserts preview render == send render.

**I have not written any feature code yet** — awaiting your go-ahead on the Feature A table/migration.
