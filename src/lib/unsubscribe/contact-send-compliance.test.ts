import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareContactSendCompliance } from "./contact-send-compliance";

describe("prepareContactSendCompliance", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates text and HTML bodies with clean unsubscribe footer ordering", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");

    const result = prepareContactSendCompliance({
      bodyText: "Hello\n\nAdam OpensDoors\nOpensDoors",
      clientDefaultSenderEmail: "adam@opensdoors.co.uk",
    });

    expect(result.finalBody).toContain("Unsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/");
    expect(result.bodyParts.text).toBe(result.finalBody);
    expect(result.bodyParts.html).toContain(">Unsubscribe</a>");
    expect(result.bodyParts.html).not.toContain("Unsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/");
    expect(result.bodyParts.html.indexOf("Adam OpensDoors")).toBeLessThan(
      result.bodyParts.html.indexOf(">Unsubscribe</a>"),
    );
  });
});
