# Can the system send real email? — proved 26 August 2026

**Short answer: yes. One real email left the system today at 12:16:36 UTC, from
`greg@bidlow.co.uk`, through the real send worker, and every link and image in it
is on `bidlow.co.uk`.**

Nothing had been sent from this system since 3 July — seven weeks — so this was
run as a proof, not a prediction. Everything below was measured, and the raw
message is reproduced in full at the end so it can be checked rather than
believed.

There is one thing that is **not** ready, and it is at the bottom under
"What Greg still cannot do tonight". Read that before the meeting.

---

## 1. Does the BidlowAI mailbox have live credentials?

**Yes — proved against Microsoft, not read off a status column.**

| | |
|---|---|
| Mailbox | `greg@bidlow.co.uk` (Microsoft 365) |
| Status in the app | `CONNECTED`, active, sending enabled, cap 30/day, 0 sent today |
| Connected since | 2026-05-27 |
| Stored permissions | `Mail.Send`, `Mail.Read`, `Mail.Send.Shared`, `Mail.Read.Shared`, `User.Read` |

A status column saying `CONNECTED` is what eight other mailboxes said while
their credentials were dead, so it was not trusted. Instead the stored
credential was decrypted and used to call Microsoft Graph directly:

```
GET https://graph.microsoft.com/v1.0/users/greg@bidlow.co.uk
→ 200 OK
   { "userPrincipalName": "greg@bidlow.co.uk",
     "mail": "greg@bidlow.co.uk",
     "displayName": "Greg Visser" }
```

Microsoft answered. The credential is live. (This used the access token the app
had already stored — the refresh token was deliberately **not** spent
out-of-band, because burning it would have broken the very thing being tested.)

## 2. Is open tracking off, and is there a pixel or a rewritten link?

**Off, and there is neither.**

* `OPEN_TRACKING_PIXEL` on `app-opensdoors-outreach-prod` reads exactly `off`.
* BidlowAI has no verified sender-aligned link domain, so there is no
  `go.<domain>` host to serve anything from either.
* Confirmed in the delivered message, not just in the config: the raw source
  below contains no `1x1`, no tracking image, and no rewritten href.

## 3. One real email, sent

Sent through the **real** path, not a test harness:

1. One `OutboundEmail` row was written for the BidlowAI workspace, `QUEUED`.
   It was the **only** queued row in the entire system, so nothing else could
   go out alongside it.
2. `POST /api/internal/outbound/process-queue` — the same endpoint the
   every-5-minutes cron calls — claimed it and dispatched it.

```
{"claimed":1,"completed":1,"errors":[],"ok":true,"failedCount":0}   HTTP 200
```

The row was left with **no staff user attached on purpose**, so the send was
attributed to a machine and had to pass the autonomous-relay allowlist gate
rather than bypass it. It passed, for `bidlowai` and only `bidlowai`.

| | |
|---|---|
| From | `greg@bidlow.co.uk` |
| To | `greg.visser64@gmail.com` |
| Subject | ODoutreach live send check - 26 August |
| Sent at | 2026-08-26 12:16:36 UTC |
| Transport | Microsoft Graph (`microsoft_graph`) |
| Message-ID | `<LOYP265MB2046D9E29FFAC17D9BADCC78E4AE2@LOYP265MB2046.GBRP265.PROD.OUTLOOK.COM>` |
| Row status | `SENT`, first attempt, no errors |

## 4. Every link and image host, against the sending domain

Sending domain: **bidlow.co.uk**. The complete list of hosts in the message:

| Where | Host | Aligned? |
|---|---|---|
| Signature logo `<img src>` | `www.bidlow.co.uk` | yes |
| Signature website link | `www.bidlow.co.uk` | yes |
| Signature email link | `mailto:` — no host at all | n/a |

**Zero** references to `opensdoors.bidlow.co.uk`, to `azurewebsites.net`, or to
any other host. That is the exact defect that caused the quarantine, and it is
not present.

The opt-out is the **mailto rail**: a visible instruction ("reply STOP") rather
than a link, precisely so the message carries no foreign host. Replying STOP is
ingested by the normal reply sync and suppresses the contact.

## 5. Did it arrive?

* Microsoft accepted and dispatched it, and filed a copy in Sent Items with a
  real Outlook `Message-ID`.
* **No non-delivery report came back.** The sending mailbox's inbox was checked
  after the send and there is nothing from a mail system — a Gmail-side refusal
  would have bounced back within a minute or two.

**Inbox or spam is for Greg to confirm** by opening `greg.visser64@gmail.com`.
That cannot be measured from inside this system and is not claimed here.

## 6. Two honest observations about the message

Neither blocks tonight; both matter at volume.

* **No `List-Unsubscribe` header.** With no sender-aligned domain to host an
  unsubscribe page on, the message carries the visible "reply STOP" opt-out and
  no header. Fine for a demo; Gmail and Yahoo require one-click unsubscribe from
  senders doing more than 5,000 a day.
* **It went out as `multipart/alternative`** — a plain-text part alongside the
  HTML — even though `MICROSOFT_MIME_SEND` is unset. Exchange supplied the
  text part itself. So the "HTML-only scores as spam" worry does not apply to
  the Microsoft path in practice.

## 7. What Greg still cannot do tonight

**The BidlowAI workspace has no email templates and no sequences — none.**

The send above was staged directly into the queue. Through the screens, sending
starts from a sequence, a sequence needs a template, and BidlowAI has zero of
each. So if the plan for this evening is *"open the app and send from BidlowAI
myself"*, the first step is writing a template and building a sequence, not
pressing send.

If the plan is to demo from a workspace that is already set up, these are the
ones that can send today:

| Workspace | Mailboxes that can send | Templates | Sequences | Contacts |
|---|---|---|---|---|
| quirk-solutions-limited | 5 | 7 | 8 | 9 |
| thomas-franks | 5 | 2 | 5 | 6 |
| opensdoors | 4 | 2 | 7 | 647 |
| idverde | 3 | 4 | 10 | 13 |
| morson-fm | 3 | 5 | 4 | 5 |
| octavian-security | 2 | 6 | 4 | 5 |
| paratus-365 | 2 | 3 | 7 | 6 |
| renewable-temporary-power | 2 | 3 | 5 | 73 |

And these **cannot** send at all, because every mailbox on them is broken or was
never connected:

| Workspace | Why | Contacts sitting there |
|---|---|---|
| train-hugger | 5 mailboxes in `CONNECTION_ERROR` | 463 |
| greentheuk | 2 in `CONNECTION_ERROR`, 1 never connected | 233 |
| chevron-security | 2 accounts deleted in Entra, 2 never connected | 9 |
| protech-roofing | 1 in `CONNECTION_ERROR`, 2 never connected | 0 |
| advantos-hvac-group, pareto-fm, panda-recycling, shield-pest-control | never connected | 0 |

Estate totals: **27 connected, 8 in `CONNECTION_ERROR`, 2 disconnected
(deleted Entra accounts), 18 never connected.** The 8 are the same 8 found
earlier this month. None has been reconnected — that needs the client's own
sign-in and is not something the system can do for them.

A demo run from `train-hugger` or `greentheuk` will fail in the room.

---

## Appendix — the raw source, exactly as sent

Fetched from Microsoft Graph as raw MIME (`/messages/{id}/$value`), 3,195 bytes.

```
From: Greg Visser <greg@bidlow.co.uk>
To: "greg.visser64@gmail.com" <greg.visser64@gmail.com>
Subject: ODoutreach live send check - 26 August
Thread-Topic: ODoutreach live send check - 26 August
Thread-Index: AQHdNVS96aZzre8HFEi8vbAl5U7bnQ==
Date: Wed, 26 Aug 2026 12:16:36 +0000
Message-ID:
	<LOYP265MB2046D9E29FFAC17D9BADCC78E4AE2@LOYP265MB2046.GBRP265.PROD.OUTLOOK.COM>
Content-Language: en-US
X-MS-Has-Attach:
X-MS-Exchange-Organization-SCL: -1
X-MS-TNEF-Correlator:
X-MS-Exchange-Organization-RecordReviewCfmType: 0
Content-Type: multipart/alternative;
	boundary="_000_LOYP265MB2046D9E29FFAC17D9BADCC78E4AE2LOYP265MB2046GBRP_"
MIME-Version: 1.0

--_000_LOYP265MB2046D9E29FFAC17D9BADCC78E4AE2LOYP265MB2046GBRP_
Content-Type: text/plain; charset="us-ascii"

Hi Greg,

This message was sent by the ODoutreach system itself, from the BidlowAI
workspace, through the greg@bidlow.co.uk mailbox over Microsoft Graph.

It was written into the outbound queue and then dispatched by the real send
worker, not by a test harness, so if it is sitting in your inbox the whole
send path is working.

Reply to this message if you want to check that replies come back as well.

[BidlowAI]
Greg Visser
greg@bidlow.co.uk<mailto:greg@bidlow.co.uk>
www.bidlow.co.uk/<https://www.bidlow.co.uk/>

This email and any attachments may be confidential. If you are not the intended recipient, please notify the sender and delete this message.

To opt out, reply STOP to this email and we'll remove you.

--_000_LOYP265MB2046D9E29FFAC17D9BADCC78E4AE2LOYP265MB2046GBRP_
Content-Type: text/html; charset="us-ascii"

<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=us-ascii">
</head>
<body>
<p>Hi Greg,</p>
<p>This message was sent by the ODoutreach system itself, from the BidlowAI<br>
workspace, through the greg@bidlow.co.uk mailbox over Microsoft Graph.</p>
<p>It was written into the outbound queue and then dispatched by the real send<br>
worker, not by a test harness, so if it is sitting in your inbox the whole
send path is working.</p>
<p>Reply to this message if you want to check that replies come back as well.</p>
<div class="od-outreach-signature">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;color:#111;">
<tbody>
<tr>
<td style="padding-bottom:8px;"><img alt="BidlowAI" width="140" style="display:block;border:0;max-width:140px;height:auto;" src="https://www.bidlow.co.uk/brand/logo-mark-1024.png"></td>
</tr>
<tr>
<td>Greg Visser<br>
<a href="mailto:greg@bidlow.co.uk">greg@bidlow.co.uk</a><br>
<a href="https://www.bidlow.co.uk/">www.bidlow.co.uk/</a></td>
</tr>
<tr>
<td>
<p style="margin-top:12px;font-size:11px;line-height:1.35;color:#444;">This email and any attachments may be confidential. If you are not the intended recipient, please notify the sender and delete this message.</p>
</td>
</tr>
</tbody>
</table>
</div>
<p>To opt out, reply STOP to this email and we'll remove you.</p>
</body>
</html>

--_000_LOYP265MB2046D9E29FFAC17D9BADCC78E4AE2LOYP265MB2046GBRP_--
```

---

## How this was measured, for whoever repeats it

The production database's firewall allows Azure services only, and opening it to
a workstation was judged Greg's call, not the relay's. So every query above was
run **inside the App Service container** through the Kudu command API, using an
Entra token — the database was reached the same way the app reaches it, no
firewall rule was added, and no credential left Azure. Every read ran inside
`BEGIN READ ONLY`. The scratch scripts were deleted from the container
afterwards; `/home/tmp` is empty.

Writes were three: one contact, one outbound row, and the send itself — all in
the `bidlowai` workspace, which is the only one the autonomous rule permits.
