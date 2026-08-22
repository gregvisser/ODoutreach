# BC-01 — Tenant isolation

> **Frozen. Written by Greg. The agent may read this and may not edit it.**
> If it is wrong, Greg changes it — that is what makes it worth anything.

| | |
|---|---|
| Source | Scope area 5 (shape & tenancy) and area 8 (security) |
| Written | 2026-08-11 |
| Ported | 2026-08-20, from the BOutreach fork into ODoutreach, the repo with real clients |
| Test | `e2e/cross-tenant.spec.ts` |

---

## What this is, in one sentence

A client's data is visible only to staff who are members of that client, and to
nobody else, by any route.

## Why this one is first

ODoutreach isolates tenants in **application code** — `getAccessibleClientIds` scopes
list and report queries, `requireClientAccess` guards mutations. There is no database
row-level security. That means **one missed `where` clause is a cross-tenant leak**, and
nothing but a test will tell you.

It is also the test that proves the RLS work when it lands. Once row-level security is
enabled, this test must still pass — and then must *keep* passing when the application
filter is deliberately broken. That second run is what distinguishes an enforcing policy
from an inert one.

## The rules, with a real example each

Two workspaces exist. Member A belongs only to Client A. Member B belongs only to
Client B. Neither is a super admin — the super admin sees everything by design, which is
why it cannot be the persona under test.

| Given | When | Then |
|---|---|---|
| Member B, signed in | they open the contacts list | they see Client B's contact `recipient-b@example.test` |
| Member B, signed in | they open the contacts list | Client A's contact `recipient@example.test` is **absent** |
| Member B, signed in | they force `?client=<Client A id>` in the URL | Client A's data is still **not** shown |
| Member B, signed in | they open Client A's outbound email detail page by its id | they get **404** |
| Member A, signed in | they open the contacts list | they see Client A's contact and **not** Client B's |

## Exceptions that apply

| # | Situation | What the software does |
|---|---|---|
| E-01 | The persona is a super admin | Sees across all clients. That is the control plane and it is intended — it is why the test uses plain members |
| E-02 | A staff user holds no membership at all | Sees nothing; redirected. Already covered by the existing RBAC journey |
| E-03 | Direct access to another client's record by id | **404, never 403.** A 403 confirms the record exists, which is itself a leak |

## Explicitly NOT covered here

- Whether the *super admin* boundary is correctly drawn — separate case
- The API surface, as distinct from the pages. Permission is routinely enforced in
  list views and forgotten in export, search and reports. **That is a gap, and it is
  named here rather than left implied.**
- Anything about row-level security, which does not yet exist

## How a failure should read

`BC-01 / E-03 failed` should mean: *"a member of one client could reach another
client's record."* That is a sentence you could say to a client, and it is the one that
would end the engagement.
