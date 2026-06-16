import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  findGmailMessageIdByRfc822MessageId,
  stableRfc822MessageId,
} from "./gmail-sendmail";

describe("stableRfc822MessageId", () => {
  it("is deterministic for a given row id + sender domain", () => {
    const a = stableRfc822MessageId("row123", "rep@acme.com");
    const b = stableRfc822MessageId("row123", "rep@acme.com");
    expect(a).toBe(b);
    expect(a).toBe("<osm-row123@acme.com>");
  });

  it("differs per row id and falls back when the domain is missing", () => {
    expect(stableRfc822MessageId("a", "x@d.com")).not.toBe(
      stableRfc822MessageId("b", "x@d.com"),
    );
    expect(stableRfc822MessageId("a", "no-domain")).toBe("<osm-a@odoutreach.local>");
  });
});

describe("findGmailMessageIdByRfc822MessageId", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns found + prefixed id and queries by rfc822msgid without angle brackets", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "abc123" }] }),
    });
    const res = await findGmailMessageIdByRfc822MessageId({
      accessToken: "t",
      rfc822MessageId: "<osm-row123@acme.com>",
    });
    expect(res).toEqual({ status: "found", providerMessageId: "gmail:abc123" });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("rfc822msgid%3Aosm-row123%40acme.com");
    expect(calledUrl).not.toContain("%3C"); // no encoded '<'
  });

  it("returns not_found when Gmail reports no messages", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(
      await findGmailMessageIdByRfc822MessageId({
        accessToken: "t",
        rfc822MessageId: "<osm-x@d.com>",
      }),
    ).toEqual({ status: "not_found" });
  });

  it("returns unknown on a non-OK response or a thrown error (fall back to sending)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(
      (await findGmailMessageIdByRfc822MessageId({ accessToken: "t", rfc822MessageId: "<a@b>" }))
        .status,
    ).toBe("unknown");
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(
      (await findGmailMessageIdByRfc822MessageId({ accessToken: "t", rfc822MessageId: "<a@b>" }))
        .status,
    ).toBe("unknown");
  });
});
