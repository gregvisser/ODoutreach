/**
 * The whole knowledge base for the app-shell "how do I..." search bar
 * (queue row 149), and nothing else.
 *
 * This file imports exactly four static, hand-written exports —
 * `TRAINING_MODULES`, `STAFF_VIDEO_SCRIPTS` and `STAFF_HANDOVER_CHECKLIST`
 * from `./modules`, and `STAFF_HANDOVER_SECTIONS` from
 * `./staff-handover-guide` — and nothing from `@/lib/db`, `@/server/*`, or any
 * other module that could put a client's, a prospect's or a reply's own data
 * in front of a language model. That is what makes `carriesPersonalData:
 * false` on the `TRAINING_ASSISTANT` feature an honest claim rather than an
 * intention: this file has no import path to personal data, so it cannot
 * hand any to the model even if a future edit tried to.
 *
 * Every chunk carries an `href` that resolves to a real, open-able page in
 * this product (never a 404, never a dead anchor) — see
 * `assistant-content.test.ts` for the proof.
 */

import {
  STAFF_HANDOVER_CHECKLIST,
  STAFF_VIDEO_SCRIPTS,
  TRAINING_MODULES,
} from "./modules";
import { STAFF_HANDOVER_SECTIONS } from "./staff-handover-guide";

export type TrainingChunkKind =
  | "module_purpose"
  | "module_step"
  | "module_mistake"
  | "handover_checklist_item"
  | "handover_guide_section"
  | "video_script";

/** One retrievable, citable passage of training content. */
export interface TrainingChunk {
  /** Stable, deterministic — never re-used across content, never re-ordered. */
  readonly id: string;
  readonly kind: TrainingChunkKind;
  /** Human label for a citation, e.g. "Mailboxes and sender identities — step 3". */
  readonly label: string;
  /** Searchable + shown-to-the-model text. */
  readonly text: string;
  /** Deep link into the real product a person can open. */
  readonly href: string;
}

function buildChunks(): TrainingChunk[] {
  const chunks: TrainingChunk[] = [];

  for (const mod of TRAINING_MODULES) {
    chunks.push({
      id: `module:${mod.id}:purpose`,
      kind: "module_purpose",
      label: `${mod.title} — purpose`,
      text: [mod.purpose, ...(mod.details ?? [])].join(" "),
      href: `/training/${mod.id}`,
    });

    mod.steps.forEach((step, i) => {
      chunks.push({
        id: `module:${mod.id}:step:${String(i)}`,
        kind: "module_step",
        label: `${mod.title} — step ${String(i + 1)}: ${step.title}`,
        text: `${step.title}. ${step.detail}`,
        href: `/training/${mod.id}#step-${String(i)}`,
      });
    });

    mod.commonMistakes.forEach((mistake, i) => {
      chunks.push({
        id: `module:${mod.id}:mistake:${String(i)}`,
        kind: "module_mistake",
        label: `${mod.title} — common mistake`,
        text: mistake,
        href: `/training/${mod.id}#mistake-${String(i)}`,
      });
    });
  }

  STAFF_HANDOVER_CHECKLIST.forEach((row, i) => {
    chunks.push({
      id: `handover-checklist:${String(i)}`,
      kind: "handover_checklist_item",
      label: `Staff handover checklist — ${row.step}`,
      text: `${row.step}. ${row.detail}`,
      href: row.portalHref ?? `/training#handover-checklist-${String(i)}`,
    });
  });

  STAFF_HANDOVER_SECTIONS.forEach((section, i) => {
    chunks.push({
      id: `handover-section:${String(i)}`,
      kind: "handover_guide_section",
      label: `Staff training guide — ${section.title}`,
      text: [section.title, ...section.bullets].join(". "),
      href: `/training/staff-handover#handover-section-${String(i)}`,
    });
  });

  for (const script of STAFF_VIDEO_SCRIPTS) {
    chunks.push({
      id: `video-script:${script.id}`,
      kind: "video_script",
      label: `${script.title} — ${script.subtitle}`,
      text: [script.title, script.subtitle, ...script.script].join(". "),
      href: script.portalHref,
    });
  }

  return chunks;
}

/**
 * Built once at import time — the source arrays are static and small (well
 * under a hundred chunks), so there is no reason to defer or memoize it, and
 * every caller sees the same array reference for the life of the process.
 */
export const TRAINING_ASSISTANT_CHUNKS: readonly TrainingChunk[] = buildChunks();

export function getTrainingAssistantChunk(id: string): TrainingChunk | undefined {
  return TRAINING_ASSISTANT_CHUNKS.find((chunk) => chunk.id === id);
}
