import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The navigation must not stampede the server on page load.
 *
 * Next.js prefetches every `<Link>` that enters the viewport. On a client
 * screen that is the eight sidebar links, the brand link and the nine subnav
 * tabs — about eighteen server-rendered `?_rsc=` requests fired at once.
 * Measured against production on 2026-08-26 (signed in, after cf5a752):
 * App Service returned 503 for /clients, /reporting, /suppression, brief,
 * mailboxes, sources, contacts, templates, outreach and activity. It sheds
 * under that burst. Requested one at a time a moment later the same paths
 * returned 200 twelve times out of twelve.
 *
 * So the prefetches were not filling the cache — they were failing, and taking
 * a real server-action POST down with them. This test exists because the fix is
 * a single prop that is very easy to drop in a later refactor, and because the
 * symptom ("the system takes very long to load") points nowhere near the cause.
 *
 * If the App Service plan is scaled beyond B1/one instance, re-measure before
 * relaxing this — do not simply delete it.
 */

const root = process.cwd();

const NAV_FILES = [
  join(root, "src/components/app-shell/app-sidebar.tsx"),
  join(root, "src/components/clients/client-workspace-subnav.tsx"),
];

/**
 * Strip comments before counting.
 *
 * Both files explain the opt-out in prose that quotes the prop verbatim. Left
 * in, those words count as if they were code — which would let a comment keep
 * the tally up while a real `<Link>` quietly lost its prop. Caught by this very
 * test on first run, which is also the proof it can go red.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Count `<Link` element openings, ignoring the `import Link from` line. */
function countLinkElements(src: string): number {
  return (stripComments(src).match(/<Link\b/g) ?? []).length;
}

function countDisabledPrefetch(src: string): number {
  return (stripComments(src).match(/prefetch=\{false\}/g) ?? []).length;
}

describe("navigation does not prefetch every route on page load", () => {
  for (const file of NAV_FILES) {
    const name = file.split(/[\\/]/).slice(-1)[0] ?? file;

    it(`${name}: every Link opts out of prefetch`, () => {
      const src = readFileSync(file, "utf8");
      const links = countLinkElements(src);

      // Guard the guard: if the file stops using <Link>, this test would pass
      // vacuously and we would never know the protection had evaporated.
      expect(links).toBeGreaterThan(0);
      expect(countDisabledPrefetch(src)).toBe(links);
    });

    it(`${name}: does not re-enable prefetch explicitly`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/prefetch=\{true\}/);
      expect(src).not.toMatch(/prefetch="?auto"?/);
    });
  }

  it("covers both halves of the burst — sidebar and client tabs", () => {
    expect(NAV_FILES).toHaveLength(2);
    const total = NAV_FILES.reduce(
      (n, f) => n + countLinkElements(readFileSync(f, "utf8")),
      0,
    );
    // Ten or more simultaneous prefetches is what production shed. If the nav
    // ever grows past that again without opting out, the tests above fail.
    expect(total).toBeGreaterThanOrEqual(2);
  });
});

/**
 * The two files above are not the whole burst, and believing they were is how
 * this defect survived being "fixed".
 *
 * `11a9a93` opted the sidebar and the workspace tabs out of prefetching and the
 * tests above went green. On 2026-08-27 the browser guard
 * (`e2e/nav-prefetch-burst.spec.ts`) was run for the first time and measured
 * **70 route prefetches on `/reporting`** and 15 on the client overview — every
 * one from a `<Link>` in a file these tests never looked at. `/reporting`
 * renders a filter chip per client and two links per table row, so the count
 * grows with the customer's own data.
 *
 * A guard scoped to two files cannot see that, so this one is scoped to the app.
 */

/** Every `.tsx` under `src/`, so a new screen cannot opt itself out by existing. */
function tsxFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFilesUnder(full);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * Return the attributes of every `<Link>` opening tag.
 *
 * Counting `<Link` and `prefetch={false}` separately (what the tests above do
 * for two known files) cannot say WHICH link is missing the prop, and a file
 * carrying both a prefetching link and an unrelated `prefetch={false}` would
 * tally clean. This walks each tag instead, tracking brace depth and quotes so
 * a `>` inside `href={`...`}` or a className does not end the tag early.
 */
function linkTagAttributes(src: string): string[] {
  const attrs: string[] = [];
  const openings = /<Link(?=[\s/>])/g;
  let match: RegExpExecArray | null;

  while ((match = openings.exec(src))) {
    let i = match.index + "<Link".length;
    let depth = 0;
    let quote: string | null = null;

    for (; i < src.length; i++) {
      const char = src[i];
      if (quote !== null) {
        if (char === "\\") i++;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
      } else if (char === ">" && depth === 0) {
        break;
      }
    }

    attrs.push(src.slice(match.index + "<Link".length, i));
  }

  return attrs;
}

describe("no <Link> anywhere in the app prefetches on page load", () => {
  const root = join(process.cwd(), "src");
  const files = tsxFilesUnder(root);

  it("finds the app's components to check", () => {
    // Without this, a broken walker would report zero offenders and look green.
    expect(files.length).toBeGreaterThan(50);
  });

  it("every <Link> opts out of prefetch", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const tags = linkTagAttributes(stripComments(readFileSync(file, "utf8")));
      const missing = tags.filter((a) => !/prefetch=\{false\}/.test(a)).length;
      if (missing > 0) {
        offenders.push(`${relative(process.cwd(), file)} (${String(missing)})`);
      }
    }

    expect(
      offenders,
      "these <Link>s prefetch their route as soon as they scroll into view; " +
        "on a single App Service worker that burst is shed with 503s — " +
        `add prefetch={false}:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("guards a meaningful number of links", () => {
    const total = files.reduce(
      (n, f) => n + linkTagAttributes(readFileSync(f, "utf8")).length,
      0,
    );
    // 122 at the time of writing. A collapse to near-zero means the walker or
    // the tag parser broke, not that the app stopped linking anywhere.
    expect(total).toBeGreaterThan(80);
  });
});
