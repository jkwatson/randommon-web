// Re-draws the maps of an already generated module from its checkpoint —
// no LLM calls — and regenerates its PDF.
//
// Usage:
//   npm run remap-module -- --checkpoint=module-123.checkpoint.json [--in=my-module.md] [--out=new.md]
//   npm run remap-module -- --checkpoint=... --map-style=classic --no-pdf
//
// --in defaults to the module file recorded in the checkpoint; --out
// defaults to --in (the markdown is updated in place; only maps change).

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { injectMaps } from './inject-maps.js';

const __dir = dirname(fileURLToPath(import.meta.url));

const args = {};
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith('--')) continue;
  const [key, ...rest] = arg.slice(2).split('=');
  args[key] = rest.length ? rest.join('=') : true;
}

const fail = msg => { process.stderr.write(`remap-module: ${msg}\n`); process.exit(1); };

if (!args.checkpoint || !existsSync(args.checkpoint)) fail('--checkpoint=<file> is required and must exist');
const cp = JSON.parse(readFileSync(args.checkpoint, 'utf8'));
if (!cp.dungeonState) fail('checkpoint has no dungeon state');

const input = args.in ?? cp.outFile;
if (!input || !existsSync(input)) fail(`module markdown not found (${input ?? 'none recorded'}); pass --in=<file>`);
const output = args.out ?? input;

const { rooms, map: m } = cp.dungeonState;
const map = { ...m, nodes: new Map(m.nodes), positions: new Set(m.positions) };

const md = injectMaps(readFileSync(input, 'utf8'), { rooms, map }, { classic: args['map-style'] === 'classic' });
writeFileSync(output, md, 'utf8');
process.stderr.write(`Maps redrawn in ${output}\n`);

if (!args['no-pdf']) {
  const pdf = spawnSync('python3', [resolve(__dir, 'module_pdf.py'), output], { stdio: 'inherit' });
  if (pdf.error || pdf.status !== 0) process.stderr.write(`PDF not generated. Retry with: npm run module-pdf -- ${output}\n`);
}
