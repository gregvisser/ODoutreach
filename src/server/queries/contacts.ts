import "server-only";

import { prisma } from "@/lib/db";
import { assertClientInAccessibleList } from "@/server/tenant/access";

/**
 * The admin contact directory behind /contacts.
 *
 * Queue item 27, defect (9): this used to `take: 500` and hand every row to a
 * page that rendered all of them. Measured in Chrome on the live site on
 * 2026-08-26 that was 2,977 KB of HTML and 19,265 ms to load; reproduced in the
 * e2e lab at 1,530 KB for 262 rows. The weight is linear in rendered rows —
 * about 5.9 KB each — because every row carries a `SendToContactForm`, a client
 * component wrapping a sheet with a subject input and an eight-row textarea.
 *
 * So the directory is paged, and — this is the part that is not optional —
 * searched in the DATABASE. Paging a directory without giving it a search turns
 * "is this person in here?" from a Ctrl-F into an unanswerable question. That is
 * exactly the defect cycle 23 removed from /suppression, where a search filtered
 * only the rows already in the browser and answered "no matches" for someone who
 * was genuinely on the list. Adding paging without search here would have
 * reintroduced it one screen over.
 */

/**
 * 50, not the 200 that /suppression uses. A blocked-address row is two plain
 * text cells; a contact row is seven cells plus a client component. At ~5.9 KB
 * per rendered row, 50 is roughly 300 KB of directory — a page — and 200 would
 * be 1.2 MB, which is the defect again at 40% scale.
 */
export const CONTACT_DIRECTORY_PAGE_SIZE = 50;

export type ContactDirectoryQuery = {
  accessibleClientIds: string[];
  filterClientId?: string;
  /** Free-text search, run against the database, not the current page. */
  search?: string;
  offset?: number;
};

export type ContactDirectoryRow = {
  id: string;
  clientId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  linkedIn: string | null;
  mobilePhone: string | null;
  officePhone: string | null;
  source: string;
  isSuppressed: boolean;
  client: { name: string };
  importBatch: { fileName: string | null } | null;
};

export type ContactDirectoryPage = {
  rows: ContactDirectoryRow[];
  /** Every contact matching the filter, counted in the database — not `rows.length`. */
  total: number;
  pageSize: number;
  offset: number;
};

/**
 * The tenant wall plus the optional search term, declared ONCE so the
 * `findMany` and the `count` cannot be built differently. If they drifted the
 * page would show one set of rows and report the size of another.
 */
function contactDirectoryWhere({
  accessibleClientIds,
  filterClientId,
  search,
}: ContactDirectoryQuery) {
  if (filterClientId) {
    assertClientInAccessibleList(filterClientId, accessibleClientIds);
  }

  const scope = filterClientId
    ? { clientId: filterClientId }
    : { clientId: { in: accessibleClientIds } };

  const needle = search?.trim();
  if (!needle) {
    return scope;
  }

  // Name or address — an operator looking someone up has one or the other.
  return {
    ...scope,
    OR: [
      { email: { contains: needle, mode: "insensitive" as const } },
      { fullName: { contains: needle, mode: "insensitive" as const } },
      { firstName: { contains: needle, mode: "insensitive" as const } },
      { lastName: { contains: needle, mode: "insensitive" as const } },
    ],
  };
}

export async function listContactsForStaff(
  query: ContactDirectoryQuery,
): Promise<ContactDirectoryPage> {
  const offset = Math.max(0, query.offset ?? 0);
  if (query.accessibleClientIds.length === 0) {
    return {
      rows: [],
      total: 0,
      pageSize: CONTACT_DIRECTORY_PAGE_SIZE,
      offset: 0,
    };
  }

  const where = contactDirectoryWhere(query);

  const [rows, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      // `id` is the tiebreaker, and it is load-bearing: contacts imported in one
      // batch share an `updatedAt` to the millisecond, and an unstable sort lets
      // the same row appear on page one and page two while another is never
      // shown at all.
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: offset,
      take: CONTACT_DIRECTORY_PAGE_SIZE,
      // An explicit select, not `include`. `include` returned every scalar on
      // Contact plus the import batch's `status` and its `summary` JSON blob,
      // none of which this screen renders.
      select: {
        id: true,
        clientId: true,
        email: true,
        firstName: true,
        lastName: true,
        fullName: true,
        linkedIn: true,
        mobilePhone: true,
        officePhone: true,
        source: true,
        isSuppressed: true,
        client: { select: { name: true } },
        importBatch: { select: { fileName: true } },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return { rows, total, pageSize: CONTACT_DIRECTORY_PAGE_SIZE, offset };
}
