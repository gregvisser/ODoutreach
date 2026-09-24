import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  clientPickerSelectionLabel,
  filterClientPickerOptions,
} from "./client-picker-logic";

const clients = [
  { id: "a", name: "Advantos HVAC Group" },
  { id: "b", name: "Chevron Security" },
  { id: "c", name: "OpensDoors" },
];

describe("filterClientPickerOptions", () => {
  it("returns every client when the search is blank", () => {
    expect(filterClientPickerOptions(clients, "  ")).toEqual(clients);
  });

  it("matches a partial name without caring about case", () => {
    expect(filterClientPickerOptions(clients, "chevron").map((c) => c.id)).toEqual(["b"]);
    expect(filterClientPickerOptions(clients, "HVAC").map((c) => c.id)).toEqual(["a"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterClientPickerOptions(clients, "zzz")).toEqual([]);
  });
});

describe("clientPickerSelectionLabel", () => {
  it("uses the all-clients label when nothing is selected", () => {
    expect(clientPickerSelectionLabel(clients, null, "All accessible clients")).toBe(
      "All accessible clients",
    );
  });

  it("uses the selected client's name", () => {
    expect(clientPickerSelectionLabel(clients, "c", "All accessible clients")).toBe("OpensDoors");
  });

  it("falls back when the id is not in the list", () => {
    expect(clientPickerSelectionLabel(clients, "missing", "All accessible clients")).toBe(
      "Selected client",
    );
  });
});

describe("ClientPicker source", () => {
  const source = readFileSync(join(process.cwd(), "src/components/clients/client-picker.tsx"), "utf8");

  it("is a searchable listbox and keeps an all-clients option", () => {
    expect(source).toContain('role="listbox"');
    expect(source).toContain("Search clients");
    expect(source).toContain("All accessible clients");
    expect(source).toContain("hrefFor");
    expect(source).toContain("router.push");
  });
});
