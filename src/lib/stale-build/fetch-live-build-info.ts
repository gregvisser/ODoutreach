import type { BuildInfo } from "@/lib/build-info";

import { STALE_BUILD_FETCH_PATH } from "./detect-stale-build";

export async function fetchLiveBuildInfo(
  signal?: AbortSignal,
): Promise<BuildInfo | null> {
  const url = `${STALE_BUILD_FETCH_PATH}?cb=${Date.now()}`;
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return null;
  return (await response.json()) as BuildInfo;
}
