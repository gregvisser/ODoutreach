import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  closeIntegrationPool,
  resetIntegrationDatabase,
} from "@/test/integration/database";

import { runContactCsvImport } from "./import-csv";

/**
 * Integration coverage for the CSV import pipeline — run against a real
 * PostgreSQL schema because the behaviour that matters (dedupe against existing
 * rows, universe matching, list attachment, batch bookkeeping) only exists in
 * the interaction between several tables.
 */

const CLIENT_ID = "itest-client-1";
const LIST_ID = "itest-list-1";

async function seedWorkspace(): Promise<void> {
  await prisma.client.create({
    data: {
      id: CLIENT_ID,
      name: "Integration Workspace",
      slug: "integration-workspace",
      status: "ACTIVE",
    },
  });
  await prisma.contactList.create({
    data: { id: LIST_ID, name: "Import Target", clientId: CLIENT_ID },
  });
}

function importCsv(csvText: string) {
  return runContactCsvImport({
    clientId: CLIENT_ID,
    fileName: "contacts.csv",
    csvText,
    contactListId: LIST_ID,
    targetListName: "Import Target",
  });
}

beforeEach(async () => {
  await resetIntegrationDatabase();
  await seedWorkspace();
});

afterAll(async () => {
  await prisma.$disconnect();
  await closeIntegrationPool();
});

describe("runContactCsvImport — happy path", () => {
  it("creates contacts and attaches them to the target list", async () => {
    const { summary, batchId } = await importCsv(
      [
        "email,first_name,last_name,company",
        "ada@example.com,Ada,Lovelace,Analytical Engines",
        "grace@example.com,Grace,Hopper,Navy",
      ].join("\n"),
    );

    expect(summary.totalRows).toBe(2);
    expect(summary.imported).toBe(2);
    expect(summary.skippedInvalid).toBe(0);
    expect(summary.listAttachedAdded).toBe(2);

    const contacts = await prisma.contact.findMany({
      where: { clientId: CLIENT_ID },
      orderBy: { email: "asc" },
    });
    expect(contacts.map((c) => c.email)).toEqual([
      "ada@example.com",
      "grace@example.com",
    ]);
    expect(contacts[0]?.firstName).toBe("Ada");
    expect(contacts[0]?.company).toBe("Analytical Engines");
    expect(contacts.every((c) => c.importBatchId === batchId)).toBe(true);

    const members = await prisma.contactListMember.findMany({
      where: { contactListId: LIST_ID },
    });
    expect(members).toHaveLength(2);
  });

  it("marks the import batch COMPLETED with a summary", async () => {
    const { batchId } = await importCsv("email\nada@example.com");

    const batch = await prisma.contactImportBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    expect(batch.status).toBe("COMPLETED");
    expect(batch.rowCount).toBe(1);
    expect(batch.completedAt).not.toBeNull();
    expect(batch.summary).toMatchObject({ imported: 1, contactListId: LIST_ID });
  });

  it("derives the email domain when no domain column is present", async () => {
    await importCsv("email\nada@Example.COM");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.email).toBe("ada@example.com");
    expect(contact.emailDomain).toBe("example.com");
  });

  it("prefers an explicit domain column over the address domain", async () => {
    await importCsv("email,domain\nada@example.com,override.test");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.emailDomain).toBe("override.test");
  });
});

describe("runContactCsvImport — validation", () => {
  it("skips rows with an invalid email and reports the row number", async () => {
    const { summary } = await importCsv(
      ["email,full_name", "not-an-email,Bad Row", "ada@example.com,Ada Lovelace"].join(
        "\n",
      ),
    );

    expect(summary.imported).toBe(1);
    expect(summary.skippedInvalid).toBe(1);
    expect(summary.errors[0]).toMatch(/^Row 2:/);
    expect(await prisma.contact.count({ where: { clientId: CLIENT_ID } })).toBe(1);
  });

  it("skips a row that has a name but no email", async () => {
    const { summary } = await importCsv("email,full_name\n,Nameless Person");

    expect(summary.imported).toBe(0);
    expect(summary.skippedInvalid).toBe(1);
    expect(summary.errors[0]).toContain("missing email");
  });

  it("caps the reported errors at 12 while still counting them all", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => `bad-${i}`);
    const { summary } = await importCsv(["email", ...rows].join("\n"));

    expect(summary.skippedInvalid).toBe(20);
    expect(summary.errors).toHaveLength(12);
  });

  it("ignores blank lines rather than counting them as rows", async () => {
    const { summary } = await importCsv(
      "email\nada@example.com\n\n   \ngrace@example.com\n",
    );

    expect(summary.totalRows).toBe(2);
    expect(summary.imported).toBe(2);
  });
});

describe("runContactCsvImport — deduplication", () => {
  it("skips a duplicate address within the same file", async () => {
    const { summary } = await importCsv(
      ["email", "ada@example.com", "ADA@example.com"].join("\n"),
    );

    expect(summary.imported).toBe(1);
    expect(summary.skippedDuplicate).toBe(1);
    expect(await prisma.contact.count({ where: { clientId: CLIENT_ID } })).toBe(1);
  });

  it("attaches an already-known contact instead of creating a duplicate", async () => {
    await prisma.contact.create({
      data: { id: "existing-1", clientId: CLIENT_ID, email: "ada@example.com" },
    });

    const { summary } = await importCsv("email\nada@example.com");

    // "attachedExisting", not "skipped" — the preview screen counts it the same way.
    expect(summary.imported).toBe(0);
    expect(summary.attachedExisting).toBe(1);
    expect(summary.listAttachedAdded).toBe(1);
    expect(await prisma.contact.count({ where: { clientId: CLIENT_ID } })).toBe(1);

    const member = await prisma.contactListMember.findFirstOrThrow({
      where: { contactListId: LIST_ID },
    });
    expect(member.contactId).toBe("existing-1");
  });

  it("does not treat a contact without an email as a duplicate of one with an email", async () => {
    // Contact.email is nullable; the dedupe map must simply ignore those rows.
    await prisma.contact.create({
      data: { id: "no-email", clientId: CLIENT_ID, email: null, fullName: "No Email" },
    });

    const { summary } = await importCsv("email\nada@example.com");

    expect(summary.imported).toBe(1);
    expect(summary.attachedExisting).toBe(0);
    expect(await prisma.contact.count({ where: { clientId: CLIENT_ID } })).toBe(2);
  });

  it("backfills the universe link on an existing contact that has none", async () => {
    await prisma.contact.create({
      data: {
        id: "existing-2",
        clientId: CLIENT_ID,
        email: "ada@example.com",
        universeContactId: null,
      },
    });

    await importCsv("email\nada@example.com");

    const contact = await prisma.contact.findUniqueOrThrow({
      where: { id: "existing-2" },
    });
    expect(contact.universeContactId).not.toBeNull();
  });
});

describe("runContactCsvImport — name handling", () => {
  it("splits a full name into first and last when both are absent", async () => {
    await importCsv("email,full_name\nada@example.com,Ada Lovelace");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.firstName).toBe("Ada");
    expect(contact.lastName).toBe("Lovelace");
  });

  it("treats a multi-word surname as the last name", async () => {
    await importCsv("email,full_name\nada@example.com,Ada van der Berg");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.firstName).toBe("Ada");
    expect(contact.lastName).toBe("van der Berg");
  });

  it("uses a single-word full name as the first name only", async () => {
    await importCsv("email,full_name\nada@example.com,Ada");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.firstName).toBe("Ada");
    expect(contact.lastName).toBeNull();
  });

  it("does not overwrite explicit first/last columns", async () => {
    await importCsv(
      "email,full_name,first_name,last_name\nada@example.com,Ignored Name,Ada,Lovelace",
    );

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.firstName).toBe("Ada");
    expect(contact.lastName).toBe("Lovelace");
  });
});

describe("runContactCsvImport — universe attribution", () => {
  it("creates a universe record for a previously unseen address", async () => {
    const { summary } = await importCsv("email\nada@example.com");

    expect(summary.universeCreated).toBe(1);
    expect(summary.universeMatched).toBe(0);
  });

  it("matches the same address across two imports instead of duplicating it", async () => {
    await importCsv("email\nada@example.com");
    const second = await importCsv("email\nada@example.com");

    expect(second.summary.universeCreated).toBe(0);
    expect(second.summary.universeMatched).toBe(1);
  });

  it("links a newly created contact to its universe record", async () => {
    await importCsv("email\nada@example.com");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.universeContactId).not.toBeNull();
  });
});

describe("runContactCsvImport — headers and source", () => {
  it("accepts header aliases and surrounding whitespace", async () => {
    await importCsv("  Email  , First Name \nada@example.com,Ada");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.email).toBe("ada@example.com");
    expect(contact.firstName).toBe("Ada");
  });

  it("records an explicit source column", async () => {
    await importCsv("email,source\nada@example.com,rocketreach");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.source).toBe("ROCKETREACH");
  });

  it("falls back to CSV_IMPORT for an unknown source value", async () => {
    await importCsv("email,source\nada@example.com,carrier-pigeon");

    const contact = await prisma.contact.findFirstOrThrow({
      where: { clientId: CLIENT_ID },
    });
    expect(contact.source).toBe("CSV_IMPORT");
  });
});

describe("runContactCsvImport — failure handling", () => {
  it("marks the batch FAILED and rethrows when the target list is missing", async () => {
    const before = await prisma.contactImportBatch.count();

    await expect(
      runContactCsvImport({
        clientId: CLIENT_ID,
        fileName: "contacts.csv",
        csvText: "email\nada@example.com",
        contactListId: "does-not-exist",
        targetListName: "Missing List",
      }),
    ).rejects.toThrow();

    const batches = await prisma.contactImportBatch.findMany({
      orderBy: { createdAt: "desc" },
    });
    expect(batches.length).toBe(before + 1);
    expect(batches[0]?.status).toBe("FAILED");
    expect(batches[0]?.errorMessage).toBeTruthy();
  });
});
