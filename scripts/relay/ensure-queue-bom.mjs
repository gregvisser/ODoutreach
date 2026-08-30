#!/usr/bin/env node
/**
 * Restores QUEUE.md's UTF-8 byte-order mark if something wrote the file without one.
 *
 * WHY THIS EXISTS - queue row 127, 30 August 2026.
 *
 * `relay/queue-file-integrity.test.ts` only ever caught the BOM going missing after
 * the fact, in CI, on a pull request already opened. It happened twice in one day
 * (rows 121 and 127) and both times the loss was already in the WORKING TREE before
 * either cycle had committed anything - which rules out `relay-watch.ps1` as the
 * writer. Its every `Set-Content -Path $QueueFile ... -Encoding utf8` call runs
 * under Windows PowerShell 5.1 (the host `relay-start.cmd` launches), where the
 * "utf8" encoding always WRITES a BOM - confirmed by reading `relay-watch.ps1`
 * itself, not assumed.
 *
 * The reproduced cause: cycles edit QUEUE.md through the Claude Code harness's own
 * file tools, and only one of the two silently drops the BOM. Its line-level Edit
 * tool preserves an existing BOM (verified directly: edit a BOM'd file, the BOM
 * survives byte for byte). Its Write tool - a full-file replace, the natural choice
 * for a larger rewrite - does not: writing plain text back out through it left a
 * throwaway BOM'd file starting with the first content byte, no BOM, reproduced
 * twice. That tool lives outside this repository and cannot be patched here.
 *
 * What CAN be fixed here is the one gate every change must pass before it reaches
 * git history: the commit itself. See `.githooks/pre-commit`, installed by
 * `scripts/relay/install-git-hooks.mjs` (wired as the npm "prepare" script, so it
 * is live after `npm install`/`npm ci` on any machine, not just one configured by
 * hand). Whatever silently strips the BOM in the working tree, this restores it
 * before the commit is made - the test still guards the rare case where a commit
 * is made with hooks bypassed (`--no-verify`).
 *
 * Byte-level, not text-level, on purpose: reading the file as a JS string and
 * writing it back out is the exact class of operation that drops a BOM (see
 * above). This only ever touches the first three bytes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** Pure byte-buffer logic, so it can be unit tested with no filesystem involved. */
export function ensureBom(buffer) {
  if (buffer.subarray(0, 3).equals(BOM)) {
    return { buffer, changed: false };
  }
  return { buffer: Buffer.concat([BOM, buffer]), changed: true };
}

/** Reads/writes as a raw Buffer throughout - never decodes to a string. */
export function ensureFileBom(path) {
  const original = readFileSync(path);
  const { buffer, changed } = ensureBom(original);
  if (changed) writeFileSync(path, buffer);
  return changed;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: ensure-queue-bom.mjs <path>");
    process.exit(1);
  }
  const changed = ensureFileBom(path);
  if (changed) {
    console.log(`ensure-queue-bom: restored the UTF-8 BOM on ${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
