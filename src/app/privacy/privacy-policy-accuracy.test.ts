import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  decideClientOpenTracking,
  type ClientOpenTrackingFields,
} from "@/lib/tracking/client-open-tracking";
import { SENTRY_DATA_COLLECTION } from "@/lib/monitoring/sentry-data-collection";

/**
 * The privacy policy is a public promise, so it is a fact about this system in
 * exactly the way a constant is, and it can go stale in exactly the same way.
 *
 * It already did. `/privacy` shipped saying open tracking was "on by default and
 * can be switched off per deployment"; the tracking work had landed hours
 * earlier and made that false. Nothing failed, because prose is not compiled.
 *
 * So this file couples the two directions rather than snapshotting the text:
 *
 *  - the CODE half asserts the behaviour the page describes, by driving the real
 *    `decideClientOpenTracking` and reading the real `SENTRY_DATA_COLLECTION`;
 *  - the PROSE half asserts the page actually says it.
 *
 * Either side moving alone is a failure. If someone flips a default back on, the
 * failing test names the privacy policy — which is the point. A test that only
 * grepped the prose would pass happily while the code contradicted it, and that
 * is the exact defect this file exists to prevent.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const PRIVACY_PAGE = path.join(REPO_ROOT, "src", "app", "privacy", "page.tsx");

/**
 * Collapse JSX whitespace and the entities the page uses for typography, so an
 * assertion can be written as the sentence a reader sees rather than as the
 * source's line-wrapped, `&rsquo;`-carrying form.
 */
function renderedProse(source: string): string {
  return source
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\{"\s*"\}/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * One `<LegalSection>`, by its heading.
 *
 * Scoped rather than whole-file for two reasons. It keeps a failure readable —
 * matching against the entire page prints the entire page, and a test whose red
 * output is eight kilobytes of noise is one people learn to skim. And it stops
 * a claim passing on the strength of a coincidence somewhere else in the
 * document: "per customer" appears in the suppression section too, so a
 * whole-file match would have gone green on the tracking claim while the
 * tracking section still said the opposite.
 */
function privacySection(heading: string): string {
  const source = readFileSync(PRIVACY_PAGE, "utf8");
  const start = source.indexOf(`<LegalSection heading="${heading}">`);
  if (start === -1) {
    throw new Error(
      `The privacy policy has no "${heading}" section. If it was renamed, this test must be updated deliberately — the section is the thing under test.`,
    );
  }
  const end = source.indexOf("</LegalSection>", start);
  return renderedProse(source.slice(start, end));
}

const BLANK_CLIENT: ClientOpenTrackingFields = {
  outreachLinkDomain: null,
  outreachLinkDomainVerifiedAt: null,
  openTrackingEnabledAt: null,
  trackingDnsVerifiedAt: null,
};

const originalKillSwitch = process.env.OPEN_TRACKING_PIXEL;

afterEach(() => {
  if (originalKillSwitch === undefined) delete process.env.OPEN_TRACKING_PIXEL;
  else process.env.OPEN_TRACKING_PIXEL = originalKillSwitch;
});

describe("the open-tracking behaviour the privacy policy promises", () => {
  it("is OFF for a client that nobody has opted in, even with the global backstop permitting", () => {
    // Deleted, not set to "off": proving the default OFF via the global kill
    // switch would prove nothing about the per-client gate the page describes.
    delete process.env.OPEN_TRACKING_PIXEL;

    expect(decideClientOpenTracking(BLANK_CLIENT)).toEqual({
      enabled: false,
      reason: "CLIENT_NOT_OPTED_IN",
    });
  });

  it("stays OFF when a client is opted in but their DNS has never been resolved", () => {
    delete process.env.OPEN_TRACKING_PIXEL;

    expect(
      decideClientOpenTracking({
        outreachLinkDomain: "go.example.com",
        outreachLinkDomainVerifiedAt: new Date("2026-08-01T00:00:00Z"),
        openTrackingEnabledAt: new Date("2026-08-01T00:00:00Z"),
        trackingDnsVerifiedAt: null,
      }),
    ).toEqual({ enabled: false, reason: "EMAIL_AUTH_NOT_VERIFIED" });
  });

  it("switches itself back off when a passing DNS check goes stale", () => {
    delete process.env.OPEN_TRACKING_PIXEL;
    const verifiedAt = new Date("2026-08-01T00:00:00Z");

    expect(
      decideClientOpenTracking(
        {
          outreachLinkDomain: "go.example.com",
          outreachLinkDomainVerifiedAt: verifiedAt,
          openTrackingEnabledAt: verifiedAt,
          trackingDnsVerifiedAt: verifiedAt,
        },
        new Date("2026-08-30T00:00:00Z"),
      ),
    ).toEqual({ enabled: false, reason: "EMAIL_AUTH_STALE" });
  });
});

describe("the privacy policy describes that behaviour, not the behaviour it replaced", () => {
  it("no longer claims tracking is on by default or a per-deployment switch", () => {
    const tracking = privacySection("Open tracking");

    expect(tracking).not.toMatch(/on by default/i);
    expect(tracking).not.toMatch(/per deployment/i);
  });

  it("states the default, the per-customer opt-in and the DNS precondition", () => {
    const tracking = privacySection("Open tracking");

    expect(tracking).toMatch(/off by default/i);
    // The opt-in is per CUSTOMER. "Per deployment" was the false claim, and a
    // page that merely deleted it would still leave a reader unable to tell
    // whether tracking applies to them.
    expect(tracking).toMatch(/each customer|per customer|individual customer/i);
    // The four records, named so a recipient can check them, rather than
    // gestured at as "an aligned domain".
    expect(tracking).toMatch(/SPF/);
    expect(tracking).toMatch(/DKIM/);
    expect(tracking).toMatch(/DMARC/);
    expect(tracking).toMatch(/tracking host/i);
    // The staleness backstop asserted in the code half above.
    expect(tracking).toMatch(/seven days/i);
  });

  it("does not describe the global switch as something that can turn tracking on", () => {
    const tracking = privacySection("Open tracking");

    // `isOpenTrackingPixelEnabled` is consulted only as a veto, ahead of the
    // per-client checks. Describing it as an on-switch would recreate the old
    // false claim in a new sentence.
    expect(tracking).toMatch(/only hold it off|cannot turn it on/i);
  });

  it("still promises only what the pixel endpoint actually records", () => {
    const tracking = privacySection("Open tracking");

    // Unchanged by this row and re-verified against the route: it writes only
    // `openedAt`, guarded on `openedAt: null`, and never reads the request.
    expect(tracking).toMatch(/a single timestamp of the first open/i);
    expect(tracking).toMatch(/Repeated opens are not counted/i);
    // ...but that timestamp sits on the recipient's own record, so "nothing
    // else" must not be allowed to read as "anonymously".
    expect(tracking).toMatch(/linked to you/i);
  });
});

describe("the privacy policy describes what Sentry is actually sent", () => {
  /**
   * The page names these as NOT collected. Each maps to a field of the real
   * policy object, so turning one back on fails here and names the privacy
   * policy as the thing now untrue — which is the coupling that was missing
   * when the tracking claim went stale.
   */
  it("only claims data is withheld where the collection policy withholds it", () => {
    expect(SENTRY_DATA_COLLECTION.httpBodies).toEqual([]);
    expect(SENTRY_DATA_COLLECTION.httpHeaders).toEqual({
      request: false,
      response: false,
    });
    expect(SENTRY_DATA_COLLECTION.cookies).toBe(false);
    expect(SENTRY_DATA_COLLECTION.userInfo).toBe(false);
    expect(SENTRY_DATA_COLLECTION.databaseQueryData).toBe(false);
    expect(SENTRY_DATA_COLLECTION.stackFrameVariables).toBe(false);
    expect(SENTRY_DATA_COLLECTION.urlQueryParams).toBe(false);
  });

  it("no longer says identifiers are incidentally included", () => {
    const processors = privacySection("Who else sees the data");

    expect(processors).not.toMatch(/incidentally include/i);
  });

  it("names what is withheld and what is still collected", () => {
    const processors = privacySection("Who else sees the data");

    expect(processors).toMatch(/not configured to receive|does not receive/i);
    for (const withheld of [
      /request or\s*response bodies/i,
      /headers/i,
      /cookies/i,
      /query strings/i,
      /database values/i,
      /local variables/i,
    ]) {
      expect(processors).toMatch(withheld);
    }
    // The honest other half. "We send Sentry nothing" would be the comfortable
    // sentence and it would be false: stack traces and sanitised SQL still go.
    expect(processors).toMatch(/stack trace/i);
  });
});
