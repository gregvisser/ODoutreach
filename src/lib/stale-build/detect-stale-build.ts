import type { BuildInfo } from "@/lib/build-info";

/**
 * True when the running server reports a different commit than this tab's bundle.
 * When either side lacks a commit (local dev / CI without baked markers), we cannot
 * compare honestly and treat the tab as current.
 */
export function isStaleBuild(
  clientCommit: string | null,
  serverCommit: string | null,
): boolean {
  if (!clientCommit || !serverCommit) return false;
  return clientCommit !== serverCommit;
}

export function isStaleBuildInfo(
  clientCommit: string | null,
  server: Pick<BuildInfo, "commit">,
): boolean {
  return isStaleBuild(clientCommit, server.commit);
}

/** Poll cadence when the tab stays open (ms). */
export const STALE_BUILD_POLL_INTERVAL_MS = 3 * 60 * 1000;

export const STALE_BUILD_FETCH_PATH = "/api/build-info";
