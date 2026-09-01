import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// gate-build.mjs and lib.mjs are the shared BidlowAI build gate, shipped
// outside every project's git repo at C:\Bidlowprojects\_standards (see
// bidlow-deck-out-of-order-headline.test.ts for why: CI runs on
// ubuntu-latest and never sees a C:\ drive, so this suite is honest about
// what it can prove -- real proof on a machine where the tree exists, a
// visible skip everywhere else).
//
// Row 145 (queue cycle 224): _standards/checklists/email-sending.md records
// that BidlowAI's own field knowledge score was 1 at ODoutreach kickoff and
// was TREATED as 4 -- and names that gap as the root cause of the incident
// that damaged a client's sending domain. The score already existed.
// Nothing read it. CHECK (bidlow-check, which writes DOMAIN.json) must now
// refuse to close -- status flipping to "researched" -- for a project whose
// governing checklist scores 0 or 1, unless a human records a named
// override. GRANDFATHERED: a project already lifecycle "live" -- its CHECK
// already closed -- is untouched. This suite spawns the REAL gate-build.mjs
// exactly as Claude Code's PreToolUse hook does (JSON on stdin, exit code as
// the verdict), so it proves the gate FIRES, not merely that its logic exists.
const LIB_PATH =
  "C:\\Bidlowprojects\\_standards\\bidlow-standards\\plugins\\bidlow-standards\\scripts\\lib.mjs";
const GATE_BUILD_PATH =
  "C:\\Bidlowprojects\\_standards\\bidlow-standards\\plugins\\bidlow-standards\\scripts\\gate-build.mjs";
const hasGate = existsSync(LIB_PATH) && existsSync(GATE_BUILD_PATH);

function runGateBuild(payload: unknown): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, [GATE_BUILD_PATH], {
      input: JSON.stringify(payload),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { status: 0, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer };
    return { status: err.status ?? -1, stderr: (err.stderr ?? Buffer.from("")).toString("utf8") };
  }
}

describe.skipIf(!hasGate)("field-knowledge gate on CHECK (row 145)", () => {
  let fixtureRoot: string | null = null;

  afterEach(() => {
    if (fixtureRoot) {
      rmSync(fixtureRoot, { recursive: true, force: true });
      fixtureRoot = null;
    }
  });

  function makeFixture(opts: { declareTier?: boolean; lifecycle?: string } = {}): string {
    const root = mkdtempSync(join(tmpdir(), "fk-gate-"));
    mkdirSync(join(root, ".bidlow"), { recursive: true });
    if (opts.declareTier !== false) {
      writeFileSync(join(root, "CLAUDE.md"), "Tier: P - Client Production\n");
    }
    if (opts.lifecycle) {
      writeFileSync(join(root, ".bidlow", "PROJECT.json"), JSON.stringify({ lifecycle: opts.lifecycle }));
    }
    fixtureRoot = root;
    return root;
  }

  it("blocks a NEW CHECK close when the governing checklist scores 1 (email-sending, ODoutreach's own field)", () => {
    const root = makeFixture();
    const domainPath = join(root, ".bidlow", "DOMAIN.json");

    const result = runGateBuild({
      cwd: root,
      tool_input: {
        file_path: domainPath,
        content: JSON.stringify({ status: "researched", field: "email-sending" }),
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("field-knowledge gate on CHECK");
    expect(result.stderr).toContain("email-sending");
    expect(result.stderr).toContain("scores 1/5");
  });

  it("lets a NAMED override through -- an override missing granted_by still blocks", () => {
    const root = makeFixture();
    const domainPath = join(root, ".bidlow", "DOMAIN.json");

    const unnamed = runGateBuild({
      cwd: root,
      tool_input: {
        file_path: domainPath,
        content: JSON.stringify({
          status: "researched",
          field: "email-sending",
          field_knowledge_override: {
            field: "email-sending",
            reason: "accepted for the pilot phase deliberately",
            date: "2026-09-01",
          },
        }),
      },
    });
    expect(unnamed.status).toBe(2);

    const named = runGateBuild({
      cwd: root,
      tool_input: {
        file_path: domainPath,
        content: JSON.stringify({
          status: "researched",
          field: "email-sending",
          field_knowledge_override: {
            field: "email-sending",
            granted_by: "Greg",
            reason: "accepted for the pilot phase deliberately",
            date: "2026-09-01",
          },
        }),
      },
    });
    expect(named.status).toBe(0);
  });

  it("leaves a grandfathered (lifecycle live) project untouched -- fixture AND ODoutreach's own real DOMAIN.json", () => {
    const root = makeFixture({ lifecycle: "live" });
    const domainPath = join(root, ".bidlow", "DOMAIN.json");

    const fixtureResult = runGateBuild({
      cwd: root,
      tool_input: {
        file_path: domainPath,
        content: JSON.stringify({ status: "researched", field: "email-sending" }),
      },
    });
    expect(fixtureResult.status).toBe(0);

    // ODoutreach itself: lifecycle "live" in its own .bidlow/PROJECT.json,
    // governing checklist email-sending scores 1. Rewriting its REAL
    // DOMAIN.json content verbatim through the real gate must not block --
    // this is the literal proof this row demanded: "ODoutreach must still
    // build."
    const realRoot = process.cwd();
    const realDomainPath = join(realRoot, ".bidlow", "DOMAIN.json");
    const realContent = readFileSync(realDomainPath, "utf8");
    const realResult = runGateBuild({
      cwd: realRoot,
      tool_input: { file_path: realDomainPath, content: realContent },
    });
    expect(realResult.status).toBe(0);
  });

  it("does not block when the score cannot be determined -- an unmatched field, or none at all", () => {
    const root = makeFixture();
    const domainPath = join(root, ".bidlow", "DOMAIN.json");

    const result = runGateBuild({
      cwd: root,
      tool_input: {
        file_path: domainPath,
        content: JSON.stringify({ status: "researched", field: "no-such-field-xyz" }),
      },
    });

    expect(result.status).toBe(0);
  });

  it("does not fire on an ordinary source-file write, or on a DOMAIN.json write that does not close CHECK", () => {
    const root = makeFixture({ declareTier: false });

    const sourceWrite = runGateBuild({
      cwd: root,
      tool_input: { file_path: join(root, "src", "example.ts"), old_string: "a", new_string: "b" },
    });
    expect(sourceWrite.status).toBe(0);
    expect(sourceWrite.stderr).not.toContain("field-knowledge gate on CHECK");

    const draftDomainWrite = runGateBuild({
      cwd: root,
      tool_input: {
        file_path: join(root, ".bidlow", "DOMAIN.json"),
        content: JSON.stringify({ status: "draft", field: "email-sending" }),
      },
    });
    expect(draftDomainWrite.status).toBe(0);
    expect(draftDomainWrite.stderr).not.toContain("field-knowledge gate on CHECK");
  });
});
