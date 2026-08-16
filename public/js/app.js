/* ══════════════════════════════════════════════════════════════════════════
   GLOBAL EPIDEMIC & PANDEMIC TRACKER — entry point
   ──────────────────────────────────────────────────────────────────────────
   Interface layer only. All epidemiological values are SEED data (state.js)
   until loadData() below replaces them with /api/outbreaks' response.

   Everything else lives in its own module:
     state.js        seed data, live app state, severity engine
     globe.js        texture painter, three.js scene, camera math, render loop
     interaction.js  pointer/keyboard input, drill-down, hover tooltip
     drawer.js       the bottom-right guidance drawer
     ui.js           info panel, feed, ramp, breadcrumbs, labels
     freshness.js    "how old is this figure" helpers
     utils.js        $, esc, fmt, clamp, note
   ══════════════════════════════════════════════════════════════════════════ */

import { $, note } from './utils.js';
import { S, SEED, GEO, fetchFirst, buildEntities, isoOf, nameOf, contOf } from './state.js';
import { initScene, paint, rebuildBorders, tick } from './globe.js';
import { bindInput, ensureAdmin1, ensureCities } from './interaction.js';
import { bindUI, refresh, progress } from './ui.js';

/* ═══ THE INTEGRATION POINT ═══════════════════════════════════════════════
   Replace the body of this function with a fetch of your pipeline's output.
   Keep the shape identical to SEED and nothing else needs to change:

     async function loadData(){
       const r = await fetch('https://your-app.vercel.app/api/outbreaks.json');
       const j = await r.json();
       Object.assign(SEED, j);
     }
   ═══════════════════════════════════════════════════════════════════════ */
async function loadData(){
  try{
    const r = await fetch('/api/outbreaks', { cache:'no-store' });
    if(!r.ok) throw new Error(r.status);
    const j = await r.json();
    Object.assign(SEED, j);
    console.log('Live data loaded:', Object.keys(j.countries||{}).length, 'countries');
    return true;
  }catch(e){
    console.warn('Scraper unreachable, using bundled snapshot:', e);
    note('Live data unavailable — showing the bundled snapshot.');
    return false;
  }
}

/* The backend caches /api/outbreaks for 6 hours, but a tab left open all day
   would otherwise never see anything past its first load. Refetch on an
   interval well inside that cache window and fold in whatever changed —
   without this, "live" data only ever meant "live at page load". */
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
let refreshing = false;
async function scheduleRefresh(){
  setInterval(async () => {
    if(refreshing) return;      // don't overlap if the network is slow
    refreshing = true;
    const ok = await loadData();
    if(ok){
      buildEntities();
      paint();
      rebuildBorders();
      refresh();
    }
    refreshing = false;
  }, REFRESH_INTERVAL_MS);
}

async function boot(){
  initScene(); bindInput(); bindUI();
  progress(15, 'Loading boundaries');
  try{
    S.countries = await fetchFirst(GEO.countries);
  }catch(err){
    progress(100, 'Boundaries unavailable');
    $('#boottxt').textContent = 'Could not reach Natural Earth. Check the network, then reload.';
    return;
  }
  progress(55, 'Indexing countries');
  S.countries.features.forEach(f=>{
    const iso = isoOf(f), cont = contOf(f);
    S.byISO.set(iso, {name:nameOf(f), cont, pop:f.properties.POP_EST || 1});
    if(!S.continents.has(cont)) S.continents.set(cont, []);
    S.continents.get(cont).push(iso);
  });

  progress(72, 'Applying surveillance data');
  await loadData();
  buildEntities();

  progress(88, 'Painting severity');
  paint();
  rebuildBorders();
  refresh();

  progress(100, 'Ready');
  setTimeout(()=>$('#boot').classList.add('gone'), 260);
  tick();

  // Pull the state and city datasets straight away, in the background, so
  // there's no stall the first time someone zooms in.
  ensureAdmin1();
  ensureCities();

  scheduleRefresh();

  const age = Math.round((Date.now()-new Date(SEED.updated))/86400000);
  if(age > 7) note(`Dataset is ${age} days old — the pipeline may have stalled.`);
}

boot();
