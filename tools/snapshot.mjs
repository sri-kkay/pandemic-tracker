#!/usr/bin/env node
/* Takes one /api/outbreaks response and writes the slice of it that the map
   needs to re-score a past day.

   It stores raw records rather than computed severities on purpose. Severity
   on this map is not a property of a record, it is the output of rules that
   live in index.html: decay by age, the attack-rate guard, the region rollup,
   the routine-surveillance floor. Those rules change. If a snapshot held
   yesterday's numbers, every rule change would silently rewrite history and
   the "what changed" view would show edits to the scoring as if they were
   events in the world.

   So the snapshot holds inputs, the page applies today's rules to both ends,
   and a diff between them is a difference in the data and nothing else.

   Usage:  node tools/snapshot.mjs <live.json> <history-dir> [YYYY-MM-DD]      */

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const KEEP_DAYS = 120;     // the view needs 7; the rest is room for trends later

/* Only the fields that feed the scoring. Source, url, confidence and the
   provisional flag are all display, and display comes from the live payload. */
function slim(d){
  const o = { n: d.name };
  if(d.severity != null) o.s = d.severity;
  if(d.cases    != null) o.c = d.cases;
  if(d.deaths   != null) o.d = d.deaths;
  if(d.per100k  != null) o.p = d.per100k;
  if(d.cfr      != null) o.f = d.cfr;
  if(d.growth7d != null) o.g = d.growth7d;
  if(d.asOf)             o.a = d.asOf;
  if(d.routine)          o.r = 1;
  return o;
}

/* A place keeps its population when it has one, because the region rollup is
   population-weighted and scoring the past without it would weight a province
   differently from the way the live map weights it. */
function slimPlaces(places){
  const out = {};
  for(const [key, rec] of Object.entries(places || {})){
    const ds = (rec.diseases || []).map(slim);
    if(!ds.length) continue;
    out[key] = rec.pop != null ? { p: rec.pop, d: ds } : { d: ds };
  }
  return out;
}

export function buildSnapshot(payload, date){
  return {
    date,
    generated: payload.updated || null,
    countries: slimPlaces(payload.countries),
    admin1:    slimPlaces(payload.admin1)
  };
}

async function main(){
  const [src, dir, dateArg] = process.argv.slice(2);
  if(!src || !dir){
    console.error('usage: node tools/snapshot.mjs <live.json> <history-dir> [YYYY-MM-DD]');
    process.exit(2);
  }
  const payload = JSON.parse(await readFile(src, 'utf8'));

  const n = Object.keys(payload.countries || {}).length;
  if(n < 50){
    console.error(`refusing to snapshot: only ${n} countries in the payload, the collector probably failed`);
    process.exit(1);
  }

  const date = dateArg || new Date().toISOString().slice(0, 10);
  await mkdir(dir, { recursive: true });

  const snap = buildSnapshot(payload, date);
  const file = path.join(dir, date + '.json');
  await writeFile(file, JSON.stringify(snap));

  // prune anything past the window, then rewrite the index newest first
  const all = (await readdir(dir)).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().reverse();
  for(const old of all.slice(KEEP_DAYS)) await unlink(path.join(dir, old));

  const dates = all.slice(0, KEEP_DAYS).map(f => f.replace('.json',''));
  await writeFile(path.join(dir, 'index.json'), JSON.stringify(dates));

  const kb = (JSON.stringify(snap).length / 1024).toFixed(0);
  console.log(`wrote ${file} (${kb} KB, ${n} countries), ${dates.length} snapshots on file`);
}

if(import.meta.url === `file://${process.argv[1]}`) main();
