/* ── UI RENDER ────────────────────────────────────────────────────────────
   Everything that draws the chrome around the globe: the info panel,
   breadcrumbs, outbreak feed, severity ramp, on-globe labels, and the
   refresh cycle that ties data changes back to a repaint. */

import { $, fmt, esc, trendArrow } from './utils.js';
import { ago, ageDays, freshestAsOf, freshBadge } from './freshness.js';
import {
  S, SEED, CONTINENT_LABEL, TIERS, tierOf, entitySeverity, diseaseSeverity,
  rollup, isoOf, nameOf, aggregateDiseases
} from './state.js';
import { paint, rebuildBorders, currentLOD, cam, camera, spin, latLonToVec, R, FADE, fadeIn } from './globe.js';
import { ensureAdmin1, regionByName, selectAdmin1, selectCountry, selectContinent, goWorld } from './interaction.js';
import { renderDrawer } from './drawer.js';

export function currentEntity(){
  const v = S.view;
  if(v.level==='city')    return {name:v.city, key:v.iso+':'+v.city, rec:SEED.cities[v.iso+':'+v.city], label:'City'};
  if(v.level==='admin1')  return {name:v.region, key:v.iso+':'+v.region, rec:SEED.admin1[v.iso+':'+v.region], label:'State / province'};
  if(v.level==='country'){
    const f = S.countries?.features.find(x=>isoOf(x)===v.iso);
    return {name:f?nameOf(f):v.iso, key:v.iso, rec:SEED.countries[v.iso], label:'Country'};
  }
  if(v.level==='continent') return {name:CONTINENT_LABEL[v.continent]||v.continent, key:'C:'+v.continent,
    rec:S.entities.get('C:'+v.continent)?.rec, label:'Continent'};
  return {name:'Global', key:'GLOBAL', rec:{diseases:aggregateDiseases(Object.keys(SEED.countries)), conf:null}, label:'World'};
}

export function renderInfo(){
  const ent = currentEntity();
  const sev = ent.key==='GLOBAL'
    ? rollup([...S.continents.keys()].map(c=>({severity:S.entities.get('C:'+c)?.sev, pop:1})).filter(x=>x.severity!=null))
    : (S.entities.get(ent.key)?.sev ?? (ent.rec?entitySeverity(ent.rec):null));
  const t = tierOf(sev);
  $('#infoeyebrow').textContent = ent.label;

  const dis = ent.rec?.diseases || [];
  const cards = dis.length ? dis.map(d=>{
    const ds = diseaseSeverity(d);
    return `<div class="dcard">
      <div class="dname"><h4>${esc(d.name)}</h4><span class="trend">${trendArrow(d.growth7d)}</span></div>
      <div class="stats">
        <div class="stat"><div class="k">Cases</div><div class="v">${fmt(d.cases)}</div></div>
        <div class="stat"><div class="k">Deaths</div><div class="v">${fmt(d.deaths)}</div></div>
        <div class="stat"><div class="k">CFR</div><div class="v">${d.cfr!=null?d.cfr.toFixed(1)+'%':'—'}</div></div>
      </div>
      <div class="srcline">
        ${freshBadge(d.asOf)}
        <span style="font-family:var(--font-num);font-size:9.5px;color:var(--ink-dim);letter-spacing:.05em">
          ${d.asOf ? esc(d.asOf) : 'undated'}
        </span>
      </div>
      <div class="src" style="margin-top:6px">
        ${esc(d.source||'Source pending')}
        ${d.url ? ` · <a href="${esc(d.url)}" target="_blank" rel="noopener">open source</a>` : ''}
        ${d.provisional ? `<br><span class="prov">Provisional — verify against the primary feed before publishing.</span>` : ''}
      </div>
    </div>`;
  }).join('') : `<div class="dcard" style="color:var(--ink-dim);font-size:12.5px;line-height:1.5">
      No reported activity for this area in the current dataset. That is not the same as no risk —
      check the reporting-confidence badge above.</div>`;

  const confMap = {high:'#16A34A', medium:'#CA8A04', low:'#DC2626'};
  const conf = ent.rec?.conf;

  $('#infobody').innerHTML = `
    <div id="idhead">
      <div id="idname">${esc(ent.name)}</div>
      <span id="idtier" style="color:${t.hex};border-color:${t.hex}66;background:${t.hex}14">
        <span style="width:6px;height:6px;border-radius:50%;background:${t.hex};display:block"></span>${t.name}
      </span>
      <div id="idscore" style="color:${t.hex}">${sev==null?'——':sev}</div>
      <div id="idscorelbl">Severity index · 0–100</div>
      <div class="updrow">
        ${freshBadge(freshestAsOf(dis), 'newest figure')}
        ${conf ? `<span class="conf" style="margin:0"><span class="confdot" style="background:${confMap[conf]}"></span>${conf} confidence</span>` : ''}
      </div>
    </div>${cards}`;

  renderDrawer(dis);
}

export function renderFeed(){
  const rows = [];

  // countries
  for(const [iso, rec] of Object.entries(SEED.countries || {})){
    const cf = S.countries?.features.find(f => isoOf(f) === iso);
    const place = cf ? nameOf(cf) : iso;
    (rec.diseases || []).forEach(d=>{
      rows.push({ level:'Country', iso, place, region:null,
        name:d.name, sev:diseaseSeverity(d) ?? entitySeverity(rec),
        asOf:d.asOf, cases:d.cases, source:d.source, routine:!!d.routine });
    });
  }

  // states / provinces — "all countries AND states", as asked
  for(const [key, rec] of Object.entries(SEED.admin1 || {})){
    const [iso, region] = key.split(':');
    (rec.diseases || []).forEach(d=>{
      rows.push({ level:'State', iso, place:region, region,
        name:d.name, sev:diseaseSeverity(d) ?? entitySeverity(rec),
        asOf:d.asOf, cases:d.cases, source:d.source, routine:!!d.routine });
    });
  }

  // cities
  for(const [key, rec] of Object.entries(SEED.cities || {})){
    const [iso, city] = key.split(':');
    (rec.diseases || []).forEach(d=>{
      rows.push({ level:'City', iso, place:city, region:null,
        name:d.name, sev:diseaseSeverity(d) ?? entitySeverity(rec),
        asOf:d.asOf, cases:d.cases, source:d.source, routine:!!d.routine });
    });
  }

  const sorters = {
    recent:   (a,b) => (ageDays(a.asOf) ?? 99999) - (ageDays(b.asOf) ?? 99999),
    severity: (a,b) => (b.sev ?? -1) - (a.sev ?? -1),
    stale:    (a,b) => (ageDays(b.asOf) ?? -1) - (ageDays(a.asOf) ?? -1)
  };
  rows.sort(sorters[S.sort] || sorters.recent);

  const routineCount = rows.filter(r => r.routine).length;
  $('#routinecount').textContent = routineCount ? routineCount + ' hidden' : '';
  if(S.showRoutine) $('#routinecount').textContent = routineCount + ' shown';

  const vis = rows
    .filter(r => S.showRoutine || !r.routine)
    .filter(r => (r.sev ?? 0) >= S.threshold);

  // headline: how current is this dataset overall?
  const counted = S.showRoutine ? rows : rows.filter(r => !r.routine);
  const dated = counted.map(r => ageDays(r.asOf)).filter(v => v != null);
  const newest = dated.length ? Math.min(...dated) : null;
  const undated = counted.length - dated.length;

  $('#feedhead').innerHTML = dated.length
    ? `${counted.length} reports · newest ${ago(newest)}${undated ? ` · ${undated} undated` : ''}`
    : `${counted.length} reports · no dates available`;

  $('#feedlist').innerHTML = vis.length ? vis.map(r=>{
    const t = tierOf(r.sev);
    return `<div class="fitem" data-iso="${esc(r.iso)}" data-region="${esc(r.region||'')}" data-disease="${esc(r.name)}">
      <span class="fdot" style="background:${t.hex}"></span>
      <div style="min-width:0;flex:1">
        <div class="ftitle">${esc(r.name)} — ${esc(r.place)}</div>
        <div class="fmeta" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="flevel">${r.level}</span>
          ${r.routine ? '<span class="flevel" style="opacity:.65">routine</span>' : ''}
          <span>${r.cases != null ? fmt(r.cases)+' cases' : 'no count'}</span>
          <span style="color:${t.hex}">${t.name}</span>
        </div>
        <div style="margin-top:5px">
          ${freshBadge(r.asOf)}
        </div>
      </div></div>`;
  }).join('') : `<div style="padding:16px 12px;color:var(--ink-dim);font-size:12px;line-height:1.5">
      Nothing at or above severity ${S.threshold}. Lower the threshold to see quieter events.</div>`;

  $('#feedlist').querySelectorAll('.fitem').forEach(el=>{
    el.onclick = ()=>{
      const iso = el.dataset.iso;
      const region = el.dataset.region;
      // open the drawer on the disease the user actually clicked, not the
      // worst one at that location
      S.disease = el.dataset.disease || null;
      S.chip = null;
      if(region){
        ensureAdmin1();
        const r = regionByName(iso, region);
        if(r){ selectAdmin1(iso, r); return; }
      }
      selectCountry(iso);
    };
  });
}

export function renderRamp(){
  const counts = [0,0,0,0,0];
  S.entities.forEach(e=>{
    if(e.level!=='country' || e.sev==null) return;
    counts[TIERS.findIndex(t=>e.sev<=t.max)]++;
  });
  const mx = Math.max(1, ...counts);
  $('#ramp').innerHTML = TIERS.map((t,i)=>{
    const h = 18 + (counts[i]/mx)*82;
    return `<div class="rampcell" style="background:linear-gradient(to top, ${t.hex} ${h}%, ${t.hex}22 ${h}%)" title="${t.name}">
      <b>${counts[i]||''}</b></div>`;
  }).join('');
}

export function renderCrumbs(){
  const v = S.view, out = [];
  out.push({t:'World', fn:goWorld, now:v.level==='world'});
  if(v.continent) out.push({t:CONTINENT_LABEL[v.continent]||v.continent, fn:()=>selectContinent(v.continent), now:v.level==='continent'});
  if(v.iso){
    const f = S.countries?.features.find(x=>isoOf(x)===v.iso);
    out.push({t:f?nameOf(f):v.iso, fn:()=>selectCountry(v.iso), now:v.level==='country'});
  }
  if(v.region) out.push({t:v.region, now:v.level==='admin1'});
  if(v.city)   out.push({t:v.city, now:true});
  const c = $('#crumbs'); c.innerHTML = '';
  out.forEach((o,i)=>{
    if(i) c.insertAdjacentHTML('beforeend','<span class="sep">›</span>');
    const b = document.createElement('button');
    b.className = 'cr'+(o.now?' now':''); b.textContent = o.t;
    if(o.fn) b.onclick = o.fn;
    c.appendChild(b);
  });
  $('#zoomstate').innerHTML = zoomHint();
}

/* Tells you what tier you're on AND what the next scroll would reveal —
   the previous badge just said "countries" with no hint that more existed. */
function zoomHint(){
  if(S._a1failed) return '<span style="color:var(--s3)">states data missing</span>';
  const lod = currentLOD();
  if(lod === 'world')  return 'countries <span style="opacity:.5">· scroll in for states</span>';
  if(lod === 'region'){
    return S.admin1
      ? 'states <span style="opacity:.5">· scroll in for cities</span>'
      : 'states <span style="opacity:.5">· loading…</span>';
  }
  return S.cities ? 'cities' : 'cities <span style="opacity:.5">· loading…</span>';
}

export function renderLabels(){
  const box = $('#labels'); box.innerHTML='';
  const lod = currentLOD();
  let list = [];

  if(lod === 'city' && S.cities){
    // Only label the tiers that have faded in, and cap the count, so the
    // view never turns into a wall of text. Tier 0 = capitals + megacities.
    const c = fadeIn(cam.z, FADE.city.hi, FADE.city.lo);
    const maxTier = cam.z < 1.45 ? 2 : (cam.z < 1.65 ? 1 : 0);
    if(c > 0.15){
      list = S.cities
        .filter(x => x[3] <= maxTier)
        .slice(0, 400)
        .map(x => ({
          name:x[0], lat:x[2], lon:x[1], city:true,
          sev: S.entities.get(x[4] + ':' + x[0])?.sev ?? null
        }));
    }
  } else if(lod !== 'world' && S.countries){
    list = S.countries.features
      .filter(f => SEED.countries[isoOf(f)])
      .map(f=>{ const c = centroidOf(f); return {name:nameOf(f), lat:c.lat, lon:c.lon, sev:S.entities.get(isoOf(f))?.sev}; });
  }
  const camDir = new THREE.Vector3(0,0,1);
  const onScreen = [];
  for(const it of list){
    const p = latLonToVec(it.lat, it.lon, R*1.005);
    const w = p.clone().applyMatrix4(spin.matrixWorld);
    if(w.clone().normalize().dot(camDir) < 0.12) continue;    // back of the globe
    const s = w.clone().project(camera);
    if(Math.abs(s.x) > 1 || Math.abs(s.y) > 1) continue;
    onScreen.push({ it, x:(s.x*0.5+0.5)*innerWidth, y:(-s.y*0.5+0.5)*innerHeight,
                    d: s.x*s.x + s.y*s.y });
  }
  // nearest the centre of the view wins, and stop at a readable number
  onScreen.sort((a,b) => a.d - b.d);
  const LIMIT = 34;
  const placed = [];
  for(const o of onScreen){
    if(placed.length >= LIMIT) break;
    // crude de-clutter: skip anything sitting on top of a label already placed
    if(placed.some(q => Math.abs(q.x-o.x) < 68 && Math.abs(q.y-o.y) < 15)) continue;
    placed.push(o);
    const el = document.createElement('div');
    el.className = 'lbl';
    el.style.left = o.x + 'px';
    el.style.top  = o.y + 'px';
    el.innerHTML = `<i style="background:${tierOf(o.it.sev).hex}"></i>${esc(o.it.name)}`;
    box.appendChild(el);
  }
}

/* Country centroids, cached — used only for label placement here. */
const _cent = new WeakMap();
function centroidOf(f){
  if(_cent.has(f)) return _cent.get(f);
  let best=null, bl=0;
  const polys = f.geometry.type==='Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  polys.forEach(p=>{ if(p[0].length > bl){ bl = p[0].length; best = p[0]; } });
  const c = !best ? {lat:0, lon:0} : (()=>{
    let sx=0, sy=0;
    best.forEach(([lo,la])=>{ sx+=lo; sy+=la; });
    return {lon:sx/best.length, lat:sy/best.length};
  })();
  _cent.set(f, c);
  return c;
}

export function refresh(){
  const lod = currentLOD();
  if(lod !== S.lastLOD || S.view.iso !== S.lastFocus){
    S.lastLOD = lod; S.lastFocus = S.view.iso; S.lod = lod;
    paint(); rebuildBorders();
  }
  renderCrumbs(); renderInfo(); renderFeed(); renderRamp();
}

export function bindUI(){
  document.querySelectorAll('.collapse').forEach(b=>{
    b.onclick = ()=>{ const p = $('#'+b.dataset.t); p.classList.toggle('closed');
      b.textContent = p.classList.contains('closed') ? '+' : '−'; };
  });
  $('#thr').oninput = e=>{ S.threshold = +e.target.value; $('#thrval').textContent = e.target.value; renderFeed(); };
  $('#showroutine').onchange = e=>{ S.showRoutine = e.target.checked; renderFeed(); };
  document.querySelectorAll('#feedsort button').forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll('#feedsort button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on'); S.sort = b.dataset.sort; renderFeed();
    };
  });
  document.querySelectorAll('#tabs button').forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll('#tabs button').forEach(x=>x.classList.remove('on'));
      b.classList.add('on'); S.tab = b.dataset.tab; renderInfo();
    };
  });
}

export function progress(p, txt){
  $('#bootbar i').style.width = p+'%';
  if(txt) $('#boottxt').textContent = txt;
}
