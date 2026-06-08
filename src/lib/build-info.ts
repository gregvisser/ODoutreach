export type BuildInfo = {
  service: "opensdoors-outreach";
  version: string | null;
  nodeEnv: string | null;
  commit: string | null;
  buildTimestamp: string | null;
};

type BuildEnv = Record<string, string | undefined>;

// Build-time markers. The Next.js compiler statically replaces direct
// `process.env.NEXT_PUBLIC_*` references with string literals at build
// time, so these values survive to runtime on hosts (e.g. Azure App
// Service) that do NOT carry the CI runner's GITHUB_SHA / timestamp.
// They are set in the deploy workflow's build step. Referenced at module
// scope (not via the `env` param) so the inlining actually applies.
const INLINED_BUILD_COMMIT: string | undefined =
  process.env.NEXT_PUBLIC_BUILD_COMMIT;
const INLINED_BUILD_TIMESTAMP: string | undefined =
  process.env.NEXT_PUBLIC_BUILD_TIMESTAMP;

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
      INLINED_BUILD_COMMIT,
    ]),
    buildTimestamp: firstNonEmpty([
      env.BUILD_TIMESTAMP,
      env.NEXT_PUBLIC_BUILD_TIMESTAMP,
      INLINED_BUILD_TIMESTAMP,
    ]),
  };
}
