import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  existing: null as { id: string; name: string } | null,
  memberCount: 0,
  deleted: [] as string[],
}));
const lists = vi.hoisted(() => ({
  resolveExisting: vi.fn(),
  create: vi.fn(),
}));
const importer = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    contactList: {
      findFirst: async () => db.existing,
      delete: async ({ where }: { where: { id: string } }) => {
        db.deleted.push(where.id);
      },
    },
    contactListMember: { count: async () => db.memberCount },
  },
}));
vi.mock("@/server/contacts/contact-lists", async () => {
  const policy = await vi.importActual<typeof import("@/server/contacts/contact-lists-policy")>(
    "@/server/contacts/contact-lists-policy",
  );
  return {
    resolveImportListTarget: policy.resolveImportListTarget,
    resolveImportListForClient: lists.resolveExisting,
    findOrCreateClientContactListByName: lists.create,
  };
});
vi.mock("./person-import", () => ({
  importRocketReachPeopleForClient: importer,
}));

import { runRocketReachListImport } from "./run-import";

const success = {
  ok: true as const,
  imported: 1,
  importedWithoutLookup: 0,
  skippedNoEmail: 0,
  skippedInvalid: 0,
  skippedDuplicate: 0,
  skippedAlreadyKnown: 0,
  flaggedSuppressed: 0,
  creditsUsed: 1,
  lookupsAttempted: 1,
  searchProfileCount: 1,
  errors: [],
  contactListId: "list-1",
  listAttachedAdded: 1,
  listAttachedSkipped: 0,
  universeCreated: 1,
  universeMatched: 0,
};

beforeEach(() => {
  db.existing = null;
  db.memberCount = 1;
  db.deleted = [];
  lists.resolveExisting.mockReset();
  lists.create.mockReset();
  importer.mockReset();
  importer.mockResolvedValue(success);
});

it("imports into an existing list without creating another", async () => {
  lists.resolveExisting.mockResolvedValue({ id: "list-1", name: "Directors" });
  const result = await runRocketReachListImport({
    clientId: "client-1",
    staffId: "staff-1",
    existingListId: "list-1",
    searchBody: { query: { keyword: ["tax"] } },
  });
  expect(result).toMatchObject({ ok: true, contactListId: "list-1", contactListName: "Directors" });
  expect(importer).toHaveBeenCalledWith(expect.objectContaining({ contactListId: "list-1" }));
  expect(lists.create).not.toHaveBeenCalled();
  expect(db.deleted).toEqual([]);
});

it("reuses a list with the same name and does not create a second one", async () => {
  db.existing = { id: "named", name: "Directors" };
  const result = await runRocketReachListImport({
    clientId: "client-1",
    staffId: null,
    newListName: "directors",
    searchBody: { query: { keyword: ["tax"] } },
  });
  expect(result).toMatchObject({ ok: true, contactListId: "named" });
  expect(lists.create).not.toHaveBeenCalled();
});

it("creates a new list only when the import has someone to attach", async () => {
  lists.create.mockResolvedValue({ id: "created", name: "Directors" });
  importer.mockImplementation(async (input: { ensureContactList?: () => Promise<{ id: string; name: string }> }) => {
    const list = await input.ensureContactList?.();
    return { ...success, contactListId: list?.id ?? null };
  });
  const result = await runRocketReachListImport({
    clientId: "client-1",
    staffId: "staff-1",
    newListName: "Directors",
    searchBody: { query: { keyword: ["tax"] } },
  });
  expect(lists.create).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ ok: true, contactListId: "created" });
  expect(db.deleted).toEqual([]);
});

it("deletes a new list that stayed empty", async () => {
  db.memberCount = 0;
  lists.create.mockResolvedValue({ id: "empty", name: "Directors" });
  importer.mockImplementation(async (input: { ensureContactList?: () => Promise<{ id: string; name: string }> }) => {
    const list = await input.ensureContactList?.();
    return { ...success, imported: 0, contactListId: list?.id ?? null };
  });
  const result = await runRocketReachListImport({
    clientId: "client-1",
    staffId: "staff-1",
    newListName: "Directors",
    searchBody: { query: { keyword: ["tax"] } },
  });
  expect(result).toMatchObject({ ok: false });
  expect(db.deleted).toEqual(["empty"]);
});
