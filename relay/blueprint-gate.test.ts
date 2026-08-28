// The ASK gate. It reads `.bidlow/BLUEPRINT.json` and fails the build when the
// discovery record breaks one of the rules in the BidlowAI ASK schema.
//
// WHY THIS EXISTS
//
// `references/04-blueprint-schema.md` opens with "the record the gate reads" and
// then lists eleven rules the gate enforces. Until this file was written, NO
// GATE READ IT. Four things in this repository mention BLUEPRINT.json and every
// one of them is prose - QUEUE.md, STATE.md, CLASSIFY.json - except
// `tracked-artefacts.test.ts`, which asserts only that the file is KNOWN TO GIT
// and never opens it. The eleven rules were enforced by a person looking at a
// deck and deciding it was green.
//
// That is this project's signature defect, sitting underneath the artefact that
// grades the discovery: built, wired, reporting success, never firing. QUEUE.md
// records six instances of it in one week. This was the seventh.
//
// WHAT IT CAUGHT, ON REAL GROUND, THE FIRST TIME IT WAS RUN
//
// Two things, both live on `main` at the time:
//
//   1. `access_level` was declared `"onsite"`. Per `references/access-levels.md`
//      that is the ONE value requiring no compensating checks at all, so
//      `compensating_checks_done: []` passed - vacuously. But every one of the
//      seven answers carries `answer_provenance.drafted_by: "claude"` with a
//      `source` naming `prisma/schema.prisma`, `src/server/...` or the git log.
//      Nobody watched OpensDoors do their work. `onsite` was not earned, and the
//      skill names this exact combination: "Overstating access is how you end up
//      believing you saw the work."
//
//   2. Tier P requires every open question to carry a `commercial_disposition`,
//      so residual risk lands in the contract rather than in the build. There
//      was no `open_questions` key at all - while the prose answers ended with
//      four separate "ASK IN THE MEETING" lists nobody had costed.
//
// WHY THE PROVENANCE CROSS-CHECK IS THE IMPORTANT ARM
//
// A test cannot know whether somebody really spent three hours in an office. It
// CAN know whether the document contradicts itself. Rule `access_level` is
// checked against `answer_provenance`, which is a different half of the file
// written for a different purpose - so the check cannot pass by agreeing with
// itself, which is the failure mode that made cycle 9's design gate vacuous
// (it read DESIGN.json instead of the stylesheet and compared the document
// against itself).

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");
const BLUEPRINT_PATH = path.join(REPO_ROOT, ".bidlow", "BLUEPRINT.json");

/** This repository is Tier P (see CLAUDE.md line 1), so the client-agreement
 *  and commercial-disposition rules all apply. Tier T runs a reduced set and
 *  Tier L is exempt; neither applies here, and hard-coding P means a silent
 *  tier downgrade cannot switch these rules off. */
const TIER = "P";

/** The five dispositions from `references/02-exception-sweeps.md`. An exception
 *  outside this set is a decision nobody actually made. */
const DISPOSITIONS = ["prevent", "detect", "recover", "de-idealise", "accept"] as const;

/** `references/04-blueprint-schema.md`: residual risk goes into the contract,
 *  not into the build. */
const COMMERCIAL_DISPOSITIONS = ["assumption", "paid_discovery", "change_control"] as const;

/** The compensating-check IDs each access level demands, verbatim from the
 *  table in `references/04-blueprint-schema.md`. `onsite` requires none, which
 *  is exactly why a false `onsite` is worth a gate of its own below. */
const REQUIRED_COMPENSATING_CHECKS: Record<string, readonly string[]> = {
  onsite: [],
  video: [
    "live_screen_share",
    "off_screen_half",
    "screen_recording",
    "doubled_artefact_pass",
    "interviewed_doer",
  ],
  async: [
    "artefacts_received",
    "five_cases_reconstructed",
    "exception_checklist_sent",
    "written_premortem",
    "riskiest_exception_first",
    "phased_commercials",
  ],
};

type Blueprint = Record<string, unknown>;

function readBlueprint(): Blueprint {
  return JSON.parse(readFileSync(BLUEPRINT_PATH, "utf8")) as Blueprint;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringField(row: unknown, key: string): string {
  if (typeof row !== "object" || row === null) return "";
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

describe("ASK gate - .bidlow/BLUEPRINT.json", () => {
  const blueprint = readBlueprint();

  it("is reading a real, populated blueprint and not an empty object", () => {
    // Without this, every check below would pass vacuously against `{}` if the
    // file were ever truncated or the path went stale. A gate that goes green
    // when its subject disappears is worse than no gate.
    expect(
      Object.keys(blueprint).length,
      `${BLUEPRINT_PATH} parsed to an object with almost no keys, so the rules ` +
        "below would pass against nothing. Check the file is not truncated.",
    ).toBeGreaterThan(10);

    expect(
      blueprint.answers,
      "BLUEPRINT.json has no `answers` block, so this gate is not looking at a " +
        "discovery record at all.",
    ).toBeTruthy();
  });

  it("declares status complete", () => {
    expect(
      blueprint.status,
      "A half-finished blueprint must not silently pass. Set `status` last.",
    ).toBe("complete");
  });

  it("traced at least three real cases end to end", () => {
    expect(
      blueprint.real_cases_traced,
      "Fewer than three real cases and you have seen an anecdote, not a process.",
    ).toBeGreaterThanOrEqual(3);
  });

  it("has one traced case recorded for every case it claims to have traced", () => {
    // The count is a hand-typed number and the evidence is a list. If they can
    // drift apart, the number is the thing people read and the list is the
    // thing that is true.
    const cases = asArray(blueprint.real_cases);

    expect(
      cases.length,
      `real_cases_traced says ${String(blueprint.real_cases_traced)} but ` +
        `real_cases holds ${cases.length} entries. Raising the number without ` +
        "adding the trace is how a discovery gets credit it did not earn.",
    ).toBe(blueprint.real_cases_traced);

    for (const [index, row] of cases.entries()) {
      expect(
        stringField(row, "case"),
        `real_cases[${index}] has no \`case\` name.`,
      ).not.toBe("");
      expect(
        stringField(row, "traced"),
        `real_cases[${index}] does not say what was traced.`,
      ).not.toBe("");
      expect(
        stringField(row, "evidence"),
        `real_cases[${index}] cites no evidence, so it is an assertion, not a trace.`,
      ).not.toBe("");
    }
  });

  it("counted frequencies rather than accepting an impression", () => {
    expect(
      blueprint.frequency_counted,
      "Counting frequencies costs no client time and is the best defence " +
        "against happy-path bias. `hardly ever` is not a number.",
    ).toBe(true);
  });

  it("gives every entity a name, its states, and an ending", () => {
    const entities = asArray(blueprint.entities);

    expect(
      entities.length,
      "`entities` is empty. A system with no entities has not been looked at.",
    ).toBeGreaterThan(0);

    for (const [index, row] of entities.entries()) {
      const name = stringField(row, "name");
      expect(name, `entities[${index}] has no name.`).not.toBe("");

      expect(
        asArray((row as Record<string, unknown>).states).length,
        `entity "${name}" lists no states.`,
      ).toBeGreaterThan(0);

      // Deletion, cancellation and archival are where the bodies are buried.
      expect(
        stringField(row, "dies"),
        `entity "${name}" has no ending recorded. An entity with no ending has ` +
          "not been thought about - and on this project one of them (ContactUniverse) " +
          "turned out to genuinely have none.",
      ).not.toBe("");
    }
  });

  it("registers real exceptions, each with a disposition somebody chose", () => {
    const exceptions = asArray(blueprint.exception_register);

    expect(
      exceptions.length,
      "A discovery that found no exceptions did not happen. Every real business " +
        "has them.",
    ).toBeGreaterThan(0);

    for (const [index, row] of exceptions.entries()) {
      const id = stringField(row, "id") || `#${index}`;

      expect(
        stringField(row, "situation"),
        `exception ${id} does not describe a situation.`,
      ).not.toBe("");

      expect(
        DISPOSITIONS as readonly string[],
        `exception ${id} has disposition "${stringField(row, "disposition")}", ` +
          `which is not one of the five: ${DISPOSITIONS.join(", ")}. An undisposed ` +
          "exception is a decision nobody made.",
      ).toContain(stringField(row, "disposition"));
    }
  });

  it("says what it is NOT handling, what happens instead, and that the client agreed", () => {
    const notHandling = blueprint.not_handling;

    expect(
      Array.isArray(notHandling),
      "`not_handling` must be present as an array. It is the anti-shell field: " +
        "an empty or missing one usually means the exceptions were found and " +
        "quietly assumed away.",
    ).toBe(true);

    for (const [index, row] of asArray(notHandling).entries()) {
      const what = stringField(row, "what") || `#${index}`;

      expect(
        stringField(row, "instead"),
        `not_handling "${what}" has no \`instead\`. "We are not doing X" is not a ` +
          'plan; "we are not doing X, they do Y instead" is.',
      ).not.toBe("");

      if (TIER === "P") {
        expect(
          (row as Record<string, unknown>).agreed_with_client,
          `not_handling "${what}" is not agreed with the client. On Tier P the ` +
            "failure is both parties assuming the other thought about it.",
        ).toBe(true);
      }
    }
  });

  it("costs every open question instead of leaving it in the prose", () => {
    // Tier P rule. This is the arm that went red on real ground: there was no
    // `open_questions` key at all, while four of the prose answers ended with an
    // "ASK IN THE MEETING" list nobody had put a price or a disposition against.
    const openQuestions = blueprint.open_questions;

    expect(
      Array.isArray(openQuestions),
      "Tier P requires `open_questions` as an array. Unanswered questions living " +
        'only in prose ("ASK IN THE MEETING...") are residual risk that has been ' +
        "written down and then absorbed into the build for free.",
    ).toBe(true);

    for (const [index, row] of asArray(openQuestions).entries()) {
      const question = stringField(row, "question") || `#${index}`;

      expect(
        COMMERCIAL_DISPOSITIONS as readonly string[],
        `open question "${question}" has commercial_disposition ` +
          `"${stringField(row, "commercial_disposition")}", which is not one of: ` +
          `${COMMERCIAL_DISPOSITIONS.join(", ")}. Residual risk goes into the ` +
          "contract, not into the build.",
      ).toContain(stringField(row, "commercial_disposition"));
    }
  });

  it("declares an access level the schema recognises", () => {
    expect(
      Object.keys(REQUIRED_COMPENSATING_CHECKS),
      `access_level is "${String(blueprint.access_level)}", which is not one of ` +
        `${Object.keys(REQUIRED_COMPENSATING_CHECKS).join(", ")}.`,
    ).toContain(blueprint.access_level);
  });

  it("does not claim onsite access when every answer was drafted from the repository", () => {
    // THE ARM THAT MATTERS. A test cannot know whether somebody spent three
    // hours watching real work. It can know whether the document contradicts
    // itself - and `answer_provenance` is a different half of the file, written
    // for a different purpose, so this cannot pass by agreeing with itself.
    //
    // `onsite` is the only level requiring zero compensating checks, so a false
    // `onsite` does not merely overstate access: it switches the rest of the
    // access-level rule off entirely.
    if (blueprint.access_level !== "onsite") return;

    const provenance = (blueprint.answer_provenance ?? {}) as Record<string, unknown>;
    const answers = Object.entries(provenance);

    expect(
      answers.length,
      "access_level is `onsite` but there is no answer_provenance to check it " +
        "against, so the claim rests on nothing.",
    ).toBeGreaterThan(0);

    const observed = answers.filter(([, row]) => stringField(row, "drafted_by") !== "claude");

    expect(
      observed.length,
      `access_level is "onsite", which requires NO compensating checks - but all ` +
        `${answers.length} answers in answer_provenance record drafted_by "claude", ` +
        "sourced from the repository and the session record. Watching real work " +
        "happen is what `onsite` means. Declare the level you actually had " +
        "(`async`) and do its compensating checks; an honest `async` run is safer " +
        "than an `onsite` claim you did not earn.",
    ).toBeGreaterThan(0);
  });

  it("accounts for every compensating check its declared access level demands", () => {
    const level = String(blueprint.access_level);
    const required = REQUIRED_COMPENSATING_CHECKS[level] ?? [];
    const done = asArray(blueprint.compensating_checks_done).filter(
      (value): value is string => typeof value === "string",
    );
    const outstanding = asArray(blueprint.compensating_checks_outstanding);

    for (const id of required) {
      if (done.includes(id)) continue;

      const named = outstanding.find((row) => stringField(row, "id") === id);

      expect(
        named,
        `access_level is "${level}" but compensating check \`${id}\` is neither in ` +
          "`compensating_checks_done` nor named in `compensating_checks_outstanding`. " +
          "Declaring a level and silently skipping its compensations is the " +
          "highest-risk combination available. If it is not done, say so, with an " +
          "owner - do not quietly drop it.",
      ).toBeTruthy();

      expect(
        stringField(named, "why"),
        `outstanding compensating check \`${id}\` gives no reason.`,
      ).not.toBe("");

      expect(
        stringField(named, "owner"),
        `outstanding compensating check \`${id}\` has no owner, so nobody is going ` +
          "to do it.",
      ).not.toBe("");
    }
  });

  it("still owes exactly the two compensating checks we know are owed", () => {
    // A PIN, not a target. These two need a human to act with the client and
    // cannot be closed from inside a repository, so the honest state is "owed",
    // not "done". The pin exists so the set cannot move in EITHER direction
    // without somebody noticing: adding a third un-done check goes red here, and
    // so does deleting an entry to make the artefact look finished.
    const outstanding = asArray(blueprint.compensating_checks_outstanding)
      .map((row) => stringField(row, "id"))
      .sort();

    expect(
      outstanding,
      "The set of outstanding compensating checks has changed. If one was DONE, " +
        "move it to compensating_checks_done and update this pin. If a new one is " +
        "owed, add it here deliberately. Do not edit this line to make a red build " +
        "green.",
    ).toEqual(["exception_checklist_sent", "phased_commercials"]);
  });
});
