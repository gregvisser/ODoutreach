import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GRAPH_MESSAGE_IDENTITY_CONFLICT_REASONS, GraphMessageIdentityConflictError, sanitizeGraphIdentityConflictReason } from "./graph-message-identity";

it.each(GRAPH_MESSAGE_IDENTITY_CONFLICT_REASONS)("retains the public error code and bounded reason %s", reason => {
  const error = new GraphMessageIdentityConflictError("Existing public message", reason);
  expect(error).toMatchObject({ code: "GRAPH_MESSAGE_IDENTITY_CONFLICT", reason, message: "Existing public message" });
  expect(sanitizeGraphIdentityConflictReason(error.reason)).toBe(reason);
});

it.each([undefined, null, "sender@example.test", "<message-id@example.test>", "__proto__", "PRIVATE BODY", { RAW_AMBIGUITY: 1 }])(
  "never turns unexpected reason data into an audit key: %j", value => {
    expect(sanitizeGraphIdentityConflictReason(value)).toBe("UNKNOWN");
  },
);

it("keeps message-only construction compatible without auditing its text", () => {
  const error = new GraphMessageIdentityConflictError("PRIVATE BODY");
  expect(error.reason).toBe("UNKNOWN");
  expect(error.code).toBe("GRAPH_MESSAGE_IDENTITY_CONFLICT");
});
