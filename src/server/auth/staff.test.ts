import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type StaffRow = {
  id: string;
  entraObjectId: string;
  email: string;
  displayName: string | null;
  role: "ADMIN" | "MANAGER" | "OPERATOR" | "VIEWER";
  isActive: boolean;
  guestInvitationState: "NONE" | "PENDING" | "ACCEPTED";
  invitedAt: Date | null;
  invitationLastSentAt: Date | null;
  invitedById: string | null;
  graphInvitationId: string | null;
  graphInvitedUserObjectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const { authMock, tx, rows } = vi.hoisted(() => {
  const rows: StaffRow[] = [];
  const tx = {
    staffUser: {
      findUnique: vi.fn(
        async ({ where }: { where: { entraObjectId?: string; email?: string; id?: string } }) => {
          if (where.entraObjectId) {
            return rows.find((row) => row.entraObjectId === where.entraObjectId) ?? null;
          }
          if (where.email) {
            return rows.find((row) => row.email === where.email) ?? null;
          }
          if (where.id) {
            return rows.find((row) => row.id === where.id) ?? null;
          }
          return null;
        },
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { graphInvitedUserObjectId?: string } }) =>
          rows.find((row) => row.graphInvitedUserObjectId === where.graphInvitedUserObjectId) ??
          null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<StaffRow>;
        }) => {
          const row = rows.find((candidate) => candidate.id === where.id);
          if (!row) throw new Error("missing row");
          Object.assign(row, data);
          return row;
        },
      ),
    },
  };

  return {
    authMock: vi.fn(),
    tx,
    rows,
  };
});

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  },
}));

import { gateStaffAccess, requireStaffUser } from "./staff";

function staffRow(overrides: Partial<StaffRow> = {}): StaffRow {
  const now = new Date("2026-05-19T00:00:00.000Z");
  return {
    id: "staff-1",
    entraObjectId: "oid-existing",
    email: "staff@example.com",
    displayName: null,
    role: "OPERATOR",
    isActive: true,
    guestInvitationState: "NONE",
    invitedAt: null,
    invitationLastSentAt: null,
    invitedById: null,
    graphInvitationId: null,
    graphInvitedUserObjectId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function signInSession(overrides: { id?: string; email?: string | null; name?: string | null } = {}) {
  authMock.mockResolvedValue({
    user: {
      id: overrides.id ?? "oid-existing",
      email: overrides.email ?? "staff@example.com",
      name: overrides.name ?? "Staff User",
    },
  });
}

describe("staff access gate", () => {
  beforeEach(() => {
    rows.length = 0;
    vi.clearAllMocks();
    delete process.env.STAFF_EMAIL_DOMAINS;
  });

  it("enforces the configured domain even through requireStaffUser", async () => {
    rows.push(staffRow());
    signInSession();
    process.env.STAFF_EMAIL_DOMAINS = "opendoors.test";
    await expect(requireStaffUser()).rejects.toThrow("STAFF_EMAIL_NOT_ALLOWED");
  });

  it("allows an active staff user after Microsoft auth", async () => {
    rows.push(staffRow());
    signInSession();

    await expect(requireStaffUser()).resolves.toMatchObject({
      id: "staff-1",
      email: "staff@example.com",
    });
  });

  it("activates a pending invitation by normalized email and saves the Entra object id", async () => {
    rows.push(
      staffRow({
        entraObjectId: "placeholder-oid",
        email: "invited@example.com",
        guestInvitationState: "PENDING",
      }),
    );
    signInSession({ id: "real-oid", email: " Invited@Example.COM " });

    await expect(gateStaffAccess()).resolves.toMatchObject({ status: "ok" });
    expect(rows[0]).toMatchObject({
      entraObjectId: "real-oid",
      email: "invited@example.com",
      guestInvitationState: "ACCEPTED",
    });
  });

  it("activates a pending Graph invitation by invited guest object id when UPN differs", async () => {
    rows.push(
      staffRow({
        entraObjectId: "placeholder-oid",
        email: "invited@example.com",
        guestInvitationState: "PENDING",
        graphInvitedUserObjectId: "guest-oid",
      }),
    );
    signInSession({ id: "guest-oid", email: "external-user#ext#@tenant.onmicrosoft.com" });

    await expect(gateStaffAccess()).resolves.toMatchObject({ status: "ok" });
    expect(rows[0]).toMatchObject({
      entraObjectId: "guest-oid",
      email: "invited@example.com",
      guestInvitationState: "ACCEPTED",
    });
  });

  it("keeps disabled staff blocked even when the invitation matches", async () => {
    rows.push(
      staffRow({
        entraObjectId: "placeholder-oid",
        email: "disabled@example.com",
        isActive: false,
        guestInvitationState: "PENDING",
      }),
    );
    signInSession({ id: "disabled-oid", email: "disabled@example.com" });

    await expect(gateStaffAccess()).resolves.toMatchObject({
      status: "inactive",
      email: "disabled@example.com",
    });
  });

  it("keeps unknown Microsoft users on the access-list page", async () => {
    rows.push(staffRow({ email: "known@example.com" }));
    signInSession({ id: "unknown-oid", email: "unknown@example.com" });

    await expect(gateStaffAccess()).resolves.toMatchObject({
      status: "not_registered",
      sessionEmail: "unknown@example.com",
    });
  });

  it("uses the saved Entra object id on future logins", async () => {
    rows.push(
      staffRow({
        entraObjectId: "saved-oid",
        email: "invited@example.com",
        guestInvitationState: "ACCEPTED",
      }),
    );
    signInSession({ id: "saved-oid", email: "different-upn@example.net" });

    await expect(gateStaffAccess()).resolves.toMatchObject({ status: "ok" });
  });

  it("does not grant a pending invitation when both object id and normalized email mismatch", async () => {
    rows.push(
      staffRow({
        entraObjectId: "placeholder-oid",
        email: "invited@example.com",
        guestInvitationState: "PENDING",
        graphInvitedUserObjectId: "guest-oid",
      }),
    );
    signInSession({ id: "different-oid", email: "other@example.com" });

    await expect(gateStaffAccess()).resolves.toMatchObject({
      status: "not_registered",
      sessionEmail: "other@example.com",
    });
    expect(rows[0]).toMatchObject({
      entraObjectId: "placeholder-oid",
      guestInvitationState: "PENDING",
    });
  });
});
