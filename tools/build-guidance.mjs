/* ===========================================================================
   tools/build-guidance.mjs

   Writes public/data/guidance.json from the curated library in
   api/_guidance.js. The browser loads that file at boot, which is what makes
   the drawer correct even when the serverless functions are unreachable — the
   failure mode that used to show auto-compiled encyclopaedia text for
   diseases the library already covered.

   Run it after editing anything in the LIBRARY:

       node tools/build-guidance.mjs

   It prints what it wrote. Commit the JSON alongside the library change.
   =========================================================================== */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guidanceBundle } from '../api/_guidance.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'public', 'data', 'guidance.json');

const bundle = guidanceBundle();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(bundle));

const bytes = JSON.stringify(bundle).length;
console.log(`guidance.json written to ${out}`);
console.log(`  ${Object.keys(bundle.entries).length} curated diseases`);
console.log(`  ${bundle.index.length} names and aliases indexed`);
console.log(`  ${(bytes / 1024).toFixed(0)} kB`);
