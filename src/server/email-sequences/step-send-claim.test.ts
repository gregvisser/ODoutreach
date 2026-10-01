import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dispatcher = readFileSync(
  join(process.cwd(), "src/server/email-sequences/send-introduction.ts"),
  "utf8",
);
const queue = readFileSync(
  join(process.cwd(), "src/server/email/outbound/queue-processor.ts"),
  "utf8",
);

describe("two send clocks cannot deliver the same email twice", () => {
  it("claims QUEUED rows with SKIP LOCKED before the provider is called", () => {
    expect(queue).toContain(`"status" = 'QUEUED'`);
    expect(queue).toContain("FOR UPDATE SKIP LOCKED");
    expect(queue).toContain(`"status" = 'PROCESSING'`);
  });

  it("locks the READY step-send row before booking a mailbox", () => {
    const lock = dispatcher.slice(dispatcher.indexOf("SELECT \"id\""));
    expect(lock).toContain(`"status" = 'READY'`);
    expect(lock).toContain(`"outboundEmailId" IS NULL`);
    expect(lock).toContain("FOR UPDATE");
    expect(lock.indexOf("FOR UPDATE")).toBeLessThan(lock.indexOf("tryReserveSendSlotInTransaction"));
  });

  it("does not walk to another mailbox when the step-send key is already booked", () => {
    const duplicate = dispatcher.slice(dispatcher.indexOf("if (reserve.duplicate)"));
    expect(duplicate.slice(0, 240)).toContain("break;");
    expect(duplicate.slice(0, 80)).not.toContain("continue;");
  });
});
