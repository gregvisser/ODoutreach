# Deliverability findings — "New TEST" send (luke.smith@morsonfm.co.uk → cameron@octaviangr.com)

**Read-only investigation. No code, DNS, or mail was changed.** All fixes below are proposed, not applied.

Subject sent: *"Support with Office Maintenance"*. Send succeeded with provider proof; it was
**quarantined on Octavian's side**. This is a recipient-side spam-score decision, not a send failure.

---

## TL;DR

The send mechanics in this codebase are correct and standards-aware. The email left as a properly
identified message **from the real mailbox `luke.smith@morsonfm.co.uk`, sent through Microsoft 365
(Exchange Online) via Graph `sendMail`** — *not* relayed through a shared ESP. SPF and (published)
DKIM for `morsonfm.co.uk` should both align, so the message almost certainly **passed DMARC**.

That means the quarantine was a **content / reputation spam-score** decision at Octavian's gateway,
**not** an authentication failure. The things we can influence split cleanly:

- **In this codebase (fixable):** cross-domain tracking-pixel + unsubscribe links (they point at the
  OpensDoors app domain, not `morsonfm.co.uk`); HTML-only body with no plain-text part on the
  Microsoft path; no RFC 8058 one-click `List-Unsubscribe-Post` on the Microsoft path.
- **External DNS (Morson / their email vendor "Intuitive"):** a real **SPF syntax error** (missing
  space before `-all`), and a **DKIM-signing-enabled** confirmation to make.

The single most useful next step is to **pull the quarantined message's `Authentication-Results` and
anti-spam headers** — that tells you definitively whether it was auth or content/reputation, and the
ordering below assumes content/reputation (the most likely case given the DNS evidence).

---

## How sending actually works here (item 1 — sending identity & auth)

Traced through `src/server/email/outbound/execute-one.ts` → `sendViaConnectedMailboxOrFail()`:

- A connected mailbox row (`ClientMailboxIdentity`) sends through **its own provider API**, never a
  shared ESP:
  - **Microsoft** → `POST https://graph.microsoft.com/v1.0/users/{mailbox}/sendMail`
    (`src/server/mailbox/microsoft-graph-sendmail.ts`).
  - **Google** → `POST .../gmail/v1/users/me/messages/send`
    (`src/server/mailbox/gmail-sendmail.ts`).
- The shared-ESP path (Resend / mock in `src/server/email/providers/`) is **only** used for legacy
  rows with no `mailboxIdentityId`. Real outreach does **not** use it.
- **From** = the mailbox's own address: `row.fromAddress?.trim() || normalizeEmail(mailbox.email)`
  → `luke.smith@morsonfm.co.uk`. For Graph, the send is scoped to `/users/{mailbox.emailNormalized}/sendMail`,
  so From is the mailbox itself. **From is correctly aligned to the sending mailbox.**
- **DKIM / envelope return-path are owned by the provider, not this app.** Because the message is
  injected into Exchange Online and sent through Microsoft's outbound infrastructure, DKIM signing,
  the `5321.MailFrom` (return-path) and SPF authorisation are all whatever `morsonfm.co.uk` has
  configured in Microsoft 365 + DNS. **The app cannot and does not sign DKIM itself.**

**Live DNS for `morsonfm.co.uk` (looked up read-only during this investigation):**

| Record | Value (live) | Read |
|---|---|---|
| MX | `mx1..4.mtaroutes.com` | Inbound via **Intuitive "Mailcloud"** security gateway |
| SPF | `v=spf1 include:spf.protection.outlook.com include:amazonses.com ip4:85.95.102.232-all` | **Microsoft 365** + **Amazon SES** + one on-prem IP. ⚠ malformed tail (see F5) |
| DKIM `selector1._domainkey` | CNAME → `selector1-morsonfm-co-uk._domainkey.prmorson.onmicrosoft.com` → publishes a valid `v=DKIM1; k=rsa; p=…` (1024-bit) key | M365 tenant = `prmorson.onmicrosoft.com`; **DKIM key is published** |
| DKIM `selector2._domainkey` | CNAME exists, but the onmicrosoft target **does not resolve to a key** | Rotation half-provisioned — see F6 |
| DMARC `_dmarc` | `v=DMARC1; p=quarantine; sp=reject; adkim=r; aspf=r; pct=100; …` | **p=quarantine** at org level; reports to `intuitivecm.co.uk` |

So `luke.smith@morsonfm.co.uk` sends via **Microsoft 365**, SPF includes Microsoft, DKIM is published.
A Graph-originated message should get **SPF=pass (aligned)** and, if signing is on, **DKIM=pass
(aligned, `d=morsonfm.co.uk`)** → **DMARC=pass**. Hence the quarantine is content/reputation-driven.

---

## Headers the app emits (item 2)

From the message builders (`gmail-sendmail.ts`, `microsoft-graph-sendmail.ts`,
`src/lib/unsubscribe/outreach-mailbox-bodies.ts`):

| Header | Google path | **Microsoft path (this send)** |
|---|---|---|
| `Message-ID` | App stamps `<uuid@morsonfm.co.uk>` | **Not set by app** — Exchange Online generates a valid one (`@…morsonfm.co.uk` / EXO). ✅ valid either way |
| `List-Unsubscribe` | ✅ `<https://…/unsubscribe/token>` | ✅ delivered via MAPI extended property `String 0x1045` (only when a hosted URL exists) |
| `List-Unsubscribe-Post` (one-click, RFC 8058) | ✅ `List-Unsubscribe=One-Click` | ❌ **cannot be sent** over Graph JSON `sendMail` — documented limitation, intentionally omitted (see F4) |
| `Reply-To` | Not set → defaults to `From` | Not set → defaults to `From`. ✅ consistent with From |
| Plain-text alternative | ✅ `multipart/alternative` (text + HTML) | ❌ **HTML-only** — Graph JSON sends one content type; HTML wins when present (see F3) |

`List-Unsubscribe` headers are only present when a **hosted** unsubscribe URL is built — that needs a
public base URL (`AUTH_URL`/`INTERNAL_APP_URL`/`NEXT_PUBLIC_APP_URL`) configured (it is, in prod) and
a real recipient (not the mailto placeholder). The header values are minted per-recipient in
`sendSequenceStepBatch` and read back in `execute-one.ts` from `OutboundEmail.metadata.headers`.

---

## Content & links (item 3)

- **Template body is plain-text** with `{{snake_case}}` tokens (`sequence-email-composition.ts`),
  rendered to simple HTML paragraphs at send (`email-body-parts.ts`). **Not image-heavy** — the only
  image is the 1×1 tracking pixel. Good text/HTML ratio.
- **No link shorteners, no click-link rewriting.** The only app-injected URLs are:
  1. the **open-tracking pixel** `…/api/track/open/{correlationId}` (`src/lib/tracking/open-pixel.ts`), and
  2. the **unsubscribe link** `…/unsubscribe/{token}`.
  Both are built from the **OpensDoors app's own domain** (Azure App Service / app `AUTH_URL`),
  **not `morsonfm.co.uk`** → see F2.
- **No recipient (Octavian) branding.** Composition only substitutes sender + the recipient's *own*
  fields (`{{company_name}}` = the recipient's company). There is **no impersonation / third-party
  branding** injected by the system. ✅ Sanity check passes.

---

## Findings, ordered by likely deliverability impact

### F0 — [DIAGNOSTIC, do first] Pull the quarantined message's auth + spam-score headers
Not a fix — the decision gate. Get the original headers from Octavian's quarantine (or ask their IT)
and read `Authentication-Results` (spf=/dkim=/dmarc=) plus any `X-Forefront-Antispam-Report` /
`X-Microsoft-Antispam` (SCL/BCL) or third-party gateway verdict. This tells you **auth-failure vs
content/reputation** and which of the below actually mattered. Everything else is ordered assuming
content/reputation (the most probable case given DNS).

### F2 — [CODE FIX] Tracking pixel + unsubscribe links are on a non-aligned domain
**Impact: medium — most likely the biggest signal we directly control.**
The hidden open-pixel and the unsubscribe URL both point at the OpensDoors app domain, while the
visible From is `morsonfm.co.uk`. A hidden 1×1 image plus links on a *different* domain than the
sender is a classic cold-bulk/marketing fingerprint, and the From/links domain mismatch is a known
spam heuristic.
**Proposed fix (no change applied):** (a) make the open-tracking pixel opt-out for first-touch cold
sends, and/or (b) serve the tracking + unsubscribe endpoints from a CNAME subdomain of the *sending*
domain (e.g. `link.morsonfm.co.uk`) so embedded URLs align with From. Today the URL is derived from a
single global `resolvePublicBaseUrl()`; per-sending-domain link hosting would be the structural fix.

### F3 — [CODE FIX] Microsoft path sends HTML-only (no text/plain alternative)
**Impact: medium.** `microsoft-graph-sendmail.ts` sets `body.contentType = "HTML"` whenever HTML
exists, so the Graph send has **no `multipart/alternative` plain-text part**. Filters such as
SpamAssassin add points for HTML-only (`MIME_HTML_ONLY`). The Gmail path already does this correctly
(both parts).
**Proposed fix:** send `multipart/alternative` (text + HTML) on the Microsoft path too. Graph JSON
`sendMail` only carries one content type, so this means switching that path to a **raw MIME**
submission (build the message like the Gmail path already does, then `POST` the MIME). Non-trivial —
scope it deliberately.

### F1 — [PROCESS, not code] Cold sending relationship / domain reputation
**Impact: medium — inherent to cold outreach.** First-ever contact `luke.smith@morsonfm.co.uk` →
`octaviangr.com`, an unsolicited commercial pitch, from a domain with **no prior reputation with
Octavian** and **mixed mail streams** (M365 + Amazon SES + on-prem IP). Borderline content gets
quarantined on a thin reputation. Mitigation is warm-up, low volume, plain conversational copy,
genuine personalisation — process, not a code change. (See F7 for the subdomain angle.)

### F4 — [CODE FIX] No one-click `List-Unsubscribe-Post` on the Microsoft path
**Impact: low–medium for a single send; matters at bulk.** Graph JSON `sendMail` rejects non-`x-`
headers, so the code delivers `List-Unsubscribe` (via the MAPI extended property) but **cannot**
deliver `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (documented in the code). Google/Yahoo/
Microsoft bulk-sender guidance favours working one-click unsubscribe.
**Proposed fix:** same raw-MIME submission as F3 would let both headers through. Until then, the
Microsoft path is one-click-incomplete by design.

### F5 — [DNS/ESP CONFIG] SPF record has a syntax error (missing space before `-all`)
**Impact: low for THIS send, but real and trivially fixable.** Live SPF is one TXT string:
`…ip4:85.95.102.232-all` — **no space before `-all`**. As written, the final term parses as an
invalid `ip4:` value (`85.95.102.232-all`), so the record has **no valid terminal `all`** and strict
validators may return **SPF PermError**. For *this* send it likely still passed (the
`include:spf.protection.outlook.com` mechanism matches Microsoft's IP first and short-circuits to
Pass), so it probably didn't cause the quarantine — but it weakens anti-spoofing and risks PermError
on stricter receivers.
**Proposed fix (Morson/Intuitive to make in DNS):**
`v=spf1 include:spf.protection.outlook.com include:amazonses.com ip4:85.95.102.232 -all`

### F6 — [DNS/ESP CONFIG] Confirm Microsoft 365 DKIM signing is actually enabled
**Impact: medium if it's off.** `selector1` publishes a valid key, so DKIM is *set up*; but a
published key does **not** prove the M365 "Sign messages for this domain with DKIM" toggle is on, and
`selector2`'s key doesn't currently resolve (rotation half-provisioned). If signing is off, DMARC
passes on **SPF alignment only** — fragile (forwarding breaks SPF, leaving nothing aligned → DMARC
fail → `p=quarantine`).
**Proposed checks:** confirm `dkim=pass header.d=morsonfm.co.uk` in F0's headers; in the M365 admin
(or via `Get-DkimSigningConfig`) confirm signing is **Enabled**; have Intuitive finish the
`selector2` CNAME so rotation works. Minor: the published key is **1024-bit** — Microsoft now issues
2048-bit; rotating up is good hygiene.

### F7 — [DNS/ESP CONFIG, strategic] Outreach runs on the primary corporate domain
**Impact: strategic.** No dedicated outreach subdomain exists (`mail/email/send/outreach.morsonfm.co.uk`
have no sending config). Cold outreach from the same domain that carries day-to-day corporate mail
risks the main domain's reputation and mixes streams.
**Proposed direction:** consider a dedicated subdomain (e.g. `outreach.morsonfm.co.uk`) with its own
SPF/DKIM/DMARC for cold sending, kept separate from corporate mail. Bigger decision — flagging, not
recommending blindly.

### F8 — [DNS/ESP CONFIG, cosmetic] DMARC `ruf` address has a typo
The forensic-report address is `mailto:dmarc@intuitivecm.co.ukt` (stray trailing `t` →
`intuitivecm.co.ukt`). Failure reports won't be delivered. No deliverability effect; worth fixing
while in the record.

### Passed sanity checks (no action)
From aligned to mailbox · Reply-To consistent (defaults to From) · valid Message-ID · no third-party/
Octavian branding · no link shorteners · no click-link rewriting · text-derived, not image-heavy ·
`List-Unsubscribe` present.

---

## Item 4 — exact external records to verify against Morson's live DNS

These are what `morsonfm.co.uk` **should** have for "send via Microsoft 365 (+ Amazon SES)". Compare
against live values (live values captured above for convenience).

**SPF** (one TXT at the apex, fix the spacing):
```
v=spf1 include:spf.protection.outlook.com include:amazonses.com ip4:85.95.102.232 -all
```
- If Amazon SES is no longer used for any `@morsonfm.co.uk` mail, drop `include:amazonses.com` to
  tighten the authorised set. Keep it only if SES still sends as this domain.

**DKIM** (Microsoft 365 — two CNAMEs; values are tenant-specific, already correct in form):
```
selector1._domainkey.morsonfm.co.uk  CNAME  selector1-morsonfm-co-uk._domainkey.prmorson.onmicrosoft.com
selector2._domainkey.morsonfm.co.uk  CNAME  selector2-morsonfm-co-uk._domainkey.prmorson.onmicrosoft.com
```
- Selector for M365 outbound DKIM = **`selector1` / `selector2`** (d=`morsonfm.co.uk`).
- Verify **both** targets resolve to a `v=DKIM1; … p=…` key, and that DKIM signing is **Enabled** in
  the M365 admin / `Get-DkimSigningConfig`.
- If Amazon SES still sends as this domain, SES also needs its own DKIM (3 × `*._domainkey` CNAMEs
  Amazon provides) — none are published today (`_amazonses.morsonfm.co.uk` does not exist), so SES
  mail is currently DKIM-unaligned.

**DMARC** (already present; keep policy, fix the report address):
```
v=DMARC1; p=quarantine; sp=reject; adkim=r; aspf=r; pct=100; fo=0; rf=afrf; ri=84600; rua=mailto:dmarc@intuitivecm.co.uk; ruf=mailto:dmarc@intuitivecm.co.uk
```
- `p=quarantine` is a reasonable posture; once SPF + DKIM are confirmed clean you could move to
  `p=reject`. Fix the `ruf` typo (`.co.ukt` → `.co.uk`).

---

## Questions to answer before any change

1. **F0 headers:** Can you get the original headers of the quarantined message (from Octavian's
   quarantine UI / their IT)? What does `Authentication-Results` say for spf / dkim / dmarc, and what
   SCL/BCL or gateway verdict is shown? *This decides whether the fixes below even matter.*
2. **Who controls `morsonfm.co.uk` DNS?** Evidence points to **Morson's IT + "Intuitive Communications"**
   (MX = `mtaroutes.com` / Mailcloud; DMARC reports → `intuitivecm.co.uk`). Confirm who can edit the
   SPF/DKIM/DMARC TXT/CNAME records (F5, F6, F8).
3. **Is Microsoft 365 DKIM signing actually enabled** for `morsonfm.co.uk` (not just key-published)?
   And can Intuitive finish the `selector2` key so rotation works (F6)?
4. **Is Amazon SES still used** to send as `@morsonfm.co.uk`? If yes, it needs its own DKIM and should
   stay in SPF; if no, remove `include:amazonses.com` (F5).
5. **Tracking/links domain (F2):** are you willing to (a) turn off the open-tracking pixel for cold
   first-touch sends, and/or (b) stand up a CNAME link subdomain on each sending domain so pixel +
   unsubscribe URLs align with From? Which sending domains would that cover?
6. **Raw-MIME on the Microsoft path (F3/F4):** worth the rework to add a plain-text part and true
   one-click unsubscribe on Graph sends? (It's the same change that fixes both.)
7. **Strategy (F7):** is a dedicated outreach subdomain on the table, or must cold sends stay on the
   primary corporate domain?
