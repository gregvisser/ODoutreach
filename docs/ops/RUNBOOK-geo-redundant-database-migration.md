# Runbook — migrate the production database to a geo-redundant server

**Status: NOT EXECUTED. This is a plan for Greg to read, schedule and watch.**
Nothing in it has been run. Written 2026-08-24.

---

## Why we are doing this

`pg-opensdoors-outreach-prod-01` has **no high-availability configuration**, and
Microsoft's documented default is that backup storage for a server with no HA is
**locally redundant — the same datacentre**. Its storage is `Premium_LRS`.

So today, **a single datacentre failure can take the server and its backups
together**, and there is no cross-region copy of fourteen clients' data. Backup
retention is 7 days, point-in-time, region-local.

Geo-redundant backup **cannot be switched on afterwards**. Microsoft states it
twice, verbatim:

> "You can configure geo-redundant storage for backup only during server
> creation. After a server is provisioned, you can't change the backup storage
> redundancy option."

> "**Important** You can configure geo-redundant backup only when you create the
> server."

— <https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-backup-restore>

A new server is therefore the only route. **It costs nothing extra per month**:
Azure gives 100% of provisioned storage as free backup allowance (32 GB here),
geo-redundancy doubles the backup copy to about 14.5 GB, and that is still under
the free allowance. Same compute SKU.

---

## Question the brief asked: can a point-in-time restore do this? **No.**

This was worth checking, because a PITR would have been far simpler than
dump-and-restore. It cannot. Microsoft:

> "It's created with the source server's configuration for the pricing tier,
> compute generation, number of virtual cores, storage size, backup retention
> period, **and backup redundancy option**."

A PITR **inherits** the source's redundancy, so restoring this server produces
another locally-redundant one. The only related control goes the wrong way —
during a *geo*-restore you may "**remove** geo-redundant backup from the restored
server", never add it.

**Conclusion: create a new server with geo-redundancy enabled at creation, and
migrate the data with `pg_dump` / `pg_restore`.**

---

## What the server looks like today

Read from Azure on 2026-08-24.

| | |
|---|---|
| Name | `pg-opensdoors-outreach-prod-01` |
| Resource group | `rg-opensdoors-outreach-prod` |
| Region | UK South, availability zone 1 |
| Version | PostgreSQL **16** |
| SKU | `Standard_B2s` (**Burstable**) |
| Storage | 32 GB, `Premium_LRS` |
| Data in use | **4.56 GB** |
| Backup in use | **7.25 GB** |
| Backup retention | 7 days · geo-redundant **Disabled** |
| High availability | **Disabled** |
| Public network access | Enabled · no VNet, no private DNS zone |
| Admin login | `odoutreach` |
| Auth | password **and** Microsoft Entra, tenant `c3382ead-…3b8f` |
| Maintenance window | system-managed (`customWindow: Disabled`) |
| Application database | `opensdoors_outreach` |
| Firewall rules | one: `AllowAllAzureServicesAndResourcesWithinAzureIps` (0.0.0.0) |

---

## What does NOT come across automatically

**This is where migrations fail — not the data, the surroundings.** Every item
below must be recreated by hand on the new server and ticked off.

| Item | Today | Action |
|---|---|---|
| **Firewall rules** | `AllowAllAzureServicesAndResourcesWithinAzureIps` — this is what lets App Service connect | **Recreate first, before anything else.** Without it the app cannot reach the new server at all |
| **Entra authentication** | `activeDirectoryAuth: Enabled`, tenant `c3382ead-…` | Re-enable, and re-add any Entra admin. Note the docs warn that restoring roles for Entra users errors unless you are signed in as an Entra Admin |
| **Password auth + admin password** | `passwordAuth: Enabled`, admin `odoutreach` | Set at creation. **The password is not recoverable from the old server** — it exists only inside `DATABASE_URL` |
| **Roles and their passwords** | any non-admin roles in the database | `pg_dumpall --roles-only` does not work on a managed server as a non-superuser. Enumerate with `\du` and recreate by hand. Expect and ignore the documented `role "azure_pg_admin" already exists` class of errors |
| **Extensions** | check `\dx` in `opensdoors_outreach` | Extensions must be allow-listed via the `azure.extensions` server parameter **before** restore, or `CREATE EXTENSION` fails mid-restore |
| **Server parameters** | no user overrides found beyond Azure-managed defaults | Re-check `--query "[?source=='user-override']"` on the day; if the list is still empty, nothing to do |
| **Maintenance window** | system-managed | Optional. Match it if you care |
| **HA** | Disabled | Decide deliberately. Enabling zone-redundant HA would *also* move backups off locally-redundant — worth considering while you are creating a server anyway |
| **Backup retention** | 7 days | Consider raising to 14–35 while you are here; it is free up to the storage allowance |

---

## Everywhere the connection string lives

**A missed one means the app keeps writing to the OLD server and nobody notices
until the data has diverged.** Checked 2026-08-24:

1. **Azure App Service application setting `DATABASE_URL`** on
   `app-opensdoors-outreach-prod`. This is the live one the app reads.
2. **GitHub secret `PRODUCTION_DATABASE_URL`** — used by
   `deploy-production.yml` for the `Prisma migrate deploy (production database)`
   step, which runs **before** the Azure login step. If this still points at the
   old server, **every future deploy migrates the old database** while the app
   runs against the new one. This is the most dangerous single item in the list.
3. Any local `.env` on a developer machine (gitignored, not in the repo).
4. Anywhere Greg has pasted it to run `scripts/production-report.mjs`
   (`PRODUCTION_DATABASE_URL` in a shell). Clear those shells.

There is no other reference in the repo — `DATABASE_URL` appears only in
`prisma.config.ts` (reads the env var) and in CI as a compile-only placeholder.

---

## The sequence

Do this **outside 07:00–18:00 UK, Monday–Friday**, which is when both crons run.
A weekend evening is ideal: no sends, no reply sync.

### Phase 1 — prepare (no downtime, fully reversible)
1. Take a **manual snapshot point** — note the exact UTC time; PITR on the old
   server is your rollback for the whole operation.
2. Create the new server: same region, same version (**16**), same SKU, same
   storage, **geo-redundant backup ENABLED at creation**. Name it something
   obviously new, e.g. `pg-opensdoors-outreach-prod-02`.
3. **Verify geo-redundancy is actually on** before going further:
   `az postgres flexible-server show … --query "backup.geoRedundantBackup"`
   must return `Enabled`. Do not take the creation form's word for it.
4. Recreate the firewall rule, Entra auth and any extensions allow-list.
5. Create the empty `opensdoors_outreach` database.

### Phase 2 — rehearse (no downtime, still reversible)
6. `pg_dump` the old database and `pg_restore` into the new one **while the app
   is still running against the old**. This is a rehearsal: it proves the dump
   and restore work and gives you a real duration to plan with.
7. Note how long it took. At 4.56 GB expect **10–30 minutes**; if it takes
   dramatically longer, stop and find out why before scheduling the real run.
8. Throw the rehearsal data away (drop and recreate the database) so the real
   cutover starts clean.

### Phase 3 — cutover (**this is the downtime**)
9. **Stop the writers.** Disable the two scheduled workflows
   (`process-outbound-queue.yml`, `sync-replies.yml`) and stop the App Service.
   Nothing may write to the old database from here.
10. Final `pg_dump` from old → `pg_restore` into new.
11. **Verify before switching anything** (see below).
12. Update `DATABASE_URL` in App Service **and** `PRODUCTION_DATABASE_URL` in
    GitHub secrets. Both. In the same sitting.
13. Start the App Service. Re-enable the two workflows.

### Phase 4 — prove it
14. `GET /api/health` → `{"ok":true,"checks":{"database":"ok"}}`
15. `GET /api/build-info` → still the expected commit
16. Sign in and load a client workspace; confirm contacts and activity render
17. Confirm a **write** works, not just a read — the surest cheap check is to
    add and then remove a do-not-contact entry on a test workspace
18. Re-run `node scripts/production-report.mjs` against the **new** server and
    confirm the row counts match what you saw at step 11

### Verification at step 11 — before cutover, not after
Compare old vs new on the biggest tables. They must match exactly:

```sql
SELECT 'Contact' t, count(*) FROM "Contact"
UNION ALL SELECT 'OutboundEmail', count(*) FROM "OutboundEmail"
UNION ALL SELECT 'InboundMailboxMessage', count(*) FROM "InboundMailboxMessage"
UNION ALL SELECT 'InboundReply', count(*) FROM "InboundReply"
UNION ALL SELECT 'ContactUniverse', count(*) FROM "ContactUniverse"
UNION ALL SELECT 'SuppressedEmail', count(*) FROM "SuppressedEmail"
UNION ALL SELECT 'SuppressedDomain', count(*) FROM "SuppressedDomain"
UNION ALL SELECT 'Client', count(*) FROM "Client"
UNION ALL SELECT 'ClientMailboxIdentity', count(*) FROM "ClientMailboxIdentity"
ORDER BY 1;
```

Also confirm `SELECT max("sentAt") FROM "OutboundEmail"` matches, and that
`_prisma_migrations` has the same row count — a short migrations table means the
restore missed it and the next deploy will try to re-apply everything.

---

## Rollback

**It stays reversible until step 12.** Up to and including step 11, the old
server is untouched and still authoritative — abandon the new server and restart
the app; nothing has changed.

**Step 12 is the point of no return in practice**, not because it cannot be
undone but because from the moment the app starts writing to the new server, any
write you take is a write the old server does not have.

- **Something wrong within ten minutes of step 13:** stop the App Service,
  disable both workflows, point `DATABASE_URL` and `PRODUCTION_DATABASE_URL`
  back at the old server, restart. You lose only whatever was written in those
  minutes, and with the crons disabled that is likely nothing.
- **Something wrong later, after real writes have landed on the new server:**
  do **not** just point back. You would silently lose everything written since
  cutover. Stop, take a fresh dump of the new server, and decide deliberately.
- **Catastrophe:** PITR the old server to the timestamp from step 1.

---

## Do not delete the old server

**`pg-opensdoors-outreach-prod-01` stays until Greg says otherwise**, well after
the new one is proven. It costs a few pounds a month and it is the rollback.
Stopping it is acceptable once you are confident; deleting it is not, and note
that deleting a server deletes all its backups with it and they cannot be
recovered.

---

## Honest estimate

| | |
|---|---|
| Preparation (phases 1–2) | 1–2 hours, no downtime, do it on a different day |
| **Downtime (phase 3)** | **30–60 minutes** for 4.56 GB, most of it dump and restore |
| Verification (phase 4) | 20 minutes |

**What makes it longer:** an extension that is not allow-listed and fails
mid-restore; role or ownership errors needing the documented workarounds; the
Entra admin step needing a specific signed-in identity; discovering at step 11
that counts do not match and having to redo the dump. **The rehearsal in phase 2
exists to find all of those before the clock is running.**

**What makes it shorter:** nothing. Do not skip the rehearsal to save an hour.

---

## What this does and does not buy

**Buys:** a cross-region copy of the data, so a UK South failure is survivable.

**Does not buy:** point-in-time recovery in the paired region. Microsoft is
explicit that geo-restore recovers to "the last available backup data at the
remote region", with **up to one hour of RPO**, and "PITR of geo-redundant
backups isn't available". Cross-region recovery is coarse. It is still the
difference between losing an hour and losing everything.
