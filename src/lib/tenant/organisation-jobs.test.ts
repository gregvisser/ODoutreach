import { describe, expect, it } from "vitest";

import {
  bucketByOrganisation,
  combineProcessQueueResults,
  organisationJobsStatus,
  runOrganisationJobs,
  type OrganisationJobTarget,
} from "./organisation-jobs";

const opensDoors: OrganisationJobTarget = {
  organisationId: "org_opensdoors",
  slug: "opensdoors",
  status: "ACTIVE",
  clientIds: ["morson"],
};

const northwind: OrganisationJobTarget = {
  organisationId: "org_northwind",
  slug: "northwind",
  status: "ACTIVE",
  clientIds: ["contoso"],
};

describe("runOrganisationJobs", () => {
  it("runs the next organisation when the first one throws", async () => {
    const seen: string[] = [];
    const run = await runOrganisationJobs([opensDoors, northwind], async (target) => {
      seen.push(target.slug);
      if (target.slug === "opensdoors") throw new Error("postgres://opensdoors:secret@db/prod mailbox dead");
      return { claimed: 2, completed: 2, errors: [] as string[] };
    });

    expect(seen).toEqual(["opensdoors", "northwind"]);
    expect(run.everyActiveFailed).toBe(false);
    expect(run.organisations[0]).toMatchObject({
      slug: "opensdoors",
      disposition: "failed",
      ok: false,
    });
    expect(run.organisations[0]?.error).not.toMatch(/secret|postgres:\/\//);
    expect(run.organisations[1]).toMatchObject({
      slug: "northwind",
      disposition: "ran",
      ok: true,
      result: { claimed: 2, completed: 2 },
    });
  });

  it("fails the run only when every active organisation threw", async () => {
    const run = await runOrganisationJobs([opensDoors], async () => {
      throw new Error("queue claim failed");
    });
    expect(run.everyActiveFailed).toBe(true);
    expect(organisationJobsStatus(run.everyActiveFailed, 200)).toBe(500);
  });

  it("keeps a partial OpensDoors batch on 207", () => {
    expect(organisationJobsStatus(false, 207)).toBe(207);
    expect(organisationJobsStatus(false, 200)).toBe(200);
  });

  it("does not ask a suspended organisation to send", async () => {
    const suspended: OrganisationJobTarget = { ...northwind, status: "SUSPENDED" };
    const seen: string[] = [];
    const run = await runOrganisationJobs([opensDoors, suspended], async (target) => {
      seen.push(target.slug);
      return { claimed: 1, completed: 1, errors: [] as string[] };
    });
    expect(seen).toEqual(["opensdoors"]);
    expect(run.organisations[1]).toMatchObject({ slug: "northwind", disposition: "skipped", ok: true });
    expect(run.everyActiveFailed).toBe(false);
  });

  it("still runs a suspended organisation when the caller opts out of the skip", async () => {
    const suspended: OrganisationJobTarget = { ...northwind, status: "SUSPENDED" };
    const run = await runOrganisationJobs(
      [suspended],
      async () => "synced",
      { skipSuspended: false },
    );
    expect(run.organisations[0]).toMatchObject({ disposition: "ran", result: "synced" });
  });

  it("marks a returned result not ok when the caller says the batch failed", async () => {
    const run = await runOrganisationJobs(
      [opensDoors],
      async () => ({ claimed: 1, completed: 0, errors: ["synthetic failure"] }),
      { succeeded: (result) => result.errors.length === 0 },
    );
    expect(run.everyActiveFailed).toBe(false);
    expect(run.organisations[0]).toMatchObject({ disposition: "ran", ok: false });
  });
});

describe("combineProcessQueueResults", () => {
  it("keeps the successful organisation's sends beside the failed organisation's error", () => {
    const combined = combineProcessQueueResults([
      {
        organisationId: "org_northwind",
        slug: "northwind",
        disposition: "failed",
        ok: false,
        error: "claim failed",
      },
      {
        organisationId: "org_opensdoors",
        slug: "opensdoors",
        disposition: "ran",
        ok: true,
        result: { claimed: 1, completed: 1, errors: [] },
      },
    ]);
    expect(combined).toEqual({
      claimed: 1,
      completed: 1,
      errors: ["northwind: claim failed"],
    });
  });
});

describe("bucketByOrganisation", () => {
  it("keeps each organisation's items in the order they were given", () => {
    const buckets = bucketByOrganisation(
      [
        { id: "b", organisationId: "org_b", slug: "beta", status: "ACTIVE" as const },
        { id: "a", organisationId: "org_a", slug: "alpha", status: "SUSPENDED" as const },
        { id: "b2", organisationId: "org_b", slug: "beta", status: "ACTIVE" as const },
      ],
      (item) => item,
    );
    expect(buckets.map((bucket) => bucket.slug)).toEqual(["beta", "alpha"]);
    expect(buckets[0]?.items.map((item) => item.id)).toEqual(["b", "b2"]);
  });
});
