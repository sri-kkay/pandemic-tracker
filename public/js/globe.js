/* ── GLOBE ────────────────────────────────────────────────────────────────
   The equirectangular texture painter, the three.js scene, crisp vector
   borders, camera math, and the render loop. Everything that puts pixels
   or geometry on screen lives here. */

import { clamp } from './utils.js';
import { S, SEED, tierOf, maxGrowth, maxPer100k, isoOf, isRoutineOnly } from './state.js';
import { ensureAdmin1, ensureCities } from './interaction.js';
import { renderLabels, renderCrumbs } from './ui.js';

/* ── EQUIRECTANGULAR TEXTURE PAINTER ───────────────────────────────────────
   The globe is a sphere wearing a canvas. Repainting the canvas recolours
   the world; we only repaint when the zoom tier changes or data arrives. */

export let TEX_W = 4096, TEX_H = 2048;
const tex = document.createElement('canvas');
tex.width = TEX_W; tex.height = TEX_H;
const tx = tex.getContext('2d');

function projX(lon){ return (lon + 180) / 360 * TEX_W; }
function projY(lat){ return (90 - lat) / 180 * TEX_H; }

function tracePoly(ctx, coords){
  coords.forEach(ring=>{
    ring.forEach(([lon,lat],i)=>{
      const x = projX(lon), y = projY(lat);
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    });
    ctx.closePath();
  });
}
function traceFeature(ctx, geom){
  ctx.beginPath();
  if(geom.type === 'Polygon') tracePoly(ctx, geom.coordinates);
  else if(geom.type === 'MultiPolygon') geom.coordinates.forEach(p=>tracePoly(ctx,p));
}

/* Diagonal hatch = "we have no reporting from here." Visually distinct from
   green, because the spec is explicit that silence must not read as safety. */
let hatchPattern = null;
function makeHatch(){
  const c = document.createElement('canvas'); c.width = c.height = 12;
  const g = c.getContext('2d');
  g.fillStyle = '#212A35'; g.fillRect(0,0,12,12);
  g.strokeStyle = '#39424F'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-3,9); g.lineTo(9,-3); g.moveTo(3,15); g.lineTo(15,3); g.stroke();
  hatchPattern = tx.createPattern(c,'repeat');
}

/* A second, sparser hatch overlaid on top of the severity colour for regions
   whose only signal is routine surveillance (background flu/ARI activity from
   ERVISS, FluNet, CDC states) rather than a declared outbreak. Without this,
   a quiet flu season and an active WHO outbreak alert can land on the same
   severity tier and render identically — this line texture is what tells
   them apart on the globe itself, not just in the feed panel. */
let routineHatchPattern = null;
function makeRoutineHatch(){
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0,16); g.lineTo(16,0); g.stroke();
  routineHatchPattern = tx.createPattern(c,'repeat');
}

function fillFor(sev, per100k){
  if(sev == null) return hatchPattern;
  const t = tierOf(sev);
  // saturation carries concentration: sparse zones stay pale, dense ones glow
  const dens = per100k == null ? 0.45 : clamp(Math.log10(per100k+1)/3, 0.25, 1);
  return shade(t.hex, 0.35 + dens*0.65);
}
function shade(hex, a){
  const n = parseInt(hex.slice(1),16);
  const r = n>>16, g = (n>>8)&255, b = n&255;
  // blend toward the ocean colour rather than using alpha, so overlaps stay clean
  const bg = [12,18,28];
  return `rgb(${Math.round(bg[0]+(r-bg[0])*a)},${Math.round(bg[1]+(g-bg[1])*a)},${Math.round(bg[2]+(b-bg[2])*a)})`;
}

export function paint(){
  if(!hatchPattern) makeHatch();
  if(!routineHatchPattern) makeRoutineHatch();
  // ocean
  tx.fillStyle = '#0A1220'; tx.fillRect(0,0,TEX_W,TEX_H);

  // graticule — quiet, gives the sphere readable structure when zoomed out
  tx.strokeStyle = 'rgba(120,150,190,.055)'; tx.lineWidth = 1.5;
  for(let lon=-180; lon<=180; lon+=15){ tx.beginPath(); tx.moveTo(projX(lon),0); tx.lineTo(projX(lon),TEX_H); tx.stroke(); }
  for(let lat=-75; lat<=75; lat+=15){ tx.beginPath(); tx.moveTo(0,projY(lat)); tx.lineTo(TEX_W,projY(lat)); tx.stroke(); }

  if(!S.countries) { commitTexture(); return; }

  // ── countries: fills only. Borders are drawn as vector lines (§6b) so they
  // stay crisp when you zoom. A soft glow stays in the texture because a glow
  // is supposed to be blurry.
  S.countries.features.forEach(f=>{
    const iso = isoOf(f);
    const e = S.entities.get(iso);
    const rec = SEED.countries[iso];
    traceFeature(tx, f.geometry);
    tx.fillStyle = fillFor(e?.sev ?? null, maxPer100k(rec));
    tx.fill('evenodd');

    // routine-only signal (no active outbreak alert here) gets a sparse
    // diagonal overlay on top of its severity colour
    if(isRoutineOnly(rec)){
      tx.save();
      tx.globalAlpha = 0.5;
      tx.fillStyle = routineHatchPattern;
      tx.fill('evenodd');
      tx.restore();
    }

    const g = maxGrowth(rec);
    if(g != null && g >= 15){
      tx.save();
      tx.strokeStyle = 'rgba(255,255,255,.30)';
      tx.lineWidth = 14;
      tx.filter = 'blur(6px)';
      tx.stroke();
      tx.restore();
    }
  });

  // ── state / province fills, wherever we actually have data for them.
  // Boundaries are worldwide, but only regions with surveillance data get a
  // fill. Everything else keeps the country colour beneath it.
  if(S.lod !== 'world' && S.admin1){
    for(const [iso, regions] of Object.entries(S.admin1)){
      for(const [name, rings] of regions){
        const e = S.entities.get(iso + ':' + name);
        if(!e || e.sev == null) continue;
        tx.beginPath();
        for(const flat of rings){
          for(let i = 0; i + 1 < flat.length; i += 2){
            const x = projX(flat[i]), y = projY(flat[i+1]);
            i ? tx.lineTo(x, y) : tx.moveTo(x, y);
          }
          tx.closePath();
        }
        tx.fillStyle = fillFor(e.sev, maxPer100k(e.rec));
        tx.fill('evenodd');
        if(isRoutineOnly(e.rec)){
          tx.save();
          tx.globalAlpha = 0.5;
          tx.fillStyle = routineHatchPattern;
          tx.fill('evenodd');
          tx.restore();
        }
      }
    }
  }

  commitTexture();
}
let texture = null;
function commitTexture(){ if(texture) texture.needsUpdate = true; }

/* ── CRISP BORDERS + ZOOM-DRIVEN DETAIL ────────────────────────────────────
   Borders are real 3D line geometry sitting just above the sphere, so they
   stay sharp at any zoom instead of turning into magnified pixels.

   Three layers, each fading in as you get closer:

     always      country outlines
     z < 2.60    state / province lines   (worldwide, 218 countries)
     z < 1.95    major city markers       (capitals, megacities, pop >= 300k)

   The state and city layers are built ONCE, the first time you zoom in far
   enough, then just faded and toggled. Rebuilding them per frame would be
   far too slow — there are 137,000 line points in the state layer.

   Cities are tiered so the view never turns to soup: capitals and megacities
   appear first, then million-plus cities, then the rest only at full zoom. */

let borderLines = null, hotspotLines = null, admin1Lines = null, cityPoints = null;

/* fade helper: 1 when z is at or below `lo`, 0 at or above `hi` */
export function fadeIn(z, hi, lo){
  if(z >= hi) return 0;
  if(z <= lo) return 1;
  const t = (hi - z) / (hi - lo);
  return t * t * (3 - 2 * t);          // smoothstep
}

export const FADE = {
  admin1: { hi:2.85, lo:2.50 },   // states begin appearing on the first scroll
  city:   { hi:2.10, lo:1.85 }    // cities a little further in
};

function buildLines(features, colour, opacity, radius, filter){
  const pts = [];
  for(const f of features){
    if(filter && !filter(f)) continue;
    const polys = f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates;
    for(const poly of polys){
      for(const ring of poly){
        for(let i = 0; i < ring.length - 1; i++){
          const a = latLonToVec(ring[i][1],   ring[i][0],   radius);
          const b = latLonToVec(ring[i+1][1], ring[i+1][0], radius);
          pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
  }
  return finishLine(pts, colour, opacity);
}

/* The bundled admin1 file uses flat coordinate arrays — [lon,lat,lon,lat,…] —
   which is roughly half the size of nested pairs. */
function buildAdmin1Lines(){
  if(!S.admin1) return null;
  const pts = [];
  for(const regions of Object.values(S.admin1)){
    for(const [, rings] of regions){
      for(const flat of rings){
        for(let i = 0; i + 3 < flat.length; i += 2){
          const a = latLonToVec(flat[i+1], flat[i],   R*1.0025);
          const b = latLonToVec(flat[i+3], flat[i+2], R*1.0025);
          pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
  }
  return finishLine(pts, 0xBFD4EA, 0);
}

function finishLine(pts, colour, opacity){
  if(!pts.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    color: colour, transparent:true, opacity, depthWrite:false
  }));
  line.visible = opacity > 0;
  return line;
}

function buildCityPoints(){
  if(!S.cities) return null;
  const pos = [], tiers = [];
  for(const [, lon, lat, tier] of S.cities){
    const v = latLonToVec(lat, lon, R*1.004);
    pos.push(v.x, v.y, v.z);
    tiers.push(tier);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color:0xE8EFF7, size:0.006, sizeAttenuation:true,
    transparent:true, opacity:0, depthWrite:false
  }));
  p.userData.tiers = tiers;
  p.visible = false;
  return p;
}

function disposeLine(obj){
  if(!obj) return;
  spin.remove(obj);
  obj.geometry.dispose();
  obj.material.dispose();
}

/* Country outlines and hotspot flags — cheap, rebuilt whenever data changes */
export function rebuildBorders(){
  if(!S.countries) return;

  if(!borderLines){
    borderLines = buildLines(S.countries.features, 0xA8C0DC, 0.42, R*1.0015);
    if(borderLines) spin.add(borderLines);
  }

  disposeLine(hotspotLines); hotspotLines = null;
  const hot = S.countries.features.filter(f=>{
    const g = maxGrowth(SEED.countries[isoOf(f)]);
    return g != null && g >= 15;
  });
  if(hot.length){
    hotspotLines = buildLines(hot, 0xFFFFFF, 0.92, R*1.0035);
    if(hotspotLines) spin.add(hotspotLines);
  }
}

/* Called every frame — cheap, just adjusts opacity on prebuilt geometry */
export function updateDetailLayers(){
  const a = fadeIn(cam.z, FADE.admin1.hi, FADE.admin1.lo);
  const c = fadeIn(cam.z, FADE.city.hi,   FADE.city.lo);

  if(a > 0 && !admin1Lines && S.admin1){
    admin1Lines = buildAdmin1Lines();
    if(admin1Lines) spin.add(admin1Lines);
  }
  if(admin1Lines){
    admin1Lines.material.opacity = a * 0.55;
    admin1Lines.visible = a > 0.01;
  }

  if(c > 0 && !cityPoints && S.cities){
    cityPoints = buildCityPoints();
    if(cityPoints) spin.add(cityPoints);
  }
  if(cityPoints){
    cityPoints.material.opacity = c * 0.9;
    cityPoints.material.size = 0.004 + c * 0.004;
    cityPoints.visible = c > 0.01;
  }

  // datasets are preloaded at boot; this is just a safety net if that failed
  if(cam.z < FADE.admin1.hi + 0.4) ensureAdmin1();
  if(cam.z < FADE.city.hi   + 0.4) ensureCities();
}

/* ── THREE.JS SCENE ───────────────────────────────────────────────────── */

export const R = 1;
export let renderer, scene, camera, tilt, spin, atmo, raycaster, sphereForPick;

export function initScene(){
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x070B12, 1);
  document.body.insertBefore(renderer.domElement, document.getElementById('labels'));

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, innerWidth/innerHeight, 0.01, 100);
  camera.position.set(0,0,3.1);

  tilt = new THREE.Group();            // rotates on X
  spin = new THREE.Group();            // rotates on Y  →  world = Rx · Ry · p
  tilt.add(spin); scene.add(tilt);

  // Use a bigger texture when the GPU can take it. Mobile stays at 4096.
  const maxT = renderer.capabilities.maxTextureSize || 4096;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if(maxT >= 8192 && !isMobile){
    TEX_W = 8192; TEX_H = 4096;
    tex.width = TEX_W; tex.height = TEX_H;
  }

  texture = new THREE.CanvasTexture(tex);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const geo = new THREE.SphereGeometry(R, 96, 64);
  const globeMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({map:texture}));
  spin.add(globeMesh);
  sphereForPick = globeMesh;

  // rim atmosphere — sells the sphere without competing with the severity ramp
  const atmoMat = new THREE.ShaderMaterial({
    uniforms:{}, transparent:true, side:THREE.BackSide, depthWrite:false, blending:THREE.AdditiveBlending,
    vertexShader:`varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal);
      gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying vec3 vN; void main(){
      float i = pow(0.72 - dot(vN, vec3(0.,0.,1.)), 3.0);
      gl_FragColor = vec4(0.28,0.48,0.78,1.0)*clamp(i,0.0,1.0)*0.85; }`
  });
  atmo = new THREE.Mesh(new THREE.SphereGeometry(R*1.055, 64, 48), atmoMat);
  scene.add(atmo);

  scene.add(makeStars());
  raycaster = new THREE.Raycaster();
  addEventListener('resize', onResize);
}

function makeStars(){
  const n = 2600, pos = new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const r = 28 + Math.random()*24;
    const th = Math.acos(2*Math.random()-1), ph = Math.random()*Math.PI*2;
    pos[i*3]   = r*Math.sin(th)*Math.cos(ph);
    pos[i*3+1] = r*Math.cos(th);
    pos[i*3+2] = r*Math.sin(th)*Math.sin(ph);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos,3));
  return new THREE.Points(g, new THREE.PointsMaterial({color:0x8FA6C4, size:0.09, sizeAttenuation:true, transparent:true, opacity:.55}));
}
function onResize(){
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

/* ── CAMERA MATH ──────────────────────────────────────────────────────────
   Inverse of three.js's own sphere parametrisation, so picking and marker
   placement agree exactly. Derivation in the guide, §4. */

export function latLonToVec(lat, lon, r=R){
  const u = (lon+180)/360, v = (90-lat)/180;
  const phi = u*Math.PI*2, theta = v*Math.PI;
  return new THREE.Vector3(
    -r*Math.cos(phi)*Math.sin(theta),
     r*Math.cos(theta),
     r*Math.sin(phi)*Math.sin(theta)
  );
}
export function uvToLatLon(uv){ return {lat: uv.y*180 - 90, lon: uv.x*360 - 180}; }

// rotation that brings (lat,lon) to face the camera
export function facing(lat, lon){
  return { x: lat*Math.PI/180, y: Math.PI/2 - (lon+180)*Math.PI/180 };
}

export const cam = { rx:0.28, ry:-1.2, z:3.1, trx:0.28, try_:-1.2, tz:3.1 };

export const ZOOM_MIN = 1.28, ZOOM_MAX = 3.4;
const LOD_REGION = 2.75, LOD_CITY = 2.00;   // kept in step with FADE above

export function currentLOD(){
  if(cam.z > LOD_REGION) return 'world';
  if(cam.z > LOD_CITY)   return 'region';
  return 'city';
}

/* ── LOOP ─────────────────────────────────────────────────────────────── */

let lastLabelPaint = 0;
export function tick(){
  requestAnimationFrame(tick);
  cam.rx += (cam.trx - cam.rx)*0.12;
  cam.ry += (cam.try_ - cam.ry)*0.12;
  cam.z  += (cam.tz  - cam.z )*0.10;
  tilt.rotation.x = cam.rx;
  spin.rotation.y = cam.ry;
  camera.position.z = cam.z;
  updateDetailLayers();
  const lod = currentLOD();
  if(lod !== S.lastLOD){
    S.lastLOD = lod; S.lod = lod;
    paint(); renderCrumbs();
  }
  spin.updateMatrixWorld();
  const now = performance.now();
  if(now - lastLabelPaint > 50){ lastLabelPaint = now; renderLabels(); }
  renderer.render(scene, camera);
}
