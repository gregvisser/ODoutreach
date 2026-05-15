import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  STAFF_VIDEO_SCRIPTS,
  type StaffVideoScript,
} from "@/lib/training/modules";

/**
 * PR #140 — G8: training final handover polish.
 *
 * Training must not pretend videos exist if they don't. We commit:
 *   1. Ten short recording scripts covering the 10 named workflows.
 *   2. A "to record" label on every script — no false claims that a clip
 *      is already published.
 *   3. The training index page renders the scripts as text, not as an
 *      embedded video player.
 *
 * If real video files are committed in a future PR, update STAFF_VIDEO_SCRIPTS
 * AND wire a real player on the training page AT THE SAME TIME.
 */

const TRAINING_INDEX_PATH = join(process.cwd(), "src/app/(app)/training/page.tsx");
const TRAINING_INDEX_SOURCE = readFileSync(TRAINING_INDEX_PATH, "utf8");

const REQUIRED_SCRIPT_IDS = [
  "reports-dashboard",
  "client-overview",
  "mailboxes",
  "sources-imports-rocketreach",
  "universe",
  "lists-and-delivery-proof",
  "do-not-contact",
  "outreach-sequence-launch",
  "activity-replies-and-stop-followups",
  "settings",
] as const;

const VIDEO_FILE_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogg"]);

describe("STAFF_VIDEO_SCRIPTS — G8", () => {
  it("covers the ten workflows listed in the handover programme", () => {
    const ids = STAFF_VIDEO_SCRIPTS.map((s) => s.id);
    for (const required of REQUIRED_SCRIPT_IDS) {
      expect(ids).toContain(required);
    }
  });

  it("marks every clip as 'to record' (no false claims that videos exist)", () => {
    for (const s of STAFF_VIDEO_SCRIPTS) {
      expect(s.status).toBe("to record");
    }
  });

  it("each script has a non-trivial script and a filming checklist", () => {
    for (const s of STAFF_VIDEO_SCRIPTS) {
      expect(s.title.length, `title for ${s.id}`).toBeGreaterThan(0);
      expect(s.subtitle.length, `subtitle for ${s.id}`).toBeGreaterThan(0);
      expect(s.durationGuidance.length, `duration for ${s.id}`).toBeGreaterThan(0);
      expect(s.script.length, `script lines for ${s.id}`).toBeGreaterThanOrEqual(3);
      expect(s.checklist.length, `checklist for ${s.id}`).toBeGreaterThanOrEqual(2);
      for (const line of [...s.script, ...s.checklist]) {
        expect(line.trim().length, `line in ${s.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("scripts use the current handover vocabulary", () => {
    const blob = STAFF_VIDEO_SCRIPTS
      .map((s: StaffVideoScript) =>
        [s.title, s.subtitle, ...s.script, ...s.checklist].join("\n"),
      )
      .join("\n");

    // Must use the current names.
    expect(blob).toMatch(/Reports/);
    expect(blob).toMatch(/Lists/);
    expect(blob).toMatch(/Do-not-contact/);
    expect(blob).toMatch(/Universe/);
    expect(blob).toMatch(/Activity/);
    expect(blob).toMatch(/Stop follow-ups/);

    // Must not regress to legacy names.
    expect(blob).not.toMatch(/\bDashboard\b/);
    expect(blob).not.toMatch(/\bSuppression\b/);
    // The dev term "Contacts" as a sidebar entry is gone (we still talk
    // about "contact" the noun, so we only block the page name "Contacts").
    expect(blob).not.toMatch(/\bClick Contacts\b/);
  });

  it("emphasises safety — no Send / Launch / Sync / Connect on camera", () => {
    const checklists = STAFF_VIDEO_SCRIPTS.map((s) => s.checklist.join("\n")).join("\n");
    expect(checklists).toMatch(/do not click|do not press|do not type/i);
    // At least one explicit "no PII" guardrail somewhere.
    const allText = STAFF_VIDEO_SCRIPTS
      .map((s) => [...s.script, ...s.checklist].join("\n"))
      .join("\n");
    expect(allText.toLowerCase()).toMatch(/no pii|no real (contact )?emails?|fake contacts/);
  });

  it("portal hrefs point at routes that exist in the staff portal", () => {
    const allowedRoutes = new Set([
      "/reporting",
      "/clients",
      "/universe",
      "/suppression",
      "/settings",
      "/activity",
      "/training",
    ]);
    for (const s of STAFF_VIDEO_SCRIPTS) {
      // Only the path's first segment matters here — deep links are fine.
      const root = `/${s.portalHref.split("/").filter(Boolean)[0] ?? ""}`;
      expect(allowedRoutes.has(root), `${s.id} -> ${s.portalHref}`).toBe(true);
    }
  });
});

describe("Training index page — G8 wiring", () => {
  it("renders the recording scripts section, not a fake embedded player", () => {
    expect(TRAINING_INDEX_SOURCE).toContain("STAFF_VIDEO_SCRIPTS");
    expect(TRAINING_INDEX_SOURCE).toMatch(/Video scripts/i);
    // Hard guard: no fake video embeds.
    expect(TRAINING_INDEX_SOURCE).not.toMatch(/<video\b/);
    expect(TRAINING_INDEX_SOURCE).not.toMatch(/youtu\.?be/i);
    expect(TRAINING_INDEX_SOURCE).not.toMatch(/vimeo\.com/i);
    expect(TRAINING_INDEX_SOURCE).not.toMatch(/voiceover (recorded|complete)/i);
  });

  it("public/training does not silently contain unreferenced video files", () => {
    const dir = join(process.cwd(), "public/training");
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    const videoFiles = entries.filter((e) => {
      if (!e.isFile()) return false;
      const dot = e.name.lastIndexOf(".");
      if (dot < 0) return false;
      return VIDEO_FILE_EXTENSIONS.has(e.name.slice(dot).toLowerCase());
    });
    // If video files exist on disk, scripts must stop saying "to record".
    // This test is the trip-wire that forces both to move together.
    if (videoFiles.length > 0) {
      const anyRecorded = STAFF_VIDEO_SCRIPTS.some(
        (s) => (s.status as string) !== "to record",
      );
      expect(
        anyRecorded,
        `public/training contains video files (${videoFiles
          .map((v) => v.name)
          .join(", ")}) but every STAFF_VIDEO_SCRIPTS entry is still "to record". Wire the player and update the script status in the same PR.`,
      ).toBe(true);
    }
  });
});
