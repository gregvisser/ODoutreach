export type ClientsPageEmptyCopy = { variant: "no_clients_in_system" };

/**
 * When the staff directory lists zero clients, decide the empty-state copy.
 *
 * Roles were removed (2026-06): every active staff member can now see every
 * live client, so an empty list can only mean there are no client workspaces
 * yet — never "others have workspaces you can't see". The old
 * `no_workspace_assigned` variant is therefore gone.
 */
export function resolveClientsPageEmptyCopy(input: {
  listedClientCount: number;
  totalClientsInDatabase: number;
}): ClientsPageEmptyCopy | null {
  if (input.listedClientCount > 0) {
    return null;
  }
  return input.totalClientsInDatabase === 0
    ? { variant: "no_clients_in_system" }
    : null;
}
