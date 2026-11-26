import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const starts = new Map(manifest.sentences.map((e) => [`${e.para}:${e.sent}`, e.start]));
const at = (key, offset = 0) => Math.round((starts.get(key) + offset) * 100) / 100;
const total = manifest.total;

const steps = [
  { do: 'at', s: 0.55 },
  { do: 'move', selector: '#notes-input', ms: 850 },
  { do: 'at', s: at('0:0', 3.2) },
  { do: 'move', selector: '#load-sample', ms: 850 },
  { do: 'at', s: at('1:0', 0.05) },
  { do: 'click', selector: '#load-sample' },
  { do: 'at', s: at('1:0', 1.45) },
  { do: 'move', selector: '#split-button', ms: 750 },
  { do: 'at', s: at('1:0', 2.45) },
  { do: 'click', selector: '#split-button' },
  { do: 'at', s: at('2:0', 0.2) },
  { do: 'move', selector: '.flashcard', ms: 900 },
  { do: 'eval', js: "document.getElementById('card-grid').scrollTop = 120" },
  { do: 'at', s: at('2:0', 1.9) },
  { do: 'eval', js: "document.getElementById('card-grid').scrollTop = 260" },
  { do: 'at', s: at('2:1', 0.15) },
  { do: 'eval', js: "document.getElementById('card-grid').scrollTop = 0" },
  { do: 'move', selector: '.flashcard .card-meta', ms: 750 },
  { do: 'at', s: at('3:0', 0.1) },
  { do: 'move', selector: '#route-monitor', ms: 900 },
  { do: 'at', s: at('3:1', 0.25) },
  { do: 'move', selector: '#privacy-badge', ms: 700 },
  { do: 'at', s: at('4:0', 0.05) },
  { do: 'move', selector: '#probe-state', ms: 700 },
  { do: 'eval', js: "window.__studysplit.state.probeOverride = 'absent'; document.getElementById('probe-state').textContent = 'absent · demo probe override'" },
  { do: 'at', s: at('4:0', 1.55) },
  { do: 'click', selector: '#split-button' },
  { do: 'at', s: at('4:0', 2.35) },
  { do: 'eval', js: "if (window.__studysplit.state.runs.length < 2) document.getElementById('split-button').click()" },
  { do: 'at', s: at('4:0', 3.6) },
  { do: 'move', selector: '#lane-cloud', ms: 700 },
  { do: 'at', s: at('5:0', 0.15) },
  { do: 'move', selector: '#mode-pill', ms: 850 },
  { do: 'at', s: at('5:1', 0.15) },
  { do: 'move', selector: '#input-note', ms: 800 },
  { do: 'at', s: at('6:0', 0.1) },
  { do: 'move', selector: '#export-json', ms: 700 },
  { do: 'at', s: at('6:0', 1.25) },
  { do: 'click', selector: '#export-json' },
  { do: 'at', s: at('6:0', 2.5) },
  { do: 'move', selector: '#print-deck', ms: 650 },
  { do: 'at', s: at('6:1', 0.2) },
  { do: 'move', selector: '#last-reason', ms: 850 },
  { do: 'at', s: Math.max(0, total - 0.55) }
];

writeFileSync(join(dir, 'steps.json'), `${JSON.stringify(steps, null, 1)}\n`);
console.log(`steps.json written for ${total.toFixed(2)} s narration`);
