import { beforeEach, describe, expect, it, vi } from "vitest";

import { upsertContactUniverseAndRecordSource } from "@/server/contacts/contact-universe";
import type { DbClient } from "@/server/contacts/contact-universe";

describe("upsertContactUniverseAndRecordSource", () => {
  const findUnique = vi.fn();
  const findFirst = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const sourceCreate = vi.fn();

  const db = {
    contactUniverse: { findUnique, findFirst, create, update },
    contactUniverseSource: { create: sourceCreate },
  } as unknown as DbClient;

  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
    create.mockReset();
    update.mockReset();
    sourceCreate.mockReset();
  });

  it("creates a new universe row and source when email is unseen", async () => {
    findUnique.mockResolvedValueOnce(null);
    create.mockResolvedValueOnce({ id: "u-new" });
    sourceCreate.mockResolvedValueOnce({});

    const r = await upsertContactUniverseAndRecordSource(db, {
      emailNormalized: "new@example.com",
      firstSeenClientId: "client-1",
      firstSeenSourceType: "CSV_IMPORT",
      sourceLabel: "file.csv → List A",
      importBatchId: "batch-1",
    });

    expect(r).toEqual({ universeId: "u-new", created: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(sourceCreate).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("updates an existing universe row matched by email and records another source", async () => {
    findUnique.mockResolvedValueOnce({
      id: "u-old",
      linkedinUrlNormalized: null,
      mobilePhoneNormalized: null,
      firstName: null,
      lastName: null,
      fullName: null,
      jobTitle: null,
      companyName: null,
      location: null,
      city: null,
      country: null,
      industry: null,
      sourceSummary: "prior",
      emailNormalized: "dup@example.com",
    });
    update.mockResolvedValueOnce({});
    sourceCreate.mockResolvedValueOnce({});

    const r = await upsertContactUniverseAndRecordSource(db, {
      emailNormalized: "dup@example.com",
      companyName: "Acme",
      firstSeenClientId: "client-2",
      firstSeenSourceType: "ROCKETREACH",
      sourceLabel: "RocketReach → List B",
    });

    expect(r).toEqual({ universeId: "u-old", created: false });
    expect(update).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(sourceCreate).toHaveBeenCalledTimes(1);
  });
});
