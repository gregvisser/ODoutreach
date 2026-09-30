import { describe, expect, it } from "vitest";

import { isFormFieldDirty } from "./form-dirty";

describe("isFormFieldDirty", () => {
  it("detects changed text inputs", () => {
    const input = {
      tagName: "INPUT",
      type: "text",
      value: "edited",
      defaultValue: "original",
    } as HTMLInputElement;
    expect(isFormFieldDirty(input)).toBe(true);
  });

  it("ignores unchanged text inputs", () => {
    const input = {
      tagName: "INPUT",
      type: "text",
      value: "same",
      defaultValue: "same",
    } as HTMLInputElement;
    expect(isFormFieldDirty(input)).toBe(false);
  });

  it("detects toggled checkboxes", () => {
    const box = {
      tagName: "INPUT",
      type: "checkbox",
      checked: true,
      defaultChecked: false,
    } as HTMLInputElement;
    expect(isFormFieldDirty(box)).toBe(true);
  });
});
