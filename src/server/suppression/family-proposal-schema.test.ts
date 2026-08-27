import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FamilyProposalSource,
  FamilyProposalStatus,
} from "@/generated/prisma/enums";

/**
 * The proposal store exists so that a machine guess can never reach the send
 * gate, and so that a rejection is remembered.
 *
 * Two properties are worth holding in a test rather than in a reviewer's memory:
 *
 *   1. The migration is ADDITIVE. `PRODUCTION_PRISMA_MIGRATE` is `true` on this
 *      repository, so merging a migration applies it to the live database of a
 *      paying client the moment CI goes green. A DROP that slipped into this
 *      file would not be caught by a code review that skimmed the .prisma and
 *      assumed the SQL followed. This reads the SQL.
 *
 *   2. `REJECTED` exists. It is the whole fix for the defect found on
 *      2026-08-24: `removeDomainFromFamilyAction` deletes by id with no
 *      tombstone, so a 30-day re-resolution would read the same DNS, derive the
 *      same link, and silently reinstate something an operator refused.
 */

const MIGRATION_DIR = join(
  process.cwd(),
  "prisma/migrations/20260824180000_suppressed_domain_family_proposals",
);

const sql = readFileSync(join(MIGRATION_DIR, "migration.sql"), "utf8");

/** Statements, with comment lines removed so prose cannot trip the checks. */
const statements = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

describe("the family-proposal migration is additive", () => {
  it("contains no destructive statement", () => {
    // Merging this applies it to a live client database. Nothing here may
    // remove or rewrite existing data.
    for (const statement of statements) {
      expect(statement).not.toMatch(/^\s*DROP\b/i);
      expect(statement).not.toMatch(/^\s*TRUNCATE\b/i);
      expect(statement).not.toMatch(/^\s*DELETE\b/i);
      expect(statement).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE|INDEX)\b/i);
    }
  });

  it("adds the three provenance columns as NULLABLE", () => {
    // Null means "a human typed this", which is what every existing row is.
    // A NOT NULL here would fail the migration on a table that already has rows.
    const alter = statements.find((s) => /ALTER TABLE "SuppressedDomainFamily"/i.test(s));
    expect(alter).toBeDefined();
    expect(alter).toMatch(/ADD COLUMN\s+"sourceProposalId"/i);
    expect(alter).toMatch(/ADD COLUMN\s+"discoveredSource"/i);
    expect(alter).toMatch(/ADD COLUMN\s+"discoveredAt"/i);
    expect(alter).not.toMatch(/NOT NULL/i);
  });

  it("does not alter any table other than SuppressedDomainFamily", () => {
    // Guards against the drift-smuggling seen on 2026-08-24, where a generated
    // migration carried six unrelated statements from a pre-existing mismatch.
    const altered = statements
      .filter((s) => /^ALTER TABLE/i.test(s))
      .map((s) => s.match(/^ALTER TABLE "([^"]+)"/i)?.[1])
      .filter(Boolean);
    for (const table of altered) {
      expect(["SuppressedDomainFamily", "SuppressedDomainFamilyProposal"]).toContain(table);
    }
  });

  it("creates exactly the one new table", () => {
    const created = statements
      .filter((s) => /^CREATE TABLE/i.test(s))
      .map((s) => s.match(/^CREATE TABLE "([^"]+)"/i)?.[1]);
    expect(created).toEqual(["SuppressedDomainFamilyProposal"]);
  });

  it("keeps the proposal unique per client, seed and proposed domain", () => {
    // Re-resolution must update the existing row, not raise the same question
    // twice — and must not be able to create a second PENDING row alongside a
    // REJECTED one.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*"SuppressedDomainFamilyProposal"\("clientId", "seedDomain", "proposed/i,
    );
  });
});

/**
 * The tenant migration, held to the same standard.
 *
 * `PRODUCTION_PRISMA_MIGRATE` is `true` here, so merging this applies it to a
 * paying client's live database as soon as CI is green. An enum change is the
 * easiest kind to wave through and one of the harder kinds to undo: PostgreSQL
 * cannot drop an enum value, and REORDERING or RENAMING one silently changes
 * the meaning of every row that already holds it.
 */
const TENANT_MIGRATION = readFileSync(
  join(
    process.cwd(),
    "prisma/migrations/20260827160000_family_proposal_microsoft_tenant/migration.sql",
  ),
  "utf8",
);

const tenantStatements = TENANT_MIGRATION.split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

describe("the MICROSOFT_TENANT migration is additive", () => {
  it("is exactly one statement: appending one enum value", () => {
    expect(tenantStatements).toEqual([
      `ALTER TYPE "FamilyProposalSource" ADD VALUE 'MICROSOFT_TENANT'`,
    ]);
  });

  it("touches no table and drops nothing", () => {
    for (const statement of tenantStatements) {
      expect(statement).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE|UPDATE|ALTER TABLE)\b/i);
      expect(statement).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|TYPE|INDEX|VALUE)\b/i);
    }
  });

  it("does not reorder or rename the two values that already exist", () => {
    // `BEFORE` / `AFTER` would move the new value into the middle, changing
    // what `ORDER BY source` returns for rows nobody touched. `RENAME VALUE`
    // would rewrite the meaning of existing rows outright.
    expect(TENANT_MIGRATION).not.toMatch(/ADD VALUE[^;]*\b(BEFORE|AFTER)\b/i);
    expect(TENANT_MIGRATION).not.toMatch(/RENAME VALUE/i);
    expect(TENANT_MIGRATION).not.toMatch(/\bDMARC_RUA\b|\bSPF_REDIRECT\b/);
  });
});

describe("the proposal states", () => {
  it("has a REJECTED state, which is the tombstone", () => {
    expect(FamilyProposalStatus.REJECTED).toBe("REJECTED");
    expect(Object.keys(FamilyProposalStatus).sort()).toEqual([
      "CONFIRMED",
      "PENDING",
      "REJECTED",
    ]);
  });

  it("offers only the three sources that survived measurement", () => {
    // Certificate Transparency is deliberately absent. Measured 2026-08-24: one
    // GlobalSign OV certificate merged a client with eight unrelated train
    // operators, and all three proposed guards passed it.
    //
    // MICROSOFT_TENANT was added 2026-08-27 and is the signal the client was
    // promised in writing. It survived the same kind of measurement the other
    // two did: it links halifax.co.uk to bankofscotland.co.uk and centrica.com
    // to britishgas.co.uk (which DMARC and SPF cannot see, because both of
    // those pairs publish DMARC to a shared vendor and use SPF `include:`), it
    // cannot reproduce the 216-way outlook.com fan-in because every vendor sits
    // in its own tenant, and its one measured false positive — gmail.com,
    // hotmail.com, live.com and yahoo.co.uk sharing tenant 9cd80435 — is caught
    // by the existing consumer-mailbox guard.
    expect(Object.keys(FamilyProposalSource).sort()).toEqual([
      "DMARC_RUA",
      "MICROSOFT_TENANT",
      "SPF_REDIRECT",
    ]);
  });

  it("has no Certificate Transparency source", () => {
    expect(Object.keys(FamilyProposalSource).join(",")).not.toMatch(/CERT|CT_|TRANSPARENCY/i);
  });
});

describe("migration hygiene", () => {
  /**
   * This asserted "is the NEWEST migration" until 2026-08-27, which made it a
   * tripwire that fired on every unrelated migration anyone added afterwards
   * rather than on the thing it was protecting. What actually matters is the
   * ORDER: this migration must apply after the drift reconcile that precedes
   * it, or it lands against a schema it was not written for.
   */
  it("applies after the schema-drift reconcile it depends on", () => {
    const all = readdirSync(join(process.cwd(), "prisma/migrations"))
      .filter((d) => /^\d{14}_/.test(d))
      .sort();
    const reconcile = all.indexOf("20260824090000_reconcile_schema_migration_drift");
    const proposals = all.indexOf("20260824180000_suppressed_domain_family_proposals");
    expect(reconcile).toBeGreaterThanOrEqual(0);
    expect(proposals).toBeGreaterThan(reconcile);
  });
});
