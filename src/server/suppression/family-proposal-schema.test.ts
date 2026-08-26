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

describe("the proposal states", () => {
  it("has a REJECTED state, which is the tombstone", () => {
    expect(FamilyProposalStatus.REJECTED).toBe("REJECTED");
    expect(Object.keys(FamilyProposalStatus).sort()).toEqual([
      "CONFIRMED",
      "PENDING",
      "REJECTED",
    ]);
  });

  it("offers only the two sources that survived measurement", () => {
    // Certificate Transparency is deliberately absent. Measured 2026-08-24: one
    // GlobalSign OV certificate merged a client with eight unrelated train
    // operators, and all three proposed guards passed it.
    expect(Object.keys(FamilyProposalSource).sort()).toEqual(["DMARC_RUA", "SPF_REDIRECT"]);
  });

  it("has no Certificate Transparency source", () => {
    expect(Object.keys(FamilyProposalSource).join(",")).not.toMatch(/CERT|CT_|TRANSPARENCY/i);
  });
});

describe("migration hygiene", () => {
  // The original form of this test asserted that the family-proposals
  // migration was literally the LAST directory on disk. That caught the
  // real hazard once — a migration back-dated ahead of its dependencies
  // applies in the wrong order — but it also failed on the next migration
  // anyone added, for no reason. Restated here as the property that was
  // actually meant, so it keeps working as migrations accumulate.
  const migrations = readdirSync(join(process.cwd(), "prisma/migrations"))
    .filter((d) => /^\d{14}_/.test(d))
    .sort();

  it("applies after the schema-drift reconciliation it depends on", () => {
    const proposals = migrations.indexOf(
      "20260824180000_suppressed_domain_family_proposals",
    );
    const drift = migrations.indexOf(
      "20260824090000_reconcile_schema_migration_drift",
    );
    expect(drift).toBeGreaterThanOrEqual(0);
    expect(proposals).toBeGreaterThan(drift);
  });

  it("has strictly increasing, unique timestamps — nothing back-dated", () => {
    const stamps = migrations.map((d) => d.slice(0, 14));
    expect(new Set(stamps).size).toBe(stamps.length);
    expect([...stamps].sort()).toEqual(stamps);
  });
});
