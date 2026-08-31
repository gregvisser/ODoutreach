import { describe, expect, it } from "vitest";

import {
  getTrainingAssistantChunk,
  TRAINING_ASSISTANT_CHUNKS,
} from "./assistant-content";
import { getTrainingModule, TRAINING_MODULES } from "./modules";

const MODULE_HREF = /^\/training\/([a-z0-9-]+)(#(step|mistake)-\d+)?$/;
const HANDOVER_INDEX_HREF = /^\/training(#handover-checklist-\d+)?$/;
const HANDOVER_SECTION_HREF = /^\/training\/staff-handover#handover-section-\d+$/;
const PORTAL_HREF = /^\/[a-z-]+$/;

describe("TRAINING_ASSISTANT_CHUNKS", () => {
  it("is built from real content — more than a handful of chunks", () => {
    expect(TRAINING_ASSISTANT_CHUNKS.length).toBeGreaterThan(20);
  });

  it("gives every chunk a stable, unique id", () => {
    const ids = TRAINING_ASSISTANT_CHUNKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every chunk non-empty label and text", () => {
    for (const chunk of TRAINING_ASSISTANT_CHUNKS) {
      expect(chunk.label.trim().length).toBeGreaterThan(0);
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("resolves every chunk's href to a real, open-able page — a module, the training index, the handover guide, or a real portal route", () => {
    for (const chunk of TRAINING_ASSISTANT_CHUNKS) {
      const isModuleHref = MODULE_HREF.test(chunk.href);
      const isHandoverIndexHref = HANDOVER_INDEX_HREF.test(chunk.href);
      const isHandoverSectionHref = HANDOVER_SECTION_HREF.test(chunk.href);
      const isPortalHref = PORTAL_HREF.test(chunk.href);

      const isRecognisedHref =
        isModuleHref || isHandoverIndexHref || isHandoverSectionHref || isPortalHref;
      if (!isRecognisedHref) {
        throw new Error(`Unexpected href shape for chunk ${chunk.id}: ${chunk.href}`);
      }

      if (isModuleHref) {
        const moduleId = chunk.href.match(MODULE_HREF)?.[1];
        expect(getTrainingModule(moduleId ?? "")).not.toBeNull();
      }
    }
  });

  it("produces at least one chunk per module (purpose, at minimum)", () => {
    for (const mod of TRAINING_MODULES) {
      const hasPurposeChunk = TRAINING_ASSISTANT_CHUNKS.some(
        (c) => c.id === `module:${mod.id}:purpose`,
      );
      expect(hasPurposeChunk).toBe(true);
    }
  });
});

describe("getTrainingAssistantChunk", () => {
  it("returns the chunk for a real id", () => {
    const chunk = TRAINING_ASSISTANT_CHUNKS[0];
    expect(getTrainingAssistantChunk(chunk.id)).toEqual(chunk);
  });

  it("returns undefined for an id that was never generated", () => {
    expect(getTrainingAssistantChunk("not-a-real-id")).toBeUndefined();
  });
});
