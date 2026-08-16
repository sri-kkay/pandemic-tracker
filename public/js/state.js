/* ── STATE ────────────────────────────────────────────────────────────────
   Seed data, live app state, the severity engine, and entity resolution.
   Everything else in the app reads and writes through S and SEED, which are
   shared mutable objects — modules that need them import the objects
   themselves, not copies of their fields. */

import { clamp } from './utils.js';

/* ── SEVERITY ENGINE ──────────────────────────────────────────────────────
   Implements the 0–100 index from the project spec: cases per 100k,
   case fatality rate, and 7-day growth. Tune the weights here and the whole
   map recolours — no other file needs to change. */

const WEIGHTS = { per100k:0.45, cfr:0.30, growth:0.25 };

export function severityOf(d){
  if(d.severity != null) return clamp(d.severity,0,100);   // explicit override
  const inputs = [d.per100k, d.cfr, d.growth7d].filter(v => v != null);
  if(!inputs.length) return null;                          // NO DATA — never 0
  // log scale: 1/100k ≈ 20, 10 ≈ 47, 100 ≈ 73, 1000 ≈ 100
  const a = d.per100k  != null ? clamp(Math.log10(d.per100k + 1) / 3 * 100, 0, 100) : null;
  // 10% CFR saturates the scale
  const b = d.cfr      != null ? clamp(d.cfr / 10 * 100, 0, 100) : null;
  // +50% week-on-week saturates
  const c = d.growth7d != null ? clamp((d.growth7d + 10) / 60 * 100, 0, 100) : null;
  let num = 0, den = 0;
  if(a!=null){ num += a*WEIGHTS.per100k; den += WEIGHTS.per100k; }
  if(b!=null){ num += b*WEIGHTS.cfr;     den += WEIGHTS.cfr;     }
  if(c!=null){ num += c*WEIGHTS.growth;  den += WEIGHTS.growth;  }
  return den ? Math.round(num/den) : null;
}

export const TIERS = [
  {max:19,  name:'contained', css:'--s0', hex:'#16A34A'},
  {max:39,  name:'moderate',  css:'--s1', hex:'#CA8A04'},
  {max:59,  name:'high',      css:'--s2', hex:'#EA580C'},
  {max:79,  name:'severe',    css:'--s3', hex:'#DC2626'},
  {max:100, name:'critical',  css:'--s4', hex:'#7F1D1D'}
];
export const NODATA = '#39424F';
export function tierOf(s){ return s==null ? {name:'no data',hex:NODATA} : TIERS.find(t=>s<=t.max); }

/* Roll child entities up to a parent. 60% worst-case, 40% population-weighted —
   so one critical province lifts the country without a big calm neighbour
   burying it. */
export function rollup(children){
  const scored = children.filter(c => c.severity != null);
  if(!scored.length) return null;
  const worst = Math.max(...scored.map(c=>c.severity));
  let wsum=0, psum=0;
  scored.forEach(c=>{ const p=c.pop||1; wsum += c.severity*p; psum += p; });
  return Math.round(0.6*worst + 0.4*(wsum/psum));
}

/* ── SEED DATA ────────────────────────────────────────────────────────────
   Every figure carries a source and an as-of date. `provisional:true` means
   the number came from a secondary summary and must be re-verified against
   the primary feed before it goes public.

   Keys: countries = ISO-3166 alpha-3. Subnational = "ISO3:Region Name".
   Cities = "ISO3:City Name". This is exactly the shape your API should emit. */

export const SEED = {
  updated: '2026-07-27T00:00:00Z',

  countries: {
    COD:{ conf:'low', diseases:[
      {name:'Ebola (Bundibugyo virus)', cases:1262, deaths:241, cfr:19.1, growth7d:22, per100k:1.2,
       asOf:'2026-05-29', source:'WHO PHEIC declaration, 16 May 2026', provisional:true,
       url:'https://www.who.int/emergencies/disease-outbreak-news'},
      {name:'Cholera', cases:null, deaths:null, asOf:'2026-05-31', source:'WHO Global Cholera & AWD dashboard',
       url:'https://who-global-cholera-and-awd-dashboard-1-who.hub.arcgis.com/pages/data-download'}
    ]},
    UGA:{ conf:'medium', diseases:[
      {name:'Ebola (Bundibugyo virus)', cases:null, deaths:null, severity:58, growth7d:9,
       asOf:'2026-07-14', source:'Africa CDC BVD situational report', provisional:true,
       url:'https://khub.africacdc.org/'}
    ]},
    BRA:{ conf:'high', diseases:[
      {name:'Dengue', cases:811000, deaths:null, per100k:383, growth7d:-8,
       asOf:'2026-05-17', source:'PAHO PLISA, through EW20', provisional:true,
       url:'https://www.paho.org/en/arbo-portal/dengue-data-and-analysis'}
    ]},
    BOL:{ conf:'medium', diseases:[
      {name:'Dengue', cases:null, per100k:389, growth7d:-5,
       asOf:'2026-05-17', source:'PAHO PLISA', provisional:true,
       url:'https://www.paho.org/en/arbo-portal/dengue-data-and-analysis'},
      {name:'Yellow fever', cases:34, deaths:15, cfr:44.1,
       asOf:'2026-02-14', source:'PAHO — combined BOL/COL/PER/VEN, first 7 weeks 2026', provisional:true,
       url:'https://www.paho.org/en/epidemiological-alerts-and-updates'}
    ]},
    PER:{ conf:'medium', diseases:[
      {name:'Yellow fever', severity:41, asOf:'2026-02-14', source:'PAHO epidemiological alerts', provisional:true,
       url:'https://www.paho.org/en/epidemiological-alerts-and-updates'},
      {name:'Oropouche fever', cases:600, asOf:'2025-12-31', source:'PAHO — Loreto region, 2024 cumulative', provisional:true,
       url:'https://www.paho.org/en/epidemiological-alerts-and-updates'}
    ]},
    LKA:{ conf:'high', diseases:[
      {name:'Dengue', cases:7916, per100k:36, growth7d:41,
       asOf:'2026-07-05', source:'WHO SEARO epidemiological bulletin, week 27', provisional:true,
       url:'https://www.who.int/southeastasia/health-topics/emergencies'}
    ]},
    BGD:{ conf:'medium', diseases:[
      {name:'Dengue', cases:2907, per100k:1.7, growth7d:14,
       asOf:'2026-07-12', source:'WHO SEARO epidemiological bulletin, week 28', provisional:true,
       url:'https://www.who.int/southeastasia/health-topics/emergencies'}
    ]},
    THA:{ conf:'high', diseases:[
      {name:'Dengue', cases:938, per100k:1.3, growth7d:3,
       asOf:'2026-07-12', source:'WHO SEARO epidemiological bulletin, week 28', provisional:true,
       url:'https://www.who.int/southeastasia/health-topics/emergencies'},
      {name:'Mpox', cases:5, severity:12,
       asOf:'2026-07-12', source:'WHO SEARO epidemiological bulletin, weeks 27–28', provisional:true,
       url:'https://www.who.int/southeastasia/health-topics/emergencies'}
    ]},
    IND:{ conf:'medium', diseases:[
      {name:'Dengue', cases:6625, per100k:0.5, growth7d:6,
       asOf:'2026-06-30', source:'WHO SEARO epidemiological bulletin, June', provisional:true,
       url:'https://www.who.int/southeastasia/health-topics/emergencies'},
      {name:'Nipah virus', cases:1, deaths:null, severity:31,
       asOf:'2026-06-30', source:'WHO SEARO epidemiological bulletin', provisional:true,
       url:'https://www.who.int/southeastasia/health-topics/emergencies'}
    ]},
    NPL:{ conf:'medium', diseases:[
      {name:'Dengue', cases:292, per100k:1.0,
       asOf:'2026-06-30', source:'WHO SEARO epidemiological bulletin, June', provisional:true,
       url:'https://www.who.int/southeastasia/health-topics/emergencies'}
    ]},
    MDV:{ conf:'high', diseases:[
      {name:'Measles', cases:144, deaths:0, per100k:26, growth7d:18,
       asOf:'2026-07-13', source:'WHO SEARO — Greater Malé', provisional:true,
       url:'https://www.who.int/southeastasia/health-topics/emergencies'}
    ]},
    ZAF:{ conf:'high', diseases:[
      {name:'Measles', cases:null, asOf:null, source:'NICD weekly situation reports — awaiting pipeline',
       url:'https://www.nicd.ac.za/'},
      {name:'Diphtheria', cases:null, asOf:null, source:'NICD weekly situation reports — awaiting pipeline',
       url:'https://www.nicd.ac.za/'}
    ]}
  },

  /* Subnational tier — appears only when the camera is close enough. */
  admin1: {
    'ZAF:Gauteng':      { severity:34, pop:16000000, conf:'high',
      diseases:[{name:'Measles', cases:null, source:'NICD weekly situation report', url:'https://www.nicd.ac.za/'}] },
    'ZAF:Western Cape': { severity:21, pop:7400000, conf:'high',
      diseases:[{name:'Measles', cases:null, source:'NICD weekly situation report', url:'https://www.nicd.ac.za/'}] },
    'ZAF:KwaZulu-Natal':{ severity:29, pop:11500000, conf:'high',
      diseases:[{name:'Measles', cases:null, source:'NICD weekly situation report', url:'https://www.nicd.ac.za/'}] },
    'COD:Ituri':        { severity:91, pop:5600000, conf:'low',
      diseases:[{name:'Ebola (Bundibugyo virus)', cases:null, growth7d:26, cfr:19.1,
        source:'Africa CDC BVD situational report, 14 Jul 2026', provisional:true, url:'https://khub.africacdc.org/'}] },
    'COD:Nord-Kivu':    { severity:74, pop:8000000, conf:'low',
      diseases:[{name:'Ebola (Bundibugyo virus)', cases:null, growth7d:15,
        source:'Africa CDC BVD situational report', provisional:true, url:'https://khub.africacdc.org/'}] },
    'BRA:São Paulo':    { severity:47, pop:44000000, conf:'high',
      diseases:[{name:'Dengue', cases:null, per100k:410, source:'PAHO PLISA subnational', url:'https://www.paho.org/plisa'}] },
    'BRA:Minas Gerais': { severity:55, pop:21000000, conf:'high',
      diseases:[{name:'Dengue', cases:null, per100k:520, source:'PAHO PLISA subnational', url:'https://www.paho.org/plisa'}] }
  },

  /* City tier. Global city-level case counts do not exist as a single feed —
     these are outbreak *event locations*, which do. See guide §6. */
  cities: {
    'COD:Bunia':      { lat:1.5586,  lon:30.2470, severity:93, conf:'low',
      diseases:[{name:'Ebola (Bundibugyo virus)', cases:null, source:'WHO Health Emergency Dashboard event location',
        url:'https://extranet.who.int/publicemergency/'}] },
    'COD:Kinshasa':   { lat:-4.4419, lon:15.2663, severity:44, conf:'medium',
      diseases:[{name:'Ebola (Bundibugyo virus)', cases:null, source:'WHO Health Emergency Dashboard event location',
        url:'https://extranet.who.int/publicemergency/'}] },
    'UGA:Kampala':    { lat:0.3476,  lon:32.5825, severity:61, conf:'medium',
      diseases:[{name:'Ebola (Bundibugyo virus)', cases:null, source:'WHO Health Emergency Dashboard event location',
        url:'https://extranet.who.int/publicemergency/'}] },
    'MDV:Malé':       { lat:4.1755,  lon:73.5093, severity:38, conf:'high',
      diseases:[{name:'Measles', cases:144, source:'WHO SEARO — Greater Malé', provisional:true,
        url:'https://www.who.int/southeastasia/health-topics/emergencies'}] },
    'BRA:São Paulo':  { lat:-23.5505,lon:-46.6333,severity:46, conf:'high',
      diseases:[{name:'Dengue', cases:null, source:'PAHO PLISA', url:'https://www.paho.org/plisa'}] },
    'ZAF:Johannesburg':{lat:-26.2041,lon:28.0473, severity:33, conf:'high',
      diseases:[{name:'Measles', cases:null, source:'NICD weekly situation report', url:'https://www.nicd.ac.za/'}] }
  },

  /* Bottom-right drawer content, keyed by disease name.

     This is only the offline snapshot — enough to make the drawer work if the
     scraper is unreachable. The live version comes from /api/outbreaks, which
     carries a full entry for every disease in the dataset and auto-compiles one
     for anything new. See api/guidance.js. */
  guidance: {
    'Ebola (Bundibugyo virus)':{
      treatments:['<strong>Ervebo (rVSV-ZEBOV)</strong> is licensed for Zaire ebolavirus and is <em>not</em> expected to protect against Bundibugyo.','<strong>mAb114 and Inmazeb</strong> are similarly Zaire-specific; efficacy against Bundibugyo is unestablished.','Supportive care — fluid and electrolyte management — remains the mainstay.'],
      travel:['WHO and Africa CDC both advise against travel or trade restrictions; use enhanced screening instead.','Eighteen countries have implemented travel measures as of July 2026.','Exit screening operates at Bunia and Kampala.'],
      avoid:['Funeral and burial practices involving contact with the body.','Bushmeat handling and preparation.','Unprotected care of a sick household member.'],
      prevention:['Report fever with recent contact history immediately.','Handwashing with soap or chlorine solution.','Health workers: full PPE plus buddy-checked doffing.'],
      symptoms:['Sudden fever, severe fatigue, muscle pain, headache and sore throat 2–21 days after exposure.','Then vomiting, diarrhoea, rash and impaired kidney and liver function; bleeding in some patients.'],
      detection:['Species-specific RT-PCR on blood — a generic filovirus assay will not separate Bundibugyo from Zaire, and that distinction decides which treatments are worth giving.'],
      source:'WHO — Ebola virus disease fact sheet', url:'https://www.who.int/news-room/fact-sheets/detail/ebola-virus-disease'
    },
    'Dengue':{
      treatments:['No specific antiviral. Paracetamol for fever.','<strong>Avoid NSAIDs</strong> — ibuprofen and aspirin raise bleeding risk.','Qdenga (TAK-003) is available in some countries; check national policy.'],
      travel:['Risk concentrates in the rainy season across the Americas and South-East Asia.','Brazil has all four serotypes circulating at once, which raises severe-disease risk on reinfection.'],
      avoid:['Standing water within 100m of where you sleep.','Being outdoors unprotected at dawn and dusk, when Aedes aegypti bites.'],
      prevention:['Repellent containing DEET, picaridin or IR3535.','Window screens and treated bed nets.','Empty and scrub water containers weekly.'],
      symptoms:['Sudden high fever, severe headache, pain behind the eyes, muscle and joint pain, rash.','Severe dengue begins 24–48 hours after the fever drops — that is the dangerous window, not the fever itself.'],
      detection:['NS1 antigen or PCR from day 1 to about day 5; IgM serology from day 5 onward.','A daily full blood count tracks the platelet drop that flags severe disease.'],
      source:'WHO — Dengue and severe dengue fact sheet', url:'https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue'
    },
    'Measles':{
      treatments:['No antiviral. Vitamin A supplementation reduces mortality in children.','Treat secondary bacterial infections as they arise.'],
      travel:['Confirm two documented MMR doses 6–8 weeks before departure.','Infants 6–11 months may need an early dose for outbreak areas.'],
      avoid:['Enclosed crowded settings during an active outbreak — the virus stays airborne up to two hours.'],
      prevention:['Two-dose MMR is roughly 97% effective.','Isolate cases for four days after rash onset.'],
      symptoms:['Fever, cough, runny nose and red watery eyes for 2–4 days first.','Koplik spots inside the cheek appear before the rash and are diagnostic.','Rash starts at the hairline and spreads downward.'],
      detection:['Measles-specific IgM in serum, or PCR on a throat swab or urine.','Swab early — PCR sensitivity falls off after about 3 days of rash.'],
      source:'WHO — Measles fact sheet', url:'https://www.who.int/news-room/fact-sheets/detail/measles'
    },
    'Cholera':{
      treatments:['Oral rehydration salts resolve most cases.','IV fluids for severe dehydration.','Antibiotics only for severe cases, guided by local resistance patterns.'],
      travel:['Oral cholera vaccine for travel to active transmission areas.'],
      avoid:['Untreated water, ice, and raw shellfish.','Food from street vendors in affected zones.'],
      prevention:['Boil it, cook it, peel it, or leave it.','Handwashing with soap after latrine use.'],
      symptoms:['Sudden profuse watery diarrhoea, often described as rice-water, sometimes with vomiting.','No fever and no cramping in classic cases. Severe dehydration can kill within hours.'],
      detection:['Rapid dipstick test on stool for screening; culture confirms and gives antibiotic sensitivity.','In a declared outbreak, rehydration starts on clinical grounds — testing second.'],
      source:'WHO — Cholera fact sheet', url:'https://www.who.int/news-room/fact-sheets/detail/cholera'
    },
    'Yellow fever':{
      treatments:['No antiviral. Supportive care only.','Avoid aspirin and NSAIDs.'],
      travel:['A single vaccine dose gives lifelong protection.','Many countries require a certificate for entry from endemic areas.','Spread now extends beyond the traditional Amazon basin.'],
      avoid:['Unvaccinated travel to endemic zones.','Daytime exposure in forested areas.'],
      prevention:['Vaccinate at least 10 days before travel.','Repellent and long sleeves.'],
      symptoms:['First phase: fever, muscle pain, headache, nausea.','About 15% enter a toxic phase within 24 hours of apparent recovery: jaundice, dark urine, abdominal pain, bleeding.'],
      detection:['PCR early in illness; serology later, though it cross-reacts with dengue and with vaccination.','Jaundice plus fever plus forest exposure in an endemic country is treated as yellow fever until proven otherwise.'],
      source:'WHO — Yellow fever fact sheet', url:'https://www.who.int/news-room/fact-sheets/detail/yellow-fever'
    },
    _default:{
      treatments:['Looking this one up — the scraper had not seen this disease before.'],
      travel:['Check the CDC travel notices and the WHO regional advisory for this location.'],
      avoid:['Follow the precautions in the source bulletin linked above.'],
      prevention:['Follow national public-health guidance for this outbreak.'],
      symptoms:['Not loaded. See the source bulletin.'],
      detection:['Not loaded. See the source bulletin.'],
      source:'WHO — Disease Outbreak News', url:'https://www.who.int/emergencies/disease-outbreak-news'
    },
    _disclaimer:'General public-health information drawn from WHO and CDC guidance. Not medical advice — follow your national health authority.'
  }
};

/* ── GEOMETRY SOURCES ─────────────────────────────────────────────────────
   Natural Earth via GitHub raw + jsDelivr mirror. Both send permissive CORS
   headers, so the browser can fetch them directly. Your *epidemiological*
   feeds cannot be fetched this way — see the guide. */

export const GEO = {
  countries:['https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',
             'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson'],
  /* Bundled with the project. Natural Earth's worldwide admin-1 file is 38 MB,
     which is far too heavy for a browser, so it was simplified down to 1.7 MB
     (3,978 regions across 218 countries) and shipped in public/data/.
     Cities are the major ones only — capitals, megacities and pop >= 300k. */
  admin1:   ['data/admin1.json'],
  cities:   ['data/cities.json']
};

export async function fetchFirst(urls){
  let err;
  for(const u of urls){
    try{ const r = await fetch(u); if(r.ok) return await r.json(); err = new Error(r.status); }
    catch(e){ err = e; }
  }
  throw err;
}

/* ── LIVE APP STATE ───────────────────────────────────────────────────────
   One shared mutable object. Every module that needs to read or write app
   state imports S itself (not a copy of a field), so changes are visible
   everywhere immediately — this is what makes the module split possible
   without introducing a message bus. */

export const S = {
  countries:null, admin1:null, cities:null,
  byISO:new Map(), continents:new Map(),
  view:{level:'world', continent:null, iso:null, region:null, city:null},
  lod:'world',          // world | region | city
  hover:null, threshold:0, tab:'treatments', sort:'recent', showRoutine:false,
  disease:null,         // which disease the bottom-right drawer is describing
  chip:null,            // which FAQ chip is expanded, if any
  entities:new Map(),   // resolved severity per key
  lastLOD:'world', lastFocus:null   // shared between refresh() and the render loop
};

export const CONTINENT_LABEL = {
  'Africa':'Africa','Asia':'Asia','Europe':'Europe',
  'North America':'North America','South America':'South America',
  'Oceania':'Oceania','Antarctica':'Antarctica','Seven seas (open ocean)':'Oceans'
};

/* ── RESOLVE DATA → SEVERITY PER ENTITY ──────────────────────────────────── */

export function diseaseSeverity(dis){
  const s = severityOf(dis);
  return s;
}
export function entitySeverity(rec){
  if(!rec) return null;
  if(rec.severity != null) return clamp(rec.severity,0,100);
  if(!rec.diseases) return null;
  const vals = rec.diseases.map(diseaseSeverity).filter(v=>v!=null);
  return vals.length ? Math.max(...vals) : null;   // worst active disease drives the colour
}
export function maxGrowth(rec){
  if(!rec || !rec.diseases) return null;
  const g = rec.diseases.map(d=>d.growth7d).filter(v=>v!=null);
  return g.length ? Math.max(...g) : null;
}
export function maxPer100k(rec){
  if(!rec || !rec.diseases) return null;
  const p = rec.diseases.map(d=>d.per100k).filter(v=>v!=null);
  return p.length ? Math.max(...p) : null;
}

/* True when every disease behind a record is routine surveillance (background
   flu/ARI activity) rather than an active outbreak alert. Drives the hatch
   overlay in globe.js's paint(), so a quiet flu season never reads the same
   as a declared outbreak just because both happen to land on the same tier
   of the severity ramp. */
export function isRoutineOnly(rec){
  if(!rec || !rec.diseases || !rec.diseases.length) return false;
  return rec.diseases.every(d => d.routine);
}

export function buildEntities(){
  S.entities.clear();
  // countries
  for(const [iso,rec] of Object.entries(SEED.countries)){
    S.entities.set(iso, {key:iso, level:'country', sev:entitySeverity(rec), rec});
  }
  // admin1
  for(const [k,rec] of Object.entries(SEED.admin1)){
    S.entities.set(k, {key:k, level:'admin1', sev:entitySeverity(rec), rec});
  }
  // cities
  for(const [k,rec] of Object.entries(SEED.cities)){
    S.entities.set(k, {key:k, level:'city', sev:entitySeverity(rec), rec});
  }
  // continents = rollup of their countries
  for(const [cont, isos] of S.continents){
    const kids = isos.map(i=>{
      const e = S.entities.get(i);
      return e ? {severity:e.sev, pop:S.byISO.get(i)?.pop || 1} : null;
    }).filter(Boolean);
    const sev = rollup(kids);
    S.entities.set('C:'+cont, {key:'C:'+cont, level:'continent', sev, rec:{
      diseases: aggregateDiseases(isos), conf: worstConf(isos)
    }});
  }
}
export function aggregateDiseases(isos){
  const m = new Map();
  isos.forEach(iso=>{
    const rec = SEED.countries[iso]; if(!rec) return;
    rec.diseases.forEach(d=>{
      const cur = m.get(d.name) || {name:d.name, cases:0, deaths:0, countries:0, source:d.source, url:d.url, asOf:d.asOf, provisional:d.provisional, _any:false};
      if(d.cases != null){ cur.cases += d.cases; cur._any = true; }
      if(d.deaths != null) cur.deaths += d.deaths;
      cur.countries++;
      if(d.asOf && (!cur.asOf || d.asOf > cur.asOf)) cur.asOf = d.asOf;
      m.set(d.name, cur);
    });
  });
  return [...m.values()].map(d=>({...d, cases:d._any?d.cases:null, deaths:d.deaths||null}))
    .sort((a,b)=>(b.cases||0)-(a.cases||0));
}
export function worstConf(isos){
  const order = {low:0, medium:1, high:2};
  let w = null;
  isos.forEach(i=>{ const c = SEED.countries[i]?.conf; if(c && (w===null || order[c] < order[w])) w = c; });
  return w;
}

/* ── GEOJSON FEATURE HELPERS ──────────────────────────────────────────────
   Natural Earth's property names vary by field, hence the fallback chains. */

export function isoOf(f){
  const p = f.properties;
  let iso = p.ADM0_A3 || p.adm0_a3 || p.ISO_A3 || p.iso_a3;
  if(!iso || iso === '-99') iso = (p.ADMIN || p.admin || '').slice(0,3).toUpperCase();
  return iso;
}
export function nameOf(f){ const p=f.properties; return p.ADMIN || p.admin || p.NAME || p.name || 'Unknown'; }
export function contOf(f){ const p=f.properties; return p.CONTINENT || p.continent || 'Unknown'; }
