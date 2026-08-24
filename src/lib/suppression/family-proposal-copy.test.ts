import { describe, expect, it } from "vitest";

import {
  buildFamilyProposalCopy,
  companyNameFromDomain,
} from "./family-proposal-copy";

/**
 * The wording IS the feature.
 *
 * The person answering this question is not an engineer, and the whole design
 * rests on their click: the fan-in cap is a filter, not a safeguard. If the
 * screen does not give them enough to say no, nothing else in the system will.
 *
 * So these tests assert on the sentences, and one of them exists purely to hold
 * the line the brief drew — no source codes, no RFC names, no jargon.
 */

const base = {
  proposedDomain: "openreach.co.uk",
  seedDomain: "bt.com",
  source: "DMARC_RUA" as const,
  fanIn: 1,
  contactsAffected: 4,
};

describe("companyNameFromDomain", () => {
  it("reads a company name out of a domain", () => {
    expect(companyNameFromDomain("openreach.co.uk")).toBe("Openreach");
    expect(companyNameFromDomain("gallifordtry.co.uk")).toBe("Gallifordtry");
    expect(companyNameFromDomain("morrisonconstruction.co.uk")).toBe("Morrisonconstruction");
  });

  it("upper-cases a short name, because Bt reads as a typo", () => {
    expect(companyNameFromDomain("bt.com")).toBe("BT");
    expect(companyNameFromDomain("ibm.com")).toBe("IBM");
  });

  it("handles a hyphenated name and a subdomain", () => {
    expect(companyNameFromDomain("derry-bs.co.uk")).toBe("Derry BS");
    expect(companyNameFromDomain("mail.openreach.co.uk")).toBe("Openreach");
  });
});

describe("the proposal reads as plain English", () => {
  it("says what it thinks and why, naming both domains", () => {
    const copy = buildFamilyProposalCopy(base);
    expect(copy.headline).toBe("Openreach may belong to BT.");
    expect(copy.because).toBe(
      "openreach.co.uk sends its email security reports to bt.com, and you have asked us not to contact bt.com.",
    );
  });

  it("says how many contacts confirming will suppress, BEFORE it is clicked", () => {
    expect(buildFamilyProposalCopy(base).ifYouConfirm).toContain("4 contacts");
    expect(
      buildFamilyProposalCopy({ ...base, contactsAffected: 1 }).ifYouConfirm,
    ).toContain("1 contact at openreach.co.uk");
    expect(
      buildFamilyProposalCopy({ ...base, contactsAffected: 0 }).ifYouConfirm,
    ).toContain("Nobody on your current lists is affected today");
  });

  it("says a rejection is final", () => {
    expect(buildFamilyProposalCopy(base).ifYouReject).toContain("final");
    expect(buildFamilyProposalCopy(base).ifYouReject).toContain("will not ask");
  });

  it("surfaces the fan-in as a reason to be suspicious", () => {
    // The cap lets fan-in 1 and 2 through. nhs.net had fan-in 2 and is a shared
    // service, so the operator has to be told.
    expect(buildFamilyProposalCopy({ ...base, fanIn: 1 }).alsoPointHere).toBe(
      "No other company on your list points to bt.com.",
    );
    expect(buildFamilyProposalCopy({ ...base, fanIn: 2 }).alsoPointHere).toContain(
      "1 other company",
    );
    expect(buildFamilyProposalCopy({ ...base, fanIn: 2 }).alsoPointHere).toContain(
      "shared supplier",
    );
  });

  it("describes an SPF link without saying SPF", () => {
    const copy = buildFamilyProposalCopy({ ...base, source: "SPF_REDIRECT" });
    expect(copy.because).toContain("hands its email settings over to bt.com");
  });

  it("uses the buttons the brief specified", () => {
    const copy = buildFamilyProposalCopy(base);
    expect(copy.confirmLabel).toBe("Yes, same company");
    expect(copy.rejectLabel).toBe("No, different company");
  });

  it("contains no code, no RFC name and no jargon", () => {
    for (const source of ["DMARC_RUA", "SPF_REDIRECT"] as const) {
      for (const fanIn of [1, 2]) {
        const copy = buildFamilyProposalCopy({ ...base, source, fanIn });
        const all = Object.values(copy).join(" ");
        expect(all).not.toMatch(/DMARC|SPF|RFC|rua=|redirect=|registrable|eTLD|PSL/i);
        expect(all).not.toMatch(/\b(PENDING|CONFIRMED|REJECTED)\b/);
        expect(all).not.toMatch(/fanIn|seedDomain|proposedDomain/);
      }
    }
  });
});
