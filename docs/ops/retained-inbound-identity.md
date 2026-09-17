# Retained Microsoft inbound identities

This repair supports explicitly reviewed pairs of pristine Microsoft raw rows.
It never deletes an original, merges handling, moves claims, changes a provider
ID, or reassociates a reply. Unmarked ambiguity still fails closed.

The nullable `InboundMailboxMessage.supersededByMessageId` identifies the active
row. Installation changes only this column on the redundant row, leaving its
body, metadata, IDs and timestamps intact. Database checks require the same
workspace, mailbox and stable identity, prohibit chains, make retired originals
immutable, and protect the canonical identity. Normal reads exclude retired rows.
The old IDs remain durable tombstones for provider replay.

## Review and deployment order

1. Deploy the migration and every ingestion, claim, handling, send, body-fetch,
   detail and list guard. Verify all serving instances use this release before
   installing any mapping. Migration deployment alone installs no mappings.
2. Run the rollback-only planner with the exact reviewed manifest. It takes the
   stable identity lock, sorted reply provider locks, sorted raw row locks, then
   SHARE NOWAIT locks on the reference tables. Fresh checks require identical
   content, exact IDs/fingerprints, pre-cutoff receipt, no handling/unknown
   metadata, no prior mapping, and zero claims, outbound/reservations, linked or
   plausible replies, nested raw reply references and audit references.
3. Review the canonical choice and original fingerprints. Creation time/ID is a
   deterministic tie-break only after equivalence and zero references are proven.
   Store manifests privately outside the repository; they contain message IDs.
4. Construct a separate installation envelope:

   ```json
   {
     "version": 1,
     "manifest": {
       "version": 1,
       "cutoffBefore": "2026-09-16T00:00:00.000Z",
       "groups": ["exact reviewed groups, each with expectedFingerprints"]
     },
     "canonicalByIdentityHash": {
       "identityHash from the plan": "proposedCanonicalId from the same plan"
     }
   }
   ```

   The illustrated placeholders are not valid input. Each group must contain
   exactly two raw IDs and a fingerprint for each. Every identity hash must have
   one reviewed canonical ID and no additional keys.
5. Validate/hash the envelope locally. This path makes no database connection:

   ```sh
   node --conditions=react-server --import=tsx scripts/install-retained-inbound-identity.ts --manifest /private/installation.json
   ```

6. Only the separately authorized operator may add `--install` and
   `--expected-installation-hash <reviewed hash>`, with an explicit
   `DATABASE_URL`. The installer repeats the same planner checks under locks
   and rejects any changed fingerprint, reference or canonical choice.
   Every pair passes before any write; all mappings and identifier/hash-only
   audit records commit together. There is no automatic retry.

The planner stays rollback-only:

```sh
node --conditions=react-server --import=tsx scripts/plan-inbound-identity-consolidation.ts --manifest /private/exact-manifest.json
```

Busy locks, timeouts and partial transport outcomes are not approval to retry.
After an uncertain commit, inspect the exact stored mappings and audit receipt.
Do not infer failure from a lost response.

## Staff and provider behavior

Known old provider IDs resolve only with a valid matching stable Graph identity.
A mapped ID without valid received time/Message-ID fails closed. A new provider ID
with the same Internet Message-ID but invalid time also fails closed. No content
or sender-only heuristic chooses a survivor.

A wholly new provider ID with no usable Internet Message-ID cannot be identified
as a replay of a particular old row. The existing unmapped provider-ID fallback
still applies to that unidentifiable input. It does not adopt a retained alias or
weaken a stable identity check; later conflicting evidence is held for review.

Stale staff pages cannot claim, handle, send from, or refresh the body of a retired
original. Claims use FOR SHARE, which conflicts with the non-key mapping update.
Handling/sending recheck the active predicate under FOR UPDATE. A body request
already in flight uses a scoped conditional update after its response returns.
DNC remains keyed independently by workspace/address and continues to block
canonical sends.

Provider ingestion without a stable identity acquires its normal ROW EXCLUSIVE
table lock before reading mappings. This prevents an incomplete replay from
reading an uncommitted mapping as absent, waiting behind installation, then
inserting from that stale decision. It rechecks after the installer commits.

## Retention and rollback boundaries

The source rows are the private original snapshots; AuditLog stores only IDs and
hashes. The migration does not put bodies in audit metadata.

There is intentionally no unmap/delete command. Once canonical activity resumes,
restoring two active rows would reintroduce ambiguity or duplicate work. A code
rollback must retain these guards after installation. A mapping rollback requires
another exact, independently reviewed no-new-activity procedure; bypassing the
immutability trigger is not a supported application action. Hard deletion of a
workspace containing retained identities is likewise blocked by these retention
guards and needs separate explicit retention review.

Local validation includes real PostgreSQL lock races, provider replay, untouched
original snapshots, stale actions and in-flight body fetches, DNC preservation,
cursor recovery, and rollback when the audit write fails. Provider HTTP is stubbed;
no test sends mail. Production installation is not part of test or migration.
