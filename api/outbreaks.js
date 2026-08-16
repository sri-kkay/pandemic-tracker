/* ===========================================================================
   api/outbreaks.js  —  THE BACKEND SCRAPER
   ---------------------------------------------------------------------------
   Runs on Vercel's servers, not in the browser. That matters: browsers are
   blocked from calling WHO directly (CORS), servers are not.

   Visit /api/outbreaks in your browser to see what it produces.

   Vercel caches the response for 6 hours, so WHO gets hit a few times a day
   no matter how many people visit your site.

   The seven upstream sources live in _lib/adapters/. They run in parallel
   below — each has its own timeout (_lib/http.js) and its own try/catch, so
   one slow or broken source can never block or take down the others, and the
   whole response comes back well inside Vercel's 30s function limit.
   =========================================================================== */

import { buildGuidance, collectDiseaseNames } from './guidance.js';
import { fetchWHO }        from './_lib/adapters/who.js';
import { fetchERVISS }     from './_lib/adapters/erviss.js';
import { fetchFluNet }     from './_lib/adapters/flunet.js';
import { fetchPAHO }       from './_lib/adapters/paho.js';
import { fetchAfricaCDC }  from './_lib/adapters/africacdc.js';
import { fetchCDCStates }  from './_lib/adapters/cdc-states.js';
import { fetchNICD }       from './_lib/adapters/nicd.js';

const CACHE_HOURS = 6;

/* Things the scraper cannot get yet, so the map is never empty. Delete a line
   here as soon as a real source starts supplying it. NICD now supplies South
   Africa directly, so this is currently empty. */
const BASELINE = {};

function mergeCountries(target, source, defaultConf){
  for(const [iso, rec] of Object.entries(source)){
    if(!target[iso]) target[iso] = { conf: defaultConf, diseases: [] };
    target[iso].diseases.push(...rec.diseases);
  }
}

/* Each source runs behind its own settled promise so a rejection never
   blocks the others — Promise.allSettled resolves once every adapter has
   either returned or failed, in parallel, rather than one after another. */
async function runSources(){
  const [who, erviss, flunet, paho, africacdc, cdcStates, nicd] = await Promise.allSettled([
    fetchWHO(), fetchERVISS(), fetchFluNet(), fetchPAHO(),
    fetchAfricaCDC(), fetchCDCStates(), fetchNICD()
  ]);

  const notes = [];
  const countries = {};
  const admin1 = {};

  if(who.status === 'fulfilled'){
    const w = who.value;
    Object.assign(countries, w.countries);
    notes.push(`WHO: read ${w.count} bulletins, matched ${Object.keys(w.countries).length} countries (${w.rescued} from multi-country bulletins)`);
    if(w.skipped.length){
      notes.push(`Not a single country, ignored: ${[...new Set(w.skipped)].join(', ')}`);
    }
  } else {
    notes.push('WHO fetch failed: ' + who.reason.message);
  }

  if(erviss.status === 'fulfilled'){
    const eu = erviss.value;
    mergeCountries(countries, eu.countries, 'high');
    if(!eu.published){
      notes.push(`ERVISS: HIDDEN — newest week ${eu.latest} is about ${eu.age} weeks old. `
        + `Set ERVISS_SHOW_STALE = true to publish it anyway.`);
    } else if(eu.stale){
      notes.push(`ERVISS: matched ${eu.matched} European countries, but newest week is ${eu.latest} `
        + `(~${eu.age} weeks old). ECDC paused GitHub updates during their EpiPulse migration; `
        + `the globe labels every one of these figures with its age. `
        + `Check https://github.com/EU-ECDC/Respiratory_viruses_weekly_data for a resume.`);
    } else {
      notes.push(`ERVISS: matched ${eu.matched} European countries, newest week ${eu.latest} (${eu.age} weeks old)`);
    }
  } else {
    notes.push('ERVISS fetch failed: ' + erviss.reason.message);
  }

  if(flunet.status === 'fulfilled'){
    const flu = flunet.value;
    mergeCountries(countries, flu.countries, 'high');
    notes.push(`FluNet: matched ${flu.matched} countries, newest week ${flu.newestWeek}`);
    notes.push(`FluNet columns detected: ${JSON.stringify(flu.columns)}`);
  } else {
    notes.push('FluNet fetch failed: ' + flunet.reason.message
      + ' | test it yourself: https://xmart-api-public.who.int/FLUMART/VIW_FNT?$format=csv&$top=5'
      + ' | column list: https://xmart-api-public.who.int/FLUMART/VIW_FLU_METADATA?$format=csv');
  }

  if(paho.status === 'fulfilled'){
    const p = paho.value;
    mergeCountries(countries, p.countries, 'high');
    notes.push(`PAHO ARBO: matched ${p.matched} countries in the Americas, `
      + `bulletin ${p.year} through EW ${p.week ?? '?'} (${p.asOf})`);
    if(p.unmatched.length){
      notes.push(`PAHO names not in the ISO map: ${p.unmatched.join(', ')}`);
    }
  } else {
    notes.push('PAHO fetch failed: ' + paho.reason.message
      + ' | test it yourself: https://ais.paho.org/ha_viz/Arbo/Arbo_Bulletin_'
      + new Date().getUTCFullYear() + '.asp?env=pri');
  }

  if(africacdc.status === 'fulfilled'){
    const a = africacdc.value;
    mergeCountries(countries, a.countries, 'medium');
    notes.push(`Africa CDC: matched ${a.matched} countries from `
      + `${a.parsedBriefs}/${a.briefs} briefs (via ${a.via})`);
    if(a.unmatched.length){
      notes.push(`Africa CDC names not in the ISO map: ${a.unmatched.join(', ')}`);
    }
  } else {
    notes.push('Africa CDC fetch failed: ' + africacdc.reason.message
      + ' | test it yourself: https://africacdc.org/wp-json/wp/v2/disease-outbreak?per_page=3');
  }

  if(cdcStates.status === 'fulfilled'){
    const st = cdcStates.value;
    Object.assign(admin1, st.admin1);
    notes.push(`CDC states: matched ${st.matched} US states/jurisdictions, week ending ${st.newest}`);
    notes.push(`CDC state columns detected: ${JSON.stringify(st.columns)}`);
    if(st.unmatchedLevels.length){
      notes.push(`CDC activity levels not recognised: ${st.unmatchedLevels.join(', ')}`);
    }
  } else {
    notes.push('CDC states fetch failed: ' + cdcStates.reason.message
      + ' | test it yourself: https://data.cdc.gov/resource/f3zz-zga5.json?$limit=3');
  }

  if(nicd.status === 'fulfilled'){
    const za = nicd.value;
    Object.assign(admin1, za.admin1);
    notes.push(`NICD: matched ${za.matched} South African provinces (${za.disease}, `
      + `${za.used.scope}) from "${za.used.title.slice(0,60)}" dated ${za.used.date}`);
  } else {
    notes.push('NICD fetch failed: ' + nicd.reason.message
      + ' | test it yourself: https://www.nicd.ac.za/wp-json/wp/v2/posts?search=measles&per_page=3');
  }

  // merge the baseline in without overwriting anything live
  for(const [iso, rec] of Object.entries(BASELINE)){
    if(!countries[iso]) countries[iso] = rec;
  }

  return { countries, admin1, notes };
}

export default async function handler(req, res){
  // Tell Vercel's CDN to cache this. WHO gets hit ~4 times a day total.
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${CACHE_HOURS*3600}, stale-while-revalidate=86400`
  );

  const { countries, admin1, notes } = await runSources();

  /* -------------------------------------------------------------------------
     GUIDANCE — the bottom-right drawer

     This runs LAST, on purpose. It reads the finished payload, collects every
     disease name that ended up in it, and returns a drawer entry for each one.
     Because the list it walks is the same list the feed is built from, there
     is no way for a disease to appear on the globe without guidance behind it.

     Anything the curated library has never seen gets looked up automatically
     and comes back tagged auto:true. If that lookup fails or times out, the
     entry is marked pending and the next request retries it — the response
     still goes out either way.
     ----------------------------------------------------------------------- */
  const payload = { countries, admin1, cities: {} };

  let guidance = {};
  try{
    const names = collectDiseaseNames(payload);
    const g = await buildGuidance(names);
    guidance = g.guidance;
    notes.push(...g.notes);
  }catch(err){
    notes.push('Guidance build failed: ' + err.message + ' — drawer will show the fallback text');
  }

  res.status(200).json({
    updated: new Date().toISOString(),
    ...payload,
    guidance,
    _notes: notes          // open /api/outbreaks and read this to debug
  });
}
