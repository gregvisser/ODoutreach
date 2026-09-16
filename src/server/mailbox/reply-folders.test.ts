import { describe, expect, it } from "vitest";
import { readReplyFolders, type InboxPageOptions } from "./inbox-pagination";
import { isStandaloneOptOut } from "@/lib/inbox/opt-out-detection";

describe("reply folders", () => {
  it("processes overlapping folder and backlog identities only once", async () => {
    const result = await readReplyFolders("old-page", async options => {
      options.onContinuation?.(null);
      return [{ id: "same-message" }];
    }, row => row.id);
    expect(result.rows).toEqual([{ id: "same-message" }]);
    expect(result.cursor).toBeNull();
  });
  it("checks both fresh heads and preserves independent backlog progress", async () => {
    const calls: InboxPageOptions[] = [];
    const read = async (options: InboxPageOptions) => {
      calls.push(options);
      options.onContinuation?.(options.cursor ? `${options.folder}-later` : `${options.folder}-page2`);
      return [`${options.folder}:${options.cursor ?? "head"}`];
    };
    const first = await readReplyFolders("legacy-inbox-cursor", read);
    expect(first.rows).toEqual(["inbox:head", "inbox:legacy-inbox-cursor", "junk:head", "junk:junk-page2"]);
    calls.length = 0;
    await readReplyFolders(first.cursor, read);
    expect(calls.map(c => [c.folder, c.cursor])).toEqual([
      ["inbox", undefined], ["inbox", "inbox-later"], ["junk", undefined], ["junk", "junk-later"],
    ]);
  });
  it("does not return partial progress after a Junk failure", async () => {
    await expect(readReplyFolders(null, async options => {
      if (options.folder === "junk") throw new Error("provider unavailable");
      options.onContinuation?.(null);
      return ["inbox-message"];
    })).rejects.toThrow("provider unavailable");
  });
  it("clears completed cursors and rejects malformed saved progress", async () => {
    expect(await readReplyFolders(null, async options => { options.onContinuation?.(null); return []; }))
      .toEqual({ rows: [], cursor: null });
    await expect(readReplyFolders("reply-folders-v1:broken", async () => [])).rejects.toThrow("invalid");
  });
});

describe("standalone removal request recognition", () => {
  it.each(["unsubscribe", "STOP", "Re: unsubscribe"])("recognises explicit subject %s", subject => {
    expect(isStandaloneOptOut(subject, "Our company has ceased trading.")).toBe(true);
  });
  it("recognises an explicit request in a new message body", () => {
    expect(isStandaloneOptOut("Our business", "Please remove email address from your systems")).toBe(true);
  });
  it("does not turn newsletter opt-out footers or quoted requests into staff tasks", () => {
    expect(isStandaloneOptOut("Special offers", "Click here to unsubscribe")).toBe(false);
    expect(isStandaloneOptOut("Newsletter", "News\n> Please remove me from your database")).toBe(false);
  });
});
