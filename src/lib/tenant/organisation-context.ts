import { AsyncLocalStorage } from "node:async_hooks";

import { OrganisationScopeError } from "@/server/tenant/tenant-scope";

/**
 * Which organisation the current async call stack may touch.
 *
 * `organisation` — every tenant query is forced onto this id.
 * `system` — an explicit platform-operator or capability-token bypass.
 * `resolving` — the scope lookup itself is in progress and must not recurse.
 */
export type OrganisationContext =
  | { kind: "organisation"; organisationId: string }
  | { kind: "system" }
  | { kind: "resolving" };

const storage = new AsyncLocalStorage<OrganisationContext>();

export function getOrganisationContext(): OrganisationContext | undefined {
  return storage.getStore();
}

export function runInOrganisation<T>(organisationId: string, fn: () => Promise<T>): Promise<T> {
  const id = organisationId.trim();
  if (!id) {
    return Promise.reject(new OrganisationScopeError("ORGANISATION_SCOPE_REQUIRED"));
  }
  return storage.run({ kind: "organisation", organisationId: id }, fn);
}

/** Platform dashboard, cron partition, and unguessable-token lookups. */
export function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ kind: "system" }, fn);
}

export function runResolvingOrganisationScope<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ kind: "resolving" }, fn);
}
