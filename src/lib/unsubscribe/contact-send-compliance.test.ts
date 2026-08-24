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
      hostedBaseUrl: "https://opensdoors.bidlow.co.uk",
    });

    expect(result.finalBody).toContain("Unsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/");
    expect(result.bodyParts.text).toBe(result.finalBody);
    expect(result.bodyParts.html).toContain(">Unsubscribe</a>");
    expect(result.bodyParts.html).not.toContain("Unsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/");
    expect(result.bodyParts.html.indexOf("Adam OpensDoors")).toBeLessThan(
      result.bodyParts.html.indexOf(">Unsubscribe</a>"),
    );
  });

  it("H1 — List-Unsubscribe header points at the POST /api/ path while the body link stays on the page path", () => {
    vi.stubEnv("AUTH_URL", "https://opensdoors.bidlow.co.uk");

    const result = prepareContactSendCompliance({
      bodyText: "Hello",
      clientDefaultSenderEmail: "adam@opensdoors.co.uk",
      hostedBaseUrl: "https://opensdoors.bidlow.co.uk",
    });

    expect(result.kind).toBe("hosted");
    if (result.kind === "hosted") {
      // Header → one-click POST endpoint.
      expect(result.listUnsubscribe).toContain(
        "<https://opensdoors.bidlow.co.uk/api/unsubscribe/",
      );
      expect(result.listUnsubscribePost).toBe("List-Unsubscribe=One-Click");
    }
    // Body footer → human confirmation page (NOT the /api/ path).
    expect(result.finalBody).toContain(
      "Unsubscribe: https://opensdoors.bidlow.co.uk/unsubscribe/",
    );
    expect(result.finalBody).not.toContain("/api/unsubscribe/");
  });
});
