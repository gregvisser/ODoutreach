import { describe, expect, it } from "vitest";

import { CONTROLLED_PILOT_CONFIRMATION_PHRASE } from "@/lib/controlled-pilot-constants";
import { parsePilotRecipientLines } from "@/lib/controlled-pilot-recipients";

describe("parsePilotRecipientLines", () => {
  it("parses one per line", () => {
    const r = parsePilotRecipientLines("a@bidlow.co.uk\nb@bidlow.co.uk");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.emails).toEqual(["a@bidlow.co.uk", "b@bidlow.co.uk"]);
    expect(r.truncatedFromHardCap).toBe(false);
  });

  it("dedupes and preserves order", () => {
    const r = parsePilotRecipientLines("a@bidlow.co.uk\na@bidlow.co.uk");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.emails).toEqual(["a@bidlow.co.uk"]);
  });

  it("splits commas on a line", () => {
    const r = parsePilotRecipientLines("a@bidlow.co.uk, b@bidlow.co.uk");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.emails).toEqual(["a@bidlow.co.uk", "b@bidlow.co.uk"]);
  });

  it("rejects invalid token", () => {
    const r = parsePilotRecipientLines("not-an-email");
    expect(r.ok).toBe(false);
  });

  it("truncates at hard max", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `u${String(i)}@bidlow.co.uk`).join("\n");
    const r = parsePilotRecipientLines(lines);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.emails.length).toBe(10);
    expect(r.truncatedFromHardCap).toBe(true);
  });
});

describe("controlled pilot confirmation phrase", () => {
  it("is stable for operator docs", () => {
    expect(CONTROLLED_PILOT_CONFIRMATION_PHRASE).toBe("SEND PILOT");
  });
});
