/* ===========================================================================
   SOURCE: WHO FluNet  (fills the whole world)

   Endpoint taken straight from WHO's own download link on
   https://www.who.int/tools/flunet — this is the real one:

     https://xmart-api-public.who.int/FLUMART/VIW_FNT?$format=csv

   Data dictionary (the exact column list) is here, worth opening once:

     https://xmart-api-public.who.int/FLUMART/VIW_FLU_METADATA?$format=csv

   ~190 countries reporting weekly to WHO's Global Influenza Surveillance and
   Response System. This is the single biggest coverage jump available.

   IMPORTANT: the full table goes back to 1995 and is enormous. Always filter
   by year. Never fetch it unfiltered.

   Because column names couldn't be verified before shipping, this adapter
   sniffs for them instead of assuming. It tries several likely names for each
   field and reports in _notes which ones it actually found. If it can't work
   the file out, it says so rather than failing silently.
   =========================================================================== */

import { fetchWithTimeout, USER_AGENT } from '../http.js';
import { toISO } from '../iso.js';
import { parseCSVSafe, findColumn } from '../text.js';

const FLUNET_BASE = 'https://xmart-api-public.who.int/FLUMART/VIW_FNT';

/* Influenza positivity is the standard measure of how active a season is.
   Under 5% is off-season; above 30% is an intense wave. */
function fluPositivitySeverity(pct){
  if(pct == null) return null;
  if(pct < 5)  return 8;
  if(pct < 15) return 20;
  if(pct < 30) return 34;
  if(pct < 50) return 48;
  return 58;
}

export async function fetchFluNet(){
  const year = new Date().getUTCFullYear();

  // Try progressively looser queries. xMart supports OData, but not every
  // table supports every operator, so fall back rather than give up.
  const attempts = [
    `${FLUNET_BASE}?$format=csv&$filter=ISO_YEAR%20eq%20${year}`,
    `${FLUNET_BASE}?$format=csv&$filter=ISO_YEAR%20ge%20${year - 1}`,
    `${FLUNET_BASE}?$format=csv&$filter=MMWR_YEAR%20eq%20${year}`,
    `${FLUNET_BASE}?$format=csv&$top=40000&$orderby=ISO_WEEKSTARTDATE%20desc`
  ];

  let rows = null, usedUrl = null, lastErr = null;
  for(const url of attempts){
    try{
      const r = await fetchWithTimeout(url, {
        headers:{ 'user-agent': USER_AGENT }
      });
      if(!r.ok){ lastErr = 'HTTP ' + r.status; continue; }
      const text = await r.text();
      if(text.trim().startsWith('{') || text.trim().startsWith('<')){ lastErr = 'not CSV'; continue; }
      const parsed = parseCSVSafe(text);
      if(parsed.length){ rows = parsed; usedUrl = url; break; }
      lastErr = 'no rows';
    }catch(e){ lastErr = e.message; }
  }
  if(!rows) throw new Error('all query attempts failed (' + lastErr + ')');

  // Work out what the columns are actually called
  const sample = rows[0];
  const col = {
    iso:    findColumn(sample, ['COUNTRY_CODE','ISO3','COUNTRY_AREA_TERRITORY_CODE','CODE']),
    name:   findColumn(sample, ['COUNTRY_AREA_TERRITORY','COUNTRY','COUNTRYAREATERRITORY']),
    year:   findColumn(sample, ['ISO_YEAR','MMWR_YEAR','YEAR']),
    week:   findColumn(sample, ['ISO_WEEK','MMWR_WEEK','WEEK']),
    posAll: findColumn(sample, ['INF_ALL','INF_ALL_TOTAL','INFALL']),
    specs:  findColumn(sample, ['SPEC_PROCESSED_NB','SPEC_RECEIVED_NB','SPECPROCESSED'])
  };

  if(!(col.iso || col.name) || !col.week || !col.posAll){
    throw new Error('columns not recognised. Saw: ' + Object.keys(sample).slice(0,25).join(', '));
  }

  // Group by country, keep the two most recent weeks so we can measure a trend
  const byCountry = {};
  for(const row of rows){
    const iso = (col.iso && /^[A-Z]{3}$/.test(row[col.iso])) ? row[col.iso] : toISO(row[col.name]);
    if(!iso) continue;

    const y = parseInt(row[col.year], 10) || year;
    const w = parseInt(row[col.week], 10);
    if(!Number.isFinite(w)) continue;

    const pos   = parseFloat(row[col.posAll]);
    const specs = col.specs ? parseFloat(row[col.specs]) : NaN;
    if(!Number.isFinite(pos)) continue;

    const stamp = y * 100 + w;
    (byCountry[iso] ||= []).push({ stamp, y, w, pos, specs: Number.isFinite(specs) ? specs : null });
  }

  const countries = {};
  let newestStamp = 0;

  for(const [iso, list] of Object.entries(byCountry)){
    list.sort((a,b) => b.stamp - a.stamp);
    const now  = list[0];
    const prev = list[1];
    if(now.stamp > newestStamp) newestStamp = now.stamp;

    const positivity = (now.specs && now.specs > 0)
      ? +(now.pos / now.specs * 100).toFixed(1)
      : null;

    // week-on-week change in detections — this is what drives the white
    // "fast growth" outline on the globe
    let growth = null;
    if(prev && prev.pos > 5) growth = Math.round((now.pos - prev.pos) / prev.pos * 100);

    countries[iso] = { conf:'high', diseases:[{
      name:'Influenza',
      cases: Math.round(now.pos),
      deaths: null,
      cfr: null,
      per100k: null,
      growth7d: growth,
      severity: fluPositivitySeverity(positivity) ?? (now.pos > 100 ? 25 : 10),
      asOf: `${now.y}-W${String(now.w).padStart(2,'0')}`,
      source: positivity != null
        ? `WHO FluNet (GISRS) — ${positivity}% of specimens positive`
        : 'WHO FluNet (GISRS)',
      url:'https://www.who.int/tools/flunet',
      provisional:false,
      routine:true          // routine weekly surveillance, not an outbreak alert
    }]};
  }

  const nw = String(newestStamp);
  return {
    countries,
    matched: Object.keys(countries).length,
    newestWeek: newestStamp ? `${nw.slice(0,4)}-W${nw.slice(4)}` : 'unknown',
    columns: col,
    usedUrl
  };
}
