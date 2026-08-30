import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLoggerForTesting, reportError } from "./logger";

/**
 * The default `logger` writes via pino's own sonic-boom destination straight
 * to the stdout file descriptor, not through `process.stdout.write` — so a
 * spy on that method sees nothing. `createLoggerForTesting` builds a logger
 * the identical way (same redact/formatters/serializers config) pointed at a
 * plain `Writable` this test controls, which is real pino output, not a
 * simulation of it.
 *
 * Why this suite exists: until row 116
 * (`docs/ops/2026-08-30-row116-production-logging.md`) nothing ever captured
 * this logger's stdout in production, so whatever it was handed went nowhere.
 * Now that something does, whatever it has ever been handed becomes readable
 * by a human — so this proves it cannot carry a prospect's email address, no
 * matter which field it arrives in or how deep it is buried in a caught
 * error's own message.
 */
function loggerWithCapture() {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLoggerForTesting(sink), records: () => lines.map((line) => JSON.parse(line)) };
}

describe("logger redacts prospect email addresses", () => {
  it("removes an email address passed as a plain field value", () => {
    const { logger, records } = loggerWithCapture();

    logger.info({ prospectEmail: "alice@example.com" }, "test message");

    expect(JSON.stringify(records()[0])).not.toContain("alice@example.com");
  });

  it("removes an email address embedded inside a free-text string, at any nesting depth", () => {
    const { logger, records } = loggerWithCapture();

    logger.info(
      {
        detail: "sent to alice@example.com about pricing",
        nested: { deeper: { note: "cc bob@opensdoors.co.uk" } },
      },
      "test message",
    );

    const serialised = JSON.stringify(records()[0]);
    expect(serialised).not.toContain("alice@example.com");
    expect(serialised).not.toContain("bob@opensdoors.co.uk");
  });

  it("removes an email address surfaced through a caught error's message (reportError)", () => {
    const { logger, records } = loggerWithCapture();

    reportError(new Error("Send failed for carol@prospect-company.com"), { scope: "test" }, logger);

    const serialised = JSON.stringify(records()[0]);
    expect(serialised).not.toContain("carol@prospect-company.com");
  });

  it("is capable of failing: a whole request-shaped object dumped into context still gets scrubbed", () => {
    // The exact regression this test exists to catch: someone later decides a
    // caught error needs "more context" and logs an entire request object
    // instead of a scoped field. If the scrub only ever looked at known field
    // names, this would sail straight through.
    const { logger, records } = loggerWithCapture();

    logger.warn(
      {
        req: {
          url: "/api/webhooks/inbound?to=dana@prospect-company.com",
          headers: { "x-forwarded-for": "203.0.113.4" },
          body: { from: "dana@prospect-company.com", subject: "Re: your outreach" },
        },
      },
      "dumped the whole request",
    );

    expect(JSON.stringify(records()[0])).not.toContain("dana@prospect-company.com");
  });

  it("leaves non-personal structured fields intact", () => {
    const { logger, records } = loggerWithCapture();

    logger.info({ scope: "ai.classify-reply", replyId: "reply_123", clientSlug: "opensdoors" }, "ok");

    expect(records()[0]).toMatchObject({
      scope: "ai.classify-reply",
      replyId: "reply_123",
      clientSlug: "opensdoors",
    });
  });
});
