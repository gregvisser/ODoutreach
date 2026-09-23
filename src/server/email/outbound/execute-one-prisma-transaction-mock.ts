import { vi } from "vitest";

/** Partial transaction client used by execute-one unit tests (real dispatch boundary). */
export function executeOnePrismaTransactionExtras() {
  return {
    clientEmailSequenceStepSend: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}
