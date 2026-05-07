import type { StaffRole } from "@/generated/prisma/enums";

export type ClientsPageEmptyCopy =
  | { variant: "no_clients_in_system" }
  | { variant: "no_workspace_assigned" };

/**
 * When the staff directory lists zero clients, choose UX copy: either there are truly
 * no workspaces yet, or this user has no {@link ClientMembership} rows while others exist.
 */
export function resolveClientsPageEmptyCopy(input: {
  staffRole: StaffRole;
  listedClientCount: number;
  totalClientsInDatabase: number;
}): ClientsPageEmptyCopy | null {
  if (input.listedClientCount > 0) {
    return null;
  }
  const globalAccess = input.staffRole === "ADMIN" || input.staffRole === "MANAGER";
  if (globalAccess) {
    return input.totalClientsInDatabase === 0
      ? { variant: "no_clients_in_system" }
      : null;
  }
  return input.totalClientsInDatabase === 0
    ? { variant: "no_clients_in_system" }
    : { variant: "no_workspace_assigned" };
}
