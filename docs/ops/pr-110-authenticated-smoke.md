# PR #110 — Authenticated production smoke (Contact Universe re-land)

## When and where

- **Recorded (UTC):** 2026-05-12T10:11:59Z  
- **Production URL:** https://opensdoors.bidlow.co.uk  
- **Main SHA tested:** `81ab7219a383f8e519fe9caf0c31a74ff5c8bf79` (squash merge of PR #110)

## Health (API)

Both endpoints returned `ok: true` and `checks.database: ok` before and after the browser session:

- `https://opensdoors.bidlow.co.uk/api/health`  
- `https://app-opensdoors-outreach-prod.azurewebsites.net/api/health`

## Login handoff

- Microsoft Entra sign-in was completed **manually by Greg** in the browser; automation did not enter credentials, MFA, or handle tokens.  
- **No credentials, cookies, tokens, or other secrets** were captured or written into this repository.

## Authenticated route results

Query parameter `v=greg-auth-smoke` was used for traceability. Each route was loaded read-only (no sends, imports, RocketReach, suppression sync, OAuth reconnect, or mailbox changes).

| Route | Final path (production host) | Main heading / title | Loaded | Black screen | Visible app/Prisma error | Console issues | Failed network (critical) | Screenshot |
|-------|------------------------------|----------------------|--------|--------------|--------------------------|----------------|---------------------------|------------|
| Dashboard | `/dashboard` | Dashboard | Yes | No | No | None reported | None (HTTP 200) | Yes |
| Contacts | `/contacts` | Contacts | Yes | No | No | None reported | None (HTTP 200) | Yes |
| Universe | `/universe` | Universe | Yes | No | No | Minor warnings only (non-blocking; UI intact) | None (HTTP 200) | Yes |
| Client Sources | `/clients/cmob909yy0000ggr1coravvft/sources` | OpensDoors (client shell) | Yes | No | No | None reported | None (HTTP 200) | Yes |
| Client Outreach | `/clients/cmob909yy0000ggr1coravvft/outreach` | OpensDoors (client shell) | Yes | No | No | Minor warnings only (non-blocking; UI intact) | None (HTTP 200) | Yes |
| Client Mailboxes | `/clients/cmob909yy0000ggr1coravvft/mailboxes` | Mailboxes | Yes | No | No | None reported | None (HTTP 200) | Yes |
| Client Activity | `/clients/cmob909yy0000ggr1coravvft/activity` | OpensDoors (client shell) | Yes | No | No | None reported | None (HTTP 200) | Yes |

**Login loop:** Not observed (session remained in the signed-in app across routes).

## Outcome

- **No black screens** and **no Application Error / visible Prisma schema error** text on the routes above.  
- **No production data mutation** as part of this smoke (navigation and visual checks only).  
- **No migrations** were run from this activity (`prisma migrate`, `db push`, `migrate reset` — none).  
- **No sends, CSV imports, RocketReach, suppression sync, OAuth reconnect, or mailbox disconnect** were triggered.

## Screenshots

Seven in-app screenshots were taken during the automated browser pass; they remain in the operator session artifact store (not committed to git).
