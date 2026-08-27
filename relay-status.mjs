#!/usr/bin/env node
/**
 * RELAY STATUS — the relay in plain English, in a browser.
 *
 * Greg is not a coder and should not have to open four markdown files in
 * Notepad to find out what happened overnight. This reads the relay's own
 * files and renders one page: what is happening now, what the plan is, and
 * what each cycle actually did.
 *
 * A READER ONLY. It writes nothing except its own HTML output, so it can
 * never disagree with the relay or interfere with a running cycle.
 *
 *   node relay-status.mjs            # writes relay-status.html
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RELAY = join(ROOT, '.bidlow', 'relay');
const LOG = join(RELAY, 'log');

// PowerShell writes these logs in an encoding that mangles ordinary
// punctuation, so an em-dash arrives as "ÔÇö" or "â€\u201d". The real fix is in
// relay-watch.ps1 (write UTF-8 explicitly) and is queued. Until then, repair
// the known sequences here so the thing Greg is meant to READ is readable.
const MOJIBAKE = [
  [/ÔÇö|â€"|â€\u201d/g, '\u2014'], [/ÔÇô|â€"/g, '\u2013'],
  [/ÔÇÖ|â€\u2122/g, '\u2019'],    [/ÔÇÿ|â€\u02dc/g, '\u2018'],
  [/ÔÇ£|â€\u0153/g, '\u201c'],    [/ÔÇ¥/g, '\u201d'],
  [/Â /g, ' '], [/â€¦/g, '\u2026'],
];
const read = p => {
  try {
    let t = readFileSync(p, 'utf8').replace(/^\ufeff/, '');
    for (const [re, to] of MOJIBAKE) t = t.replace(re, to);
    return t;
  } catch { return null; }
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

// --- what is happening right now
let status = {};
try { status = JSON.parse(read(join(RELAY, 'STATUS.json')) || '{}'); } catch {}
const halted = existsSync(join(RELAY, 'HALT'));
const queued = existsSync(join(RELAY, 'NEXT.md'));
const mins = status.updated ? Math.round((Date.now() - new Date(status.updated)) / 60000) : null;

const state = halted ? ['STOPPED', 'Someone created the HALT file. Delete it and start the watcher to continue.', 'stop']
  : status.lastOutcome === 'running'
    ? (mins != null && mins > 46
        // The watcher kills any cycle at its own 45-minute deadline and moves on.
        // So "still running" past 46 minutes means the WATCHER is wedged, not the work.
        // Anything under that is a normal cycle: measured 20-53 minutes across cycles
        // 4-13, median about 40. The old threshold here was 20 minutes, which is below
        // the median - it called nearly every healthy cycle "possibly stuck". Nobody
        // needs to act on this page; the hourly guard checks and messages Greg only if
        // something is genuinely wrong.
        ? ['NEEDS A LOOK', `Cycle ${status.cycle} has said "running" for ${mins} minutes. The watcher kills a cycle at 45 minutes, so it should have moved on by now. The hourly guard has been told.`, 'warn']
        : ['WORKING', `Cycle ${status.cycle} started ${mins} minute${mins === 1 ? '' : 's'} ago. Cycles normally take 20-50 minutes.`, 'go'])
    : queued ? ['ABOUT TO START', 'Work is queued. The watcher picks it up within a minute.', 'go']
    : ['IDLE', `Last cycle finished. Nothing queued right now.`, 'idle'];

// --- the plan
const queue = read(join(RELAY, 'QUEUE.md')) || '';
// `TODO` used to be matched WITHOUT a trailing wildcard, so any row whose status
// carried a note - "TODO - MIGRATION PRE-APPROVED", "TODO - reconciled with cycle 14"
// - matched nothing and vanished from this page. Three real rows were invisible,
// including the one holding the demo defect list. A status page that silently drops
// rows is worse than no status page, so `allRows` is counted separately below and any
// gap is printed.
const allRows = (queue.match(/^\|\s*\d+\s*\|/gm) || []).length;

// ONE PARSER, ONE TRUTH. This page used to read the queue with its own
// hand-rolled regex, and on 2026-08-27 it disagreed with the relay: row 23's
// status is written in markdown bold (`| **DONE 34 - ...** |`), which the
// watcher steps over deliberately and this page could not read at all. So the
// page warned "1 row could not be read" on every refresh about a row that was
// perfectly readable and already DONE. A status page that cries wolf gets
// ignored, and then it is no longer a status page.
//
// These two patterns are ported from relay-watch.ps1 line for line, including
// WHY there are two: the item cell is GREEDY so the boundary is the LAST viable
// pipe rather than the first, and STRICT requires whitespace on both sides of
// that boundary so an inline pipe ("TODO|DONE", "NODE|20-lts") cannot be
// mistaken for a column edge. LOOSE is the fallback for a row written compactly.
const KW = 'TODO|DONE|BLOCKED|PARTIAL|IN PROGRESS|WONTFIX';
const ROW_STRICT = new RegExp(`^\\s*\\|\\s*(\\d+)\\s*\\|(.*\\s)\\|\\s+(?:\\*{1,2}|_{1,2})?\\s*((?:${KW})\\b.*?)\\s*\\|\\s*$`);
const ROW_LOOSE  = new RegExp(`^\\s*\\|\\s*(\\d+)\\s*\\|(.*)\\|\\s*(?:\\*{1,2}|_{1,2})?\\s*((?:${KW})\\b.*?)\\s*\\|\\s*$`);
const rows = [];
for (const line of queue.split(/\r?\n/)) {
  if (!/^\s*\|\s*\d+\s*\|/.test(line)) continue;
  const m = ROW_STRICT.exec(line) || ROW_LOOSE.exec(line);
  if (!m) continue;
  rows.push({ n: m[1], what: m[2].replace(/\s*\|\s*$/, '').trim(), st: m[3].trim() });
}
const missed = allRows - rows.length;
const plain = s => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');

// --- what each cycle did
const cycles = existsSync(LOG) ? readdirSync(LOG).filter(f => /^cycle-\d+\.md$/.test(f))
  .sort((a, b) => b.localeCompare(a)) : [];

const md = t => esc(t)
  .replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^# (.+)$/gm, '<h3>$1</h3>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>').replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
  .replace(/\n{2,}/g, '</p><p>');

const html = `<!doctype html><meta charset="utf-8"><title>ODoutreach relay</title>
<style>
:root{--bg:#0f1115;--card:#171a21;--line:#2a2f3a;--ink:#e6e8ee;--dim:#9aa3b2;--go:#3fb950;--warn:#d29922;--stop:#f85149;--idle:#6b7280;--accent:#4a9eff}
*{box-sizing:border-box}body{margin:0;padding:28px;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,Segoe UI,system-ui,sans-serif}
.wrap{max-width:960px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--dim);font-size:13px;margin-bottom:22px}
.now{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:8px;padding:16px 18px;margin-bottom:24px}
.badge{font-size:11px;letter-spacing:.1em;font-weight:700;color:var(--c)}
.now p{margin:6px 0 0}
h2{font-size:13px;letter-spacing:.1em;color:var(--dim);text-transform:uppercase;margin:28px 0 10px;font-weight:700}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
td{padding:10px 14px;border-top:1px solid var(--line);vertical-align:top;font-size:14px}
tr:first-child td{border-top:none}td.n{width:34px;color:var(--dim)}td.s{width:130px;text-align:right;font-size:12px;font-weight:700}
.TODO{color:var(--dim)}.DONE{color:var(--go)}.INPROGRESS{color:var(--accent)}.BLOCKED{color:var(--stop)}
details{background:var(--card);border:1px solid var(--line);border-radius:8px;margin-bottom:8px}
summary{padding:12px 16px;cursor:pointer;font-weight:600}
.body{padding:0 18px 14px;color:var(--dim);font-size:14px}.body h3,.body h4{color:var(--ink);font-size:14px;margin:14px 0 6px}
.body code{background:#0b0d11;padding:1px 5px;border-radius:3px;font-size:12.5px}
.foot{color:var(--dim);font-size:12px;margin-top:30px;border-top:1px solid var(--line);padding-top:14px}
</style>
<div class="wrap">
<h1>ODoutreach relay</h1>
<div class="sub">Refresh this page to see the latest. Generated ${new Date().toLocaleString('en-GB')}</div>
<div class="sub" style="color:var(--go)">Nothing on this page needs you. A guard checks the relay every hour on its own and only messages you if something is actually wrong. This page is here if you feel like looking, not because anyone has to.</div>

<div class="now" style="--c:var(--${state[2]})">
  <div class="badge">${state[0]}</div>
  <p>${esc(state[1])}</p>
</div>

<h2>The plan</h2>
${missed > 0 ? `<div class="sub" style="color:var(--warn)">${missed} row${missed===1?'':'s'} in QUEUE.md could not be read and ${missed===1?'is':'are'} not shown below. The status column is malformed on ${missed===1?'it':'them'}.</div>` : ''}
<table>${rows.map(r => `<tr><td class="n">${r.n}</td><td>${esc(plain(r.what))}</td>
  <td class="s ${r.st.split(' ')[0].replace(/\s/g,'')}">${esc(r.st)}</td></tr>`).join('')}</table>

<h2>What each cycle did — newest first</h2>
${cycles.length ? cycles.map((f, i) => {
  const t = read(join(LOG, f)) || '';
  const first = (t.split('\n').find(l => l.trim() && !l.startsWith('#')) || '').slice(0, 110);
  return `<details${i === 0 ? ' open' : ''}><summary>${esc(f.replace('.md',''))} — ${esc(first)}</summary>
    <div class="body"><p>${md(t)}</p></div></details>`;
}).join('') : '<p style="color:var(--dim)">No cycles have finished yet.</p>'}

<div class="foot">
To stop everything: create a file called <code>HALT</code> in <code>.bidlow\\relay\\</code>.<br>
To see it live: the PowerShell window prints a line as each cycle starts and finishes.
</div>
</div>`;

writeFileSync(join(ROOT, 'relay-status.html'), html);
console.log('Wrote relay-status.html');
