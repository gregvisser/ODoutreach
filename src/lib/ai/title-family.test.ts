import { describe, expect, it } from "vitest";

import {
  classifyTitleFamily,
  normalizeTitle,
  titleFamilyLabel,
  TITLE_FAMILY_LABELS,
  type TitleFamily,
} from "./title-family";

describe("normalizeTitle", () => {
  it("folds case, spacing, hyphens and ampersands to one string", () => {
    const forms = [
      "Head of Health & Safety",
      "head of health and safety",
      "HEAD OF HEALTH  &  SAFETY",
      "Head-of-Health-&-Safety",
      "Head of Health &Safety,",
    ];
    expect(new Set(forms.map(normalizeTitle)).size).toBe(1);
  });

  /**
   * A separator that is not an ampersand collapses to a SPACE rather than to
   * "and", so "Health/Safety" is a different string from "Health & Safety".
   * That is deliberate — inserting "and" for every slash would invent a word —
   * and it costs nothing, because the term that groups both is "safety". The
   * property worth guaranteeing is the grouping, not the string, so it is
   * asserted where it matters.
   */
  it("groups spellings the same even where the normalised strings differ", () => {
    const forms = [
      "Head of Health & Safety",
      "Head of Health/Safety",
      "Head of Health, Safety and Environment",
      "HSE Lead",
    ];
    const families = forms.map(classifyTitleFamily);
    expect(new Set(families).size).toBe(1);
    expect(families[0]).toBe("HEALTH_SAFETY_AND_QUALITY");
  });

  it("pads so a term is matched as a whole word, never inside another", () => {
    expect(normalizeTitle("Ops Director")).toBe(" ops director ");
    expect(normalizeTitle("Shops Director")).toBe(" shops director ");
  });

  it("returns empty for a title with no letters or digits in it", () => {
    expect(normalizeTitle("   ")).toBe("");
    expect(normalizeTitle("---")).toBe("");
  });
});

describe("classifyTitleFamily", () => {
  it("treats an absent, blank or unusable title as ungrouped rather than guessing", () => {
    expect(classifyTitleFamily(null)).toBeNull();
    expect(classifyTitleFamily(undefined)).toBeNull();
    expect(classifyTitleFamily("")).toBeNull();
    expect(classifyTitleFamily("   ")).toBeNull();
  });

  it("groups the ordinary spellings of each family", () => {
    const cases: readonly [string, TitleFamily][] = [
      ["Managing Director", "OWNER_OR_FOUNDER"],
      ["Founder & CEO", "OWNER_OR_FOUNDER"],
      ["Owner", "OWNER_OR_FOUNDER"],
      ["Chief Executive", "OWNER_OR_FOUNDER"],
      ["Finance Director", "FINANCE"],
      ["CFO", "FINANCE"],
      ["Management Accountant", "FINANCE"],
      ["Accounts Payable Supervisor", "FINANCE"],
      ["Operations Manager", "OPERATIONS"],
      ["Head of Ops", "OPERATIONS"],
      ["Warehouse Supervisor", "OPERATIONS"],
      ["Supply Chain Lead", "OPERATIONS"],
      ["HR Business Partner", "HR_AND_PEOPLE"],
      ["Head of People & Culture", "HR_AND_PEOPLE"],
      ["Human Resources Officer", "HR_AND_PEOPLE"],
      ["Health & Safety Advisor", "HEALTH_SAFETY_AND_QUALITY"],
      ["HSE Manager", "HEALTH_SAFETY_AND_QUALITY"],
      ["Quality Controller", "HEALTH_SAFETY_AND_QUALITY"],
      ["IT Manager", "IT_AND_ENGINEERING"],
      ["Software Engineer", "IT_AND_ENGINEERING"],
      ["CTO", "IT_AND_ENGINEERING"],
      ["Sales Director", "SALES_AND_BUSINESS_DEVELOPMENT"],
      ["Business Development Manager", "SALES_AND_BUSINESS_DEVELOPMENT"],
      ["Account Manager", "SALES_AND_BUSINESS_DEVELOPMENT"],
      ["Marketing Manager", "MARKETING"],
      ["Head of Brand", "MARKETING"],
      ["Procurement Lead", "PROCUREMENT"],
      ["Senior Buyer", "PROCUREMENT"],
      ["General Counsel", "LEGAL"],
      ["Data Protection Officer", "LEGAL"],
    ];

    for (const [title, expected] of cases) {
      expect(classifyTitleFamily(title), title).toBe(expected);
    }
  });

  /**
   * THE ORDERING RULES, asserted directly. Each of these titles is claimed by
   * two rules, and the priority order in `FAMILY_RULES` is the only thing that
   * decides which wins. A reordering that silently re-pooled an audience would
   * change every number downstream, so it fails here.
   */
  it("puts function before seniority", () => {
    expect(classifyTitleFamily("Operations Director")).toBe("OPERATIONS");
    expect(classifyTitleFamily("Finance Director")).toBe("FINANCE");
    expect(classifyTitleFamily("Marketing Director")).toBe("MARKETING");
    // Only a title naming no function at all reaches the owner family.
    expect(classifyTitleFamily("Managing Director")).toBe("OWNER_OR_FOUNDER");
  });

  it("resolves the titles that two function rules both claim", () => {
    // "controller" is a Finance term; "quality" runs first and is more specific.
    expect(classifyTitleFamily("Quality Controller")).toBe(
      "HEALTH_SAFETY_AND_QUALITY",
    );
    expect(classifyTitleFamily("Financial Controller")).toBe("FINANCE");
    // "engineer" is an IT term; the qualifier decides.
    expect(classifyTitleFamily("Sales Engineer")).toBe(
      "SALES_AND_BUSINESS_DEVELOPMENT",
    );
    expect(classifyTitleFamily("Production Engineer")).toBe("OPERATIONS");
    expect(classifyTitleFamily("Software Engineer")).toBe("IT_AND_ENGINEERING");
  });

  it("does not match a term inside a longer word", () => {
    // " ops " must not be found in "shops", nor " hr " in "threshold".
    expect(classifyTitleFamily("Shops Assistant")).toBeNull();
    expect(classifyTitleFamily("Threshold Analyst")).toBeNull();
  });

  /**
   * The deliberate refusals. Each of these WOULD have a plausible home, and
   * putting it there would silently pool unrelated jobs into one audience — the
   * failure the `null` answer exists to prevent.
   */
  it("refuses the genuinely ambiguous rather than guessing a family", () => {
    expect(classifyTitleFamily("Director")).toBeNull();
    expect(classifyTitleFamily("Manager")).toBeNull();
    expect(classifyTitleFamily("Digital Lead")).toBeNull();
    expect(classifyTitleFamily("Compliance Officer")).toBeNull();
    expect(classifyTitleFamily("Security Manager")).toBeNull();
    expect(classifyTitleFamily("Team Leader")).toBeNull();
  });

  it("labels every family, and every family has a distinct label", () => {
    const families = Object.keys(TITLE_FAMILY_LABELS) as TitleFamily[];
    const labels = families.map(titleFamilyLabel);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(families.length);
  });
});
