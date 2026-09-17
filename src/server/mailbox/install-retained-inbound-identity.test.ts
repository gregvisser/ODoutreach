import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { graphIdentityKey } from "./graph-message-identity";
import { parseRetainedIdentityInstallation } from "./install-retained-inbound-identity";

const identity = { clientId: "client", mailboxIdentityId: "mailbox", internetMessageId: "<message@test>",
  fromEmail: "sender@test", receivedAt: "2026-09-15T00:00:00.000Z" };
const identityHash = createHash("sha256").update(graphIdentityKey(identity)).digest("hex");
const group = { identity, rawIds: ["a", "b"], expectedFingerprints: { a: "a".repeat(64), b: "b".repeat(64) } };
const valid = { version: 1, manifest: { version: 1, cutoffBefore: "2026-09-16T00:00:00.000Z", groups: [group] },
  canonicalByIdentityHash: { [identityHash]: "a" } };
it("binds exact normalized pairs, fingerprints and canonical choices into the reviewed hash", () => {
  expect(parseRetainedIdentityInstallation(valid).installationHash).toMatch(/^[a-f0-9]{64}$/);
  expect(parseRetainedIdentityInstallation(valid).installationHash).not.toBe(
    parseRetainedIdentityInstallation({ ...valid, canonicalByIdentityHash: { [identityHash]: "b" } }).installationHash);
});
it.each([
  { ...valid, execute: true },
  { ...valid, canonicalByIdentityHash: {} },
  { ...valid, canonicalByIdentityHash: { [identityHash]: "foreign" } },
  { ...valid, manifest: { ...valid.manifest, groups: [{ ...group, expectedFingerprints: undefined }] } },
  { ...valid, manifest: { ...valid.manifest, groups: [{ ...group, rawIds: ["a", "b", "c"],
    expectedFingerprints: { ...group.expectedFingerprints, c: "c".repeat(64) } }] } },
])("rejects incomplete/broadened installation approval", input => {
  expect(() => parseRetainedIdentityInstallation(input)).toThrow();
});
