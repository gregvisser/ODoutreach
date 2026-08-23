# BC-01 — Workspace data isolation

> **Frozen. Written by Greg. The agent may read this and may not edit it.**
> If it is wrong, Greg changes it — that is what makes it worth anything.

| | |
|---|---|
| Source | Scope area 5 (shape & tenancy) and area 8 (security) |
| Written | 2026-08-11 |
| Ported | 2026-08-20, from the BOutreach fork into ODoutreach, the repo with real clients |
| **Rewritten** | **2026-08-23 — see "What changed and why"** |
| Test | `e2e/cross-tenant.spec.ts` |

---

## What this is, in one sentence

Every record belongs to exactly one client workspace, and no operation on one
workspace may ever read, write, count or send to a record belonging to another.

## What changed and why, 2026-08-23

The first version of this spec asserted a different thing: that **staff** are
scoped to particular clients and must not see the others. That was wrong about
the product, so the spec changed rather than the code.

Greg, 2026-08-23:

> *"We can see each other's prospects, yes — but the OpensDoors team will use the
> system to do outreach for their customers. So it's an internal tool to do cold
> outreach."*

OpensDoors is an **agency**. Its staff run outreach across all of its customers,
and `getAccessibleClientIds` returning every live client is the intended design,
not a defect. The old spec's rules were therefore unsatisfiable by design, and
the tests were red for a reason that was never going to be fixed.

**But the rule was protecting two different things, and only one of them was
wrong.** Deleting it outright would have removed the half that matters most:

| | Status |
|---|---|
| **ACCESS** isolation between staff | **Deliberately absent.** A decision, recorded below with its reversal trigger. |
| **DATA** isolation between workspaces | **Must hold absolutely.** This is what the spec now governs. |

A staff member reading a list they were always going to be allowed to read is
awkward. **Emailing Client B's prospects on Client A's behalf is an incident.**
The first version tested the awkward thing and left the incident unguarded.

## The access decision, and what reverses it

Every active staff member can open every LIVE client workspace.
`getAccessibleClientIds` does not consult `ClientMembership`; the only wall it
builds is live-versus-soft-deleted. That is intended for a single agency
operating its own instance.

**This decision reverses the day any of these becomes true:**

1. A second agency shares the instance.
2. OpensDoors needs a staff member scoped to one client — a contractor, a
   client-side user, or a freelancer.
3. A client contractually requires that only named individuals see their data.

**`ClientMembership` already exists and is inert.** It is written by the
membership actions and read today only by three mutator-access helpers. It is
the mechanism for that day: scoping `getAccessibleClientIds` to it is a small
change to one function, and the cost is in the 64 call sites that must then be
re-checked, not in the function.

**Selling a shared instance to two agencies who must not see each other is a
rebuild, not a feature.** Nothing about this product may be sold on a claim of
tenant isolation between staff users.

## The rules, with a real example each

Two workspaces exist. Both are live. Any active staff member may open either —
that is the point above, not a violation.

| # | Given | When | Then |
|---|---|---|---|
| R-1 | A contact belongs to Client B | anyone views Client A's contacts, lists or universe rows **for Client A** | Client B's contact does not appear in Client A's records |
| R-2 | A send is composed for Client A | the recipient, sequence, template or enrolment belongs to Client B | the send is **blocked**, not sent to the wrong list |
| R-3 | Client A has suppressed an address | Client B sends to that same address | Client B's send **proceeds** — suppression is per client, see E-04 |
| R-4 | A reply arrives in a mailbox | it is ingested | it attaches to the client whose mailbox received it, and to an outbound **in that same client** — or it is not stored as a reply at all |
| R-5 | Client A has sent mail | Client B's activity and reporting figures are read | Client A's sends are **not** counted in Client B's numbers |
| R-6 | A workspace is soft-deleted, or an id does not exist | anyone opens it by id | **404**, never 403, and never a rendered record |

## Exceptions that apply

| # | Situation | What the software does |
|---|---|---|
| E-01 | The persona is a super admin | Sees across all clients, plus soft-deleted workspaces. Intended — it is the control plane |
| E-02 | A staff user holds no `ClientMembership` | **Sees every live workspace, exactly like any other staff member.** Membership is not consulted on any read path. This exception is stated because the previous version of this spec claimed the opposite — verified false on 2026-08-23 |
| E-03 | The identity is not an active staff user | Sees nothing. An unknown Entra identity resolves to no `StaffUser` and is redirected to `/sign-in`. **This is the authentication wall, and it is the one that actually holds** |
| E-04 | Client A suppressed an address; Client B has not | Client B may still contact them. **Deliberate**: suppression is keyed `@@unique([clientId, email])`, an opt-out under PECR runs to the sender, and a global list would leak the fact that Client A contacted someone into Client B's workspace |
| E-05 | An address hard-bounces for Client A | Suppressed **for Client A only** — same per-client key. Noted as a tension, not a defect: a hard bounce is a deliverability fact and arguably belongs to everyone, but making it global is a cross-workspace data flow and needs deciding, not assuming |
| E-06 | The same mailbox address is connected to two workspaces | Permitted — `@@unique([clientId, emailNormalized])` is per client. Each workspace stores its **own copy of the raw inbound message**, including full body text. No `InboundReply` is created without a matching outbound in that client, so replies do not cross; the raw message store does. **Do not connect one mailbox to two workspaces unless that is intended** |

## Explicitly NOT covered here

- Whether the *super admin* boundary is correctly drawn — separate case.
- The API surface, as distinct from the pages. Permission is routinely enforced
  in list views and forgotten in export, search and reports. **That is a gap, and
  it is named here rather than left implied.**
- Row-level security, which does not exist. Every rule above is enforced in
  application code, so one missed `where` clause is a breach of it.
- The cross-client `ContactUniverse` warehouse, which is deduplicated across all
  clients **by design** and is therefore not covered by R-1.

## How a failure should read

`BC-01 / R-2 failed` should mean: *"we composed an email for one client and it
resolved a recipient belonging to another."* That is a sentence you could say to
a client, and it is the one that would end the engagement.
