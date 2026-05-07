import { describe, expect, it } from "vitest";

import { OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL } from "@/lib/staff/opensdoors-superadmin";

import { getMainNavForStaff, mainNav } from "./nav-config";

describe("getMainNavForStaff", () => {
  it("hides Admin operations for non-superadmin", () => {
    const nav = getMainNavForStaff({ email: "joe@opensdoors.co.uk" });
    expect(nav.some((i) => i.href === "/operations/outbound")).toBe(false);
    expect(nav.length).toBe(mainNav.length - 1);
  });

  it("includes Admin operations for greg@opensdoors.co.uk", () => {
    const nav = getMainNavForStaff({ email: OPENS_DOORS_PLATFORM_SUPERADMIN_EMAIL });
    expect(nav.map((i) => i.href)).toEqual(mainNav.map((i) => i.href));
  });
});
