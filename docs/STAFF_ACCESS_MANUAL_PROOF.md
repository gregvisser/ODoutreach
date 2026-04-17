# Staff Access — production manual proof (operator runbook)

Use this checklist on **https://opensdoors.bidlow.co.uk** after deployments that touch Staff Access. Have **two browsers or profiles**: one signed in as an **ADMIN** `StaffUser`, one for the **test guest** (non-admin role).

**Prerequisites**

- Test mailbox receives external email (guest invite).
- Invitee’s domain is allowed if `STAFF_EMAIL_DOMAINS` is set in production.
- Graph app permissions (`User.Invite.All`, `User.Read.All`) are consented.

---

## 1. Invite non-admin (admin browser)

1. Sign in as **ADMIN** → **Settings** → **Staff Access** (`/settings/staff-access`).
2. Enter the test user’s **work email**, choose **OPERATOR** (or MANAGER / VIEWER — not ADMIN), leave **Active** checked, click **Send invitation**.
3. **Expect:** green banner with success text; new row in the staff table with invite metadata; **`Recent activity`** shows a **`CREATE`** row with **Detail** containing `Invitation sent` and the invitee email.

---

## 2. Accept Microsoft guest invite (guest)

1. Open the **Microsoft invitation** email; accept / redeem the guest invitation for the Bidlow tenant (follow Entra UX).
2. Optional: if status lags in the app, as **ADMIN** use **Sync invite status** for that row, then confirm **Invite status** and **Recent activity** ( **`SYNC`** / **`UPDATE`** as applicable).

---

## 3. Sign in as guest (guest browser)

1. Go to **`/sign-in`**, complete **Microsoft** sign-in and MFA as enforced by the tenant.
2. **Expect:** dashboard loads; user is the pre-provisioned `StaffUser` (row created at invite time).

---

## 4. Confirm non-admin cannot manage staff (guest browser)

1. Navigate to **Settings** → **Staff Access** (or open `/settings/staff-access` directly).
2. **Expect:** message that **only administrators** can manage staff; **no** invite table or **Recent activity** (admin UI must not render for non-admin).

---

## 5. Role change (admin browser)

1. On **Staff Access**, locate the test user; change role via dropdown and **Save role**.
2. **Expect:** success banner (or “Saved.”); table shows new role; **`Recent activity`** shows **`UPDATE`** with **Detail** `Role <from> → <to>`.

---

## 6. Deactivate / reactivate (admin browser)

1. Click **Deactivate** for the test user.
2. **Expect:** banner success; **Active** = No; audit **Detail** `Active set to inactive`.
3. In the **guest** browser, refresh or navigate — **expect** loss of normal app access (inactive staff handling / staff inactive screen as implemented).
4. As **ADMIN**, click **Activate** for the same user.
5. **Expect:** guest can use the app again; **`Recent activity`** shows **`UPDATE`** with **Detail** `Active set to active` (or inactive for the first action).

---

## 7. Recent activity confirmation (admin browser)

After each significant step above, scroll to **Recent activity** (last **40** entries, UTC timestamps).

**Expect** rows that align with actions:

| Flow | Typical `Action` column | Check `Detail` for |
|------|-------------------------|-------------------|
| Invite | `CREATE` | `Invitation sent → …` |
| Resend | `UPDATE` | `Invitation resent → …` |
| Sync | `SYNC` | `Invite status synced …` |
| Role | `UPDATE` | `Role X → Y` |
| Active | `UPDATE` | `Active set to active/inactive` |

**Actor** = admin email; **Target** = affected staff email.

---

## 8. Failure cues (no DB required)

- **Banner** (red): server action error (permissions, Graph, last-admin guard, domain policy).
- **Table:** invite state and timestamps.
- **Recent activity:** whether an audit row appeared for the attempted action.

If Graph or consent fails, fix tenant/app registration, then **retry** the action; confirm a new **Recent activity** row when successful.

---

## Reference

- Architecture and env vars: [STAFF_ACCESS.md](./STAFF_ACCESS.md)
