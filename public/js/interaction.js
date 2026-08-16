/* ── INTERACTION ──────────────────────────────────────────────────────────
   Pointer/keyboard input, picking a lat/lon off the sphere, point-in-polygon
   lookups against the loaded boundaries, drill-down navigation, and the
   hover tooltip. */

import { clamp, esc, fmt, trendArrow, note } from './utils.js';
import { freshness, freshestAsOf } from './freshness.js';
import { S, SEED, isoOf, nameOf, contOf, entitySeverity, tierOf, GEO, fetchFirst } from './state.js';
import {
  cam, renderer, camera, raycaster, sphereForPick,
  uvToLatLon, facing, currentLOD, ZOOM_MIN, ZOOM_MAX, paint
} from './globe.js';
import { refresh } from './ui.js';

let dragging=false, moved=0, px=0, py=0;
export function bindInput(){
  const el = renderer.domElement;
  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', e=>{
    dragging=true; moved=0; px=e.clientX; py=e.clientY; el.style.cursor='grabbing'; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e=>{
    if(dragging){
      const dx=e.clientX-px, dy=e.clientY-py; px=e.clientX; py=e.clientY;
      moved += Math.abs(dx)+Math.abs(dy);
      const k = 0.0042 * (cam.z/3.1);            // slower drag when zoomed in
      cam.try_ += dx*k; cam.trx += dy*k;
      cam.trx = clamp(cam.trx, -1.45, 1.45);
    } else {
      onHover(e);
    }
  });
  el.addEventListener('pointerup', e=>{
    dragging=false; el.style.cursor='grab';
    if(moved < 5) onClick(e);
  });
  el.addEventListener('pointerleave', ()=>{ dragging=false; hideTip(); });
  el.addEventListener('wheel', e=>{
    e.preventDefault();
    cam.tz = clamp(cam.tz + e.deltaY*0.0016, ZOOM_MIN, ZOOM_MAX);
  }, {passive:false});

  addEventListener('keydown', e=>{
    if(e.key === 'Escape') goUp();
    if(e.key === '+' || e.key === '=') cam.tz = clamp(cam.tz-0.2, ZOOM_MIN, ZOOM_MAX);
    if(e.key === '-') cam.tz = clamp(cam.tz+0.2, ZOOM_MIN, ZOOM_MAX);
  });
}

function pick(e){
  const rect = renderer.domElement.getBoundingClientRect();
  const m = new THREE.Vector2(
    ((e.clientX-rect.left)/rect.width)*2-1,
    -((e.clientY-rect.top)/rect.height)*2+1
  );
  raycaster.setFromCamera(m, camera);
  const hit = raycaster.intersectObject(sphereForPick, false)[0];
  if(!hit || !hit.uv) return null;
  return uvToLatLon(hit.uv);
}

/* point-in-polygon over GeoJSON, ray casting, holes handled by parity */
function inRing(lon, lat, ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
    if(((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function inGeom(lon, lat, geom){
  const polys = geom.type==='Polygon' ? [geom.coordinates] : geom.coordinates;
  for(const poly of polys){
    let hit = false;
    poly.forEach((ring,i)=>{ if(inRing(lon,lat,ring)) hit = !hit; });
    if(hit) return true;
  }
  return false;
}
/* The bundled admin1 file stores rings as flat [lon,lat,lon,lat,…] arrays,
   so point-in-polygon walks them two at a time. Parity across rings handles
   holes, same as the country test above. */
function inFlatRing(lon, lat, f){
  let inside = false;
  for(let i = 0, j = f.length - 2; i < f.length; j = i, i += 2){
    const xi = f[i], yi = f[i+1], xj = f[j], yj = f[j+1];
    if(((yi > lat) !== (yj > lat)) &&
       (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function inFlatRings(lon, lat, rings){
  let hit = false;
  for(const flat of rings) if(inFlatRing(lon, lat, flat)) hit = !hit;
  return hit;
}
function centroidOfFlat(rings){
  let best = null, bl = 0;
  for(const flat of rings) if(flat.length > bl){ bl = flat.length; best = flat; }
  if(!best) return {lat:0, lon:0};
  let sx = 0, sy = 0, n = 0;
  for(let i = 0; i + 1 < best.length; i += 2){ sx += best[i]; sy += best[i+1]; n++; }
  return {lon: sx/n, lat: sy/n};
}

function findCountry(lat, lon){
  if(!S.countries) return null;
  return S.countries.features.find(f=>inGeom(lon,lat,f.geometry)) || null;
}
function findAdmin1(lat, lon, iso){
  if(!S.admin1) return null;
  const regions = S.admin1[iso];
  if(!regions) return null;
  for(const [name, rings] of regions){
    if(inFlatRings(lon, lat, rings)) return {name, rings, iso};
  }
  // Simplifying 38 MB of boundaries down to 2.8 MB shaves detail off
  // coastlines, so a click on a waterfront city can land just outside every
  // polygon. Fall back to the nearest boundary within ~60 km.
  return nearestRegion(lat, lon, regions, 0.6);
}

function nearestRegion(lat, lon, regions, maxDeg){
  let best = null, bd = Infinity;
  const cos = Math.cos(lat * Math.PI / 180);
  for(const [name, rings] of regions){
    for(const flat of rings){
      for(let i = 0; i + 1 < flat.length; i += 2){
        const d = Math.hypot(flat[i+1] - lat, (flat[i] - lon) * cos);
        if(d < bd){ bd = d; best = {name, rings, iso:regions.iso}; }
      }
    }
  }
  if(bd > maxDeg || !best) return null;
  const hit = regions.find(r => r[0] === best.name);
  return hit ? {name:hit[0], rings:hit[1]} : null;
}
export function regionByName(iso, name){
  const regions = S.admin1 && S.admin1[iso];
  if(!regions) return null;
  const hit = regions.find(r => r[0] === name);
  return hit ? {name:hit[0], rings:hit[1], iso} : null;
}
/* Nearest major city to a point. Checks the bundled geography first, then
   looks for a matching record in the surveillance data. */
function findCityNear(lat, lon, maxDeg){
  if(!S.cities) return null;
  const cosLat = Math.cos(lat * Math.PI / 180);
  let best = null, bd = Infinity;
  for(const c of S.cities){
    const d = Math.hypot(c[2] - lat, (c[1] - lon) * cosLat);
    if(d < bd){ bd = d; best = c; }
  }
  if(bd > maxDeg || !best) return null;
  const [name, lonC, latC, tier, iso, adm1] = best;
  return { name, lon:lonC, lat:latC, tier, iso, adm1,
           key: iso + ':' + name,
           rec: SEED.cities[iso + ':' + name] || null };
}

/* ── DRILL-DOWN ────────────────────────────────────────────────────────── */

export function onClick(e){
  const ll = pick(e); if(!ll) return;
  const lod = currentLOD();

  // deepest tier first: a city marker beats the region under it
  if(lod === 'city'){
    const c = findCityNear(ll.lat, ll.lon, 2.2);
    if(c){ selectCity(c); return; }
  }

  const f = findCountry(ll.lat, ll.lon);
  if(!f) return;
  const iso = isoOf(f);

  if(lod === 'world' && S.view.level === 'world'){
    selectContinent(contOf(f));
    return;
  }
  if(lod !== 'world'){
    const a = findAdmin1(ll.lat, ll.lon, iso);
    if(a && (S.view.iso === iso || lod === 'city')){ selectAdmin1(iso, a); return; }
  }
  selectCountry(iso, f);
}

const _cent = new WeakMap();
function centroidOf(f){
  if(_cent.has(f)) return _cent.get(f);
  const c = computeCentroid(f); _cent.set(f, c); return c;
}
function computeCentroid(f){
  // area-weighted-ish: mean of the largest ring, good enough to aim a camera
  let best=null, bl=0;
  const polys = f.geometry.type==='Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  polys.forEach(p=>{ if(p[0].length > bl){ bl = p[0].length; best = p[0]; } });
  if(!best) return {lat:0, lon:0};
  let sx=0, sy=0;
  best.forEach(([lo,la])=>{ sx+=lo; sy+=la; });
  return {lon:sx/best.length, lat:sy/best.length};
}

export function flyTo(lat, lon, z){
  const r = facing(lat, lon);
  cam.trx = clamp(r.x, -1.45, 1.45);
  // choose the equivalent angle nearest the current one so it never spins the long way
  let ty = r.y;
  while(ty - cam.try_ >  Math.PI) ty -= Math.PI*2;
  while(ty - cam.try_ < -Math.PI) ty += Math.PI*2;
  cam.try_ = ty;
  cam.tz = clamp(z, ZOOM_MIN, ZOOM_MAX);
}

const CONTINENT_VIEW = {
  'Africa':{lat:2,lon:20,z:2.05},'Europe':{lat:52,lon:14,z:2.0},
  'Asia':{lat:32,lon:92,z:1.95},'North America':{lat:44,lon:-100,z:2.0},
  'South America':{lat:-16,lon:-60,z:2.05},'Oceania':{lat:-25,lon:140,z:2.05},
  'Antarctica':{lat:-78,lon:0,z:2.2}
};

export function selectContinent(cont){
  S.view = {level:'continent', continent:cont, iso:null, region:null, city:null};
  const v = CONTINENT_VIEW[cont] || {lat:0,lon:0,z:2.1};
  flyTo(v.lat, v.lon, v.z);
  refresh();
}
export function selectCountry(iso, feature){
  const f = feature || S.countries.features.find(x=>isoOf(x)===iso);
  S.view = {level:'country', continent:f?contOf(f):S.view.continent, iso, region:null, city:null};
  if(f){ const c = centroidOf(f); flyTo(c.lat, c.lon, 1.72); }
  ensureAdmin1();
  refresh();
}
export function selectAdmin1(iso, region){
  S.view = {level:'admin1', continent:S.view.continent, iso, region:region.name, city:null};
  const c = centroidOfFlat(region.rings);
  flyTo(c.lat, c.lon, 1.55);
  refresh();
}
export function selectCity(c){
  S.view = {level:'city', continent:S.view.continent, iso:c.iso,
            region: c.adm1 || S.view.region, city:c.name};
  flyTo(c.lat, c.lon, 1.34);
  refresh();
}
export function goWorld(){ S.view={level:'world',continent:null,iso:null,region:null,city:null}; cam.tz=3.1; refresh(); }
export function goUp(){
  const v = S.view;
  if(v.level==='city')      { v.level = v.region ? 'admin1' : 'country'; v.city=null; cam.tz=1.6; }
  else if(v.level==='admin1'){ v.level='country'; v.region=null; cam.tz=1.75; }
  else if(v.level==='country'){ selectContinent(v.continent||'Africa'); return; }
  else goWorld();
  refresh();
}

export function ensureAdmin1(){
  if(S.admin1 || S._a1loading || S._a1failed) return;
  S._a1loading = true;
  fetchFirst(GEO.admin1)
    .then(j=>{ S.admin1 = j; paint(); })
    .catch(()=>{
      S._a1failed = true;
      note('public/data/admin1.json did not load — states cannot be shown. '
         + 'Check that the data folder was uploaded.');
    })
    .finally(()=>{ S._a1loading = false; });
}
export function ensureCities(){
  if(S.cities || S._ctloading || S._ctfailed) return;
  S._ctloading = true;
  fetchFirst(GEO.cities)
    .then(j=>{ S.cities = j; })
    .catch(()=>{
      S._ctfailed = true;
      note('public/data/cities.json did not load — cities cannot be shown. '
         + 'Check that the data folder was uploaded.');
    })
    .finally(()=>{ S._ctloading = false; });
}

/* ── HOVER ────────────────────────────────────────────────────────────── */

const tip = document.getElementById('tip');
let hoverRAF = 0;
function onHover(e){
  if(hoverRAF) return;
  hoverRAF = requestAnimationFrame(()=>{
    hoverRAF = 0;
    const ll = pick(e);
    if(!ll){ hideTip(); return; }
    const lod = currentLOD();
    let name = null, rec = null, sev = null, scopeNote = null;

    const f = findCountry(ll.lat, ll.lon);
    const iso = f ? isoOf(f) : null;

    // city marker under the cursor?
    if(lod === 'city'){
      const c = findCityNear(ll.lat, ll.lon, 1.6);
      if(c){
        name = c.name;
        rec  = c.rec;
        if(!rec && c.adm1) rec = SEED.admin1[c.iso + ':' + c.adm1] || null;
        if(rec) scopeNote = c.rec ? null : 'figures for ' + c.adm1;
        if(!rec && iso){ rec = SEED.countries[iso]; scopeNote = 'national figures'; }
        sev = rec ? entitySeverity(rec) : null;
      }
    }

    // state / province
    if(!name && lod !== 'world' && iso){
      const a = findAdmin1(ll.lat, ll.lon, iso);
      if(a){
        name = a.name;
        rec  = SEED.admin1[iso + ':' + a.name] || null;
        if(!rec){ rec = SEED.countries[iso]; scopeNote = rec ? 'national figures' : null; }
        sev = rec ? entitySeverity(rec) : null;
      }
    }

    // country
    if(!name && f){
      name = nameOf(f); rec = SEED.countries[iso];
      sev = rec ? entitySeverity(rec) : null;
    }

    if(!name){ hideTip(); return; }
    showTip(e, name, rec, sev, scopeNote);
  });
}
function showTip(e, name, rec, sev, scopeNote){
  const t = tierOf(sev);
  const dis = (rec && rec.diseases) ? rec.diseases : [];
  const rows = dis.slice(0,3).map(d=>{
    const n = d.cases!=null ? fmt(d.cases)+' cases' : 'no count';
    return `<div class="td"><span>${esc(d.name)}</span><span>${n} ${trendArrow(d.growth7d)}</span></div>`;
  }).join('') || `<div class="td"><span>No reported activity</span><span>—</span></div>`;
  const fresh = freshness(freshestAsOf(dis));
  tip.innerHTML = `<div class="tn">${esc(name)}</div>${rows}
    ${scopeNote ? `<div class="td" style="color:var(--ink-dim);font-style:italic">${esc(scopeNote)}</div>` : ''}
    <div class="tt" style="color:${t.hex}">
      <span style="width:6px;height:6px;border-radius:50%;background:${t.hex};display:block"></span>${t.name}${sev!=null?' · '+sev:''}
      <span style="margin-left:auto;color:${fresh.hex}">${fresh.label}</span>
    </div>`;
  tip.style.left = e.clientX+'px'; tip.style.top = e.clientY+'px'; tip.style.opacity = 1;
}
export function hideTip(){ tip.style.opacity = 0; }
