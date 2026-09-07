import { expect, it } from "vitest";
import { forgetReplyAttempt, isReplyRequestId, parseReplyAttempt, rememberReplyAttempt, replyAttemptStorageKey } from "./reply-attempt";

const attempt = { requestId: "ec1260f4-d817-4ba1-aea0-4196477fd435", bodyText: "Synthetic reply" };
function storage() {
  const rows = new Map<string, string>();
  return { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); }, removeItem: (key: string) => { rows.delete(key); } };
}
it("preserves the same identity and draft through repeated saves and restoration", () => {
  const store = storage();
  rememberReplyAttempt(store, "key", attempt);
  rememberReplyAttempt(store, "key", attempt);
  expect(parseReplyAttempt(store.getItem("key"))).toEqual(attempt);
  forgetReplyAttempt(store, "key", attempt.requestId);
  expect(parseReplyAttempt(store.getItem("key"))).toBeNull();
});
it.each(["broken-json", "{}", "null", JSON.stringify({ ...attempt, bodyText: "" }), JSON.stringify({ ...attempt, requestId: "bad" }), JSON.stringify({ ...attempt, bodyText: "x".repeat(50001) })])("refuses corrupted stored state instead of allowing a fresh attempt", (value) => {
  expect(() => parseReplyAttempt(value)).toThrow();
});
it("prevents a newer draft or a stale completion from replacing an unresolved attempt", () => {
  const store = storage();
  rememberReplyAttempt(store, "key", attempt);
  expect(() => rememberReplyAttempt(store, "key", { ...attempt, bodyText: "different" })).toThrow();
  expect(() => forgetReplyAttempt(store, "key", "99f03b72-2df2-4df2-b365-2067a99435e1")).toThrow();
  expect(parseReplyAttempt(store.getItem("key"))).toEqual(attempt);
});
it("propagates unavailable storage before the caller can dispatch", () => {
  const store = { ...storage(), setItem: () => { throw Error("storage disabled"); } };
  expect(() => rememberReplyAttempt(store, "key", attempt)).toThrow("storage disabled");
});
it("isolates browser records by staff, client and message without delimiter collisions", () => {
  const keys = [replyAttemptStorageKey("a", "b", "c"), replyAttemptStorageKey("b", "b", "c"), replyAttemptStorageKey("a", "c", "c"), replyAttemptStorageKey("a", "b", "d"), replyAttemptStorageKey("a:b", "c", "d"), replyAttemptStorageKey("a", "b:c", "d")];
  expect(new Set(keys).size).toBe(keys.length);
});
it("accepts UUIDv4 case-insensitively and normalizes restored input", () => {
  expect(isReplyRequestId(attempt.requestId.toUpperCase())).toBe(true);
  expect(isReplyRequestId(null)).toBe(false);
  expect(parseReplyAttempt(JSON.stringify({ ...attempt, requestId: attempt.requestId.toUpperCase(), bodyText: " Synthetic reply " }))).toEqual(attempt);
});
