import { describe, expect, it } from "vitest";

import {
  autonomousSendDescription,
  autonomousSendLabel,
  autonomousSendSetting,
  autonomousSendSettingToColumn,
  formatAutonomousSendAttribution,
  parseAutonomousSendSetting,
} from "./client-autonomous-send";

describe("the three states are genuinely three", () => {
  it("tells 'nobody decided' apart from 'someone decided no'", () => {
    // The whole reason the column is nullable. Both refuse a machine send, but
    // they are different facts and staff have to be able to see which is which.
    expect(autonomousSendSetting(null)).toBeNull();
    expect(autonomousSendSetting(undefined)).toBeNull();
    expect(autonomousSendSetting(false)).toBe("HUMAN");
    expect(autonomousSendSetting(true)).toBe("MACHINE");

    expect(autonomousSendLabel(null)).toBe("Not set");
    expect(autonomousSendLabel(false)).toBe("Human sending");
    expect(autonomousSendLabel(true)).toBe("Machine sending");
    expect(autonomousSendDescription(null)).not.toBe(autonomousSendDescription(false));
  });

  it("never shows a raw boolean or a dev-ism to staff", () => {
    for (const value of [null, undefined, true, false] as const) {
      const label = autonomousSendLabel(value);
      const description = autonomousSendDescription(value);
      expect(label).not.toMatch(/true|false|null|undefined/i);
      expect(description).not.toMatch(/\btrue\b|\bfalse\b|null|undefined|autonomousSend/i);
      expect(description.length).toBeGreaterThan(30);
    }
  });
});

describe("an untrusted form value cannot become a decision by accident", () => {
  it("accepts only the two real settings", () => {
    expect(parseAutonomousSendSetting("MACHINE")).toBe("MACHINE");
    expect(parseAutonomousSendSetting(" human ")).toBe("HUMAN");
    for (const junk of ["", "  ", "yes", "true", "1", "ON", null, undefined, "MACHINES"]) {
      expect(parseAutonomousSendSetting(junk)).toBeNull();
    }
  });

  it("maps the setting to the column without inverting it", () => {
    // A flipped boolean here would silently turn every 'human sending' client
    // into a machine-sending one. Worth one line of test.
    expect(autonomousSendSettingToColumn("MACHINE")).toBe(true);
    expect(autonomousSendSettingToColumn("HUMAN")).toBe(false);
  });
});

describe("the signature line", () => {
  const setAt = new Date(Date.UTC(2026, 7, 28, 14, 2));

  it("names who set it and when, in the shape the owner asked for", () => {
    expect(formatAutonomousSendAttribution({ enabled: true, setByName: "Sophie", setAt })).toBe(
      "Set to Machine sending by Sophie, 28 Aug 14:02",
    );
    expect(formatAutonomousSendAttribution({ enabled: false, setByName: "Lucy", setAt })).toBe(
      "Set to Human sending by Lucy, 28 Aug 14:02",
    );
  });

  it("keeps the timestamp when the member of staff has since been deleted", () => {
    // The FK is ON DELETE SET NULL. Losing the name is bad; losing the fact
    // that a decision was ever made is worse.
    const line = formatAutonomousSendAttribution({ enabled: true, setByName: null, setAt });
    expect(line).toBe("Set to Machine sending by a former member of staff, 28 Aug 14:02");
  });

  it("returns nothing at all when nobody has set it", () => {
    expect(
      formatAutonomousSendAttribution({ enabled: null, setByName: "Sophie", setAt }),
    ).toBeNull();
    expect(
      formatAutonomousSendAttribution({ enabled: true, setByName: "Sophie", setAt: null }),
    ).toBeNull();
  });
});
