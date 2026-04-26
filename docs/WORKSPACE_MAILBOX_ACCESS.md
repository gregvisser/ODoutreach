# Workspace Mailbox Access Model

OpensDoors connects multiple sending mailboxes per client workspace. The
operating rule across ODoutreach is **workspace-based, not mailbox-owner-based**.

## Rule

Any staff user who is authorised for a client workspace (passes
`requireClientAccess` plus the relevant role/membership gate) may:

- view **all** connected sending mailboxes for that client
- author sequences that use the shared mailbox pool
- trigger sends that draw from any eligible mailbox in that workspace
- reply to inbound messages received by any of the client's connected mailboxes

The signed-in operator's email address **never** selects or restricts which
mailbox is used. Operator identity is recorded on the outbound row as audit
trail only.

## Eligibility (mailbox-specific, per send)

Every send still respects mailbox-specific gates. The single labelled
place these are enforced for the sending pool is
`eligibleWorkspaceMailboxPool` in `src/server/mailbox/sending-policy.ts`:

- `isActive === true`
- `connectionStatus === "CONNECTED"`
- `canSend === true`
- `isSendingEnabled === true`
- per-mailbox daily cap (enforced via the `MailboxSendReservation` ledger)
- per-client suppression list
- sender signature (per mailbox) available when applicable
- governance (launch approval, allowlist for governed tests) satisfied

## Reply path

Replies stay tied to the **receiving** mailbox and the original thread.
`replyToInboundMailboxMessage` loads the mailbox by
`(message.mailboxIdentityId, clientId)` — not by operator email — and
dispatches through that mailbox so Microsoft Graph / Gmail thread the
reply against the original conversation.

## Permission gates (still enforced)

| Action | Gate |
|---|---|
| Load client workspace | `requireClientAccess(staff, clientId)` |
| Manage mailboxes | `requireClientMailboxMutator` (`ADMIN`/`MANAGER` or `OPERATOR`+`LEAD`/`CONTRIBUTOR`) |
| Create / edit / approve sequences | `requireClientEmailSequenceMutator` (same matrix) |
| Queue a sequence batch | `requireClientAccess` + `requireClientEmailSequenceMutator` |
| Reply to inbound message | `requireClientAccess` |
| Mark inbound handled | `requireClientAccess` |

## What we do **not** do

- We do not compare `session.user.email` or `StaffUser.email` against
  `ClientMailboxIdentity.emailNormalized` when listing, selecting, or
  sending from a mailbox at runtime.
- We do not filter mailbox visibility by `createdByStaffUserId`.
- We do not tie a sequence or a reply to a "personal" mailbox.

At **connection** time, the OAuth callback still validates provider truth:

- **Microsoft:** `resolveMicrosoftMailboxOAuthConnection` — if the Microsoft
  user who consented is not the row address, Graph must allow them to open
  that mailbox’s inbox (delegate / shared-mailbox access) before tokens are
  stored; runtime calls use `/users/{row}/…` so sends match the declared mailbox.
- **Google:** `verifyGoogleMailboxOAuthForWorkspaceRow` — same-address OAuth,
  or a successful Gmail `users/{row}/profile` probe (rare without domain-wide
  delegation).

This is not runtime operator-email routing; it prevents storing tokens that
cannot actually reach the workspace mailbox row.
