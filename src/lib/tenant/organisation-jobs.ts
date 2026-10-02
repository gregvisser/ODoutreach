import { sanitizeJobErrorText } from "@/lib/alerts/job-error-text";
import { runInOrganisation } from "@/lib/tenant/organisation-context";

/**
 * One organisation's slice of a background job.
 *
 * Suspended organisations are reported and, by default, not asked to send
 * or spend. A do-not-contact sweep opts out of that skip: a stale blocklist
 * is worse than a workspace that cannot send.
 */
export type OrganisationJobTarget = {
  organisationId: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  clientIds: string[];
};

export type OrganisationJobRecord<T> = {
  organisationId: string;
  slug: string;
  disposition: "ran" | "skipped" | "failed";
  ok: boolean;
  error?: string;
  result?: T;
};

export type OrganisationJobRun<T> = {
  organisations: OrganisationJobRecord<T>[];
  /**
   * True only when every ACTIVE organisation threw. Item-level errors inside
   * a result that returned are a partial run (207), not this.
   * OpensDoors alone throwing still fails the cron. One organisation throwing
   * does not, because another organisation's work already ran.
   */
  everyActiveFailed: boolean;
};

/**
 * Run `work` for each organisation. A throw is that organisation's failure.
 * The next organisation still runs.
 */
export async function runOrganisationJobs<T>(
  targets: readonly OrganisationJobTarget[],
  work: (target: OrganisationJobTarget) => Promise<T>,
  options?: {
    /** Default true. DNC passes false so a suspended organisation still refreshes its blocklist. */
    skipSuspended?: boolean;
    /** Default: a returned result is ok. Pass jobOutcome when the result carries item errors. */
    succeeded?: (result: T) => boolean;
  },
): Promise<OrganisationJobRun<T>> {
  const skipSuspended = options?.skipSuspended !== false;
  const organisations: OrganisationJobRecord<T>[] = [];
  let active = 0;
  let activeFailed = 0;
  for (const target of targets) {
    if (skipSuspended && target.status !== "ACTIVE") {
      organisations.push({
        organisationId: target.organisationId,
        slug: target.slug,
        disposition: "skipped",
        ok: true,
      });
      continue;
    }
    active += 1;
    try {
      const result = await runInOrganisation(target.organisationId, () => work(target));
      const ok = options?.succeeded ? options.succeeded(result) : true;
      organisations.push({
        organisationId: target.organisationId,
        slug: target.slug,
        disposition: "ran",
        ok,
        result,
      });
    } catch (error) {
      activeFailed += 1;
      const message = sanitizeJobErrorText(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Organisation job failed",
      );
      organisations.push({
        organisationId: target.organisationId,
        slug: target.slug,
        disposition: "failed",
        ok: false,
        error: message,
      });
    }
  }
  return {
    organisations,
    everyActiveFailed: active > 0 && activeFailed === active,
  };
}

/** 500 when nothing active succeeded. Otherwise the derived 200 or 207. */
export function organisationJobsStatus(
  everyActiveFailed: boolean,
  outcomeStatus: 200 | 207,
): 200 | 207 | 500 {
  return everyActiveFailed ? 500 : outcomeStatus;
}

export function combineProcessQueueResults(
  records: readonly OrganisationJobRecord<{
    claimed: number;
    completed: number;
    errors: string[];
  }>[],
): { claimed: number; completed: number; errors: string[] } {
  let claimed = 0;
  let completed = 0;
  const errors: string[] = [];
  for (const record of records) {
    if (record.disposition === "failed" && record.error) {
      errors.push(`${record.slug}: ${record.error}`);
    }
    if (!record.result) continue;
    claimed += record.result.claimed;
    completed += record.result.completed;
    for (const error of record.result.errors) {
      errors.push(`${record.slug}: ${error}`);
    }
  }
  return { claimed, completed, errors };
}

export type OrganisationBucket<T> = OrganisationJobTarget & { items: T[] };

/**
 * Group items in encounter order. The first item decides the organisation's
 * place in the run, and later items for that organisation keep their order.
 */
export function bucketByOrganisation<T>(
  items: readonly T[],
  read: (item: T) => { organisationId: string; slug: string; status: "ACTIVE" | "SUSPENDED" },
): OrganisationBucket<T>[] {
  const groups = new Map<string, OrganisationBucket<T>>();
  for (const item of items) {
    const label = read(item);
    const existing = groups.get(label.organisationId);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(label.organisationId, {
      organisationId: label.organisationId,
      slug: label.slug,
      status: label.status,
      clientIds: [],
      items: [item],
    });
  }
  return [...groups.values()];
}
