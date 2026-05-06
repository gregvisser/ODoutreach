import { describe, expect, it } from "vitest";

import {
  APPROVED_INTERNAL_PROOF_RECIPIENTS,
  INTERNAL_PROOF_CONFIRMATION_PHRASE,
  INTERNAL_PROOF_METADATA_KIND,
  isApprovedInternalProofRecipient,
} from "./internal-proof-send";

describe("internal proof send policy", () => {
  it("allows only the explicit proof-recipient list", () => {
    for (const email of APPROVED_INTERNAL_PROOF_RECIPIENTS) {
      expect(isApprovedInternalProofRecipient(email.toUpperCase())).toBe(true);
    }

    expect(isApprovedInternalProofRecipient("prospect@example.com")).toBe(false);
    expect(isApprovedInternalProofRecipient("greg@bidlow.co.uk.example.com")).toBe(false);
  });

  it("keeps the hard confirmation and metadata constants stable", () => {
    expect(INTERNAL_PROOF_CONFIRMATION_PHRASE).toBe("SEND INTERNAL PROOF");
    expect(INTERNAL_PROOF_METADATA_KIND).toBe("internalProofSend");
  });
});
