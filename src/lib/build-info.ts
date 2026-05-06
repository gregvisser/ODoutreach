export type BuildInfo = {
  service: "opensdoors-outreach";
  version: string | null;
  nodeEnv: string | null;
  commit: string | null;
  buildTimestamp: string | null;
};

type BuildEnv = Record<string, string | undefined>;

function firstNonEmpty(values: Array<string | undefined | null>): string | null {
  const value = values.find((candidate) => candidate && candidate.trim().length > 0);
  return value?.trim() ?? null;
}

export function createBuildInfo(
  env: BuildEnv = process.env,
  packageVersion?: string | null,
): BuildInfo {
  return {
    service: "opensdoors-outreach",
    version: firstNonEmpty([packageVersion, env.npm_package_version]),
    nodeEnv: firstNonEmpty([env.NODE_ENV]),
    commit: firstNonEmpty([
      env.GITHUB_SHA,
      env.VERCEL_GIT_COMMIT_SHA,
      env.SOURCE_VERSION,
      env.WEBSITE_RUN_FROM_PACKAGE_COMMIT,
      env.BUILD_SOURCEVERSION,
    ]),
    buildTimestamp: firstNonEmpty([env.BUILD_TIMESTAMP, env.NEXT_PUBLIC_BUILD_TIMESTAMP]),
  };
}
