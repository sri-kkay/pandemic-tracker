/* ===========================================================================
   SOURCE: ECDC ERVISS  (fills Europe)

   Plain CSV files sitting in a GitHub repository. No tricks, no hidden URLs.
   Influenza-like-illness consultation rates for ~23 European countries.

   ⚠ HEADS UP, checked 27 July 2026:
   ECDC's own README says GitHub downloads are PAUSED while they migrate from
   TESSy to EpiPulse. The website erviss.org resumed on 26 June 2026, but these
   CSV files have not been updated since 22 May 2026, so the newest week in
   them is 2026-W20.

   Rather than delete this adapter, it checks how old the data is and switches
   itself OFF if it's too stale. When ECDC starts committing again it turns
   itself back on with no code change from you.

   Check the current status here:
   https://github.com/EU-ECDC/Respiratory_viruses_weekly_data
   =========================================================================== */

import { fetchWithTimeout } from '../http.js';
import { toISO } from '../iso.js';
import { parseCSV } from '../text.js';

const ERVISS_URL =
  'https://raw.githubusercontent.com/EU-ECDC/Respiratory_viruses_weekly_data/main/data/ILIARIRates.csv';

/* You asked for Europe on the map even though ECDC's GitHub feed is frozen.
   Set to true, so the data is published — but every figure now carries its
   week on the globe ("2026-W20", shown as "2mo ago" in red), so nobody can
   mistake it for this week's numbers.

   Flip to false if you'd rather Europe stayed grey until ECDC resumes. */
const ERVISS_SHOW_STALE  = true;
const STALE_AFTER_WEEKS  = 6;

/* "2026-W20" -> how many weeks ago that week ended */
function weeksOld(yearweek){
  const m = /^(\d{4})-W(\d{1,2})$/.exec(String(yearweek));
  if(!m) return null;
  const year = +m[1], week = +m[2];
  const jan4 = new Date(Date.UTC(year, 0, 4));           // ISO week 1 holds Jan 4
  const mondayOffset = (jan4.getUTCDay() + 6) % 7;       // Monday = 0
  const week1Monday = jan4.getTime() - mondayOffset * 86400000;
  const weekEnd = week1Monday + (week * 7 - 1) * 86400000;
  return Math.floor((Date.now() - weekEnd) / (7 * 86400000));
}

/* ILI consultation rate per 100,000. Roughly: under 200 is a quiet week,
   1000+ is a real wave. Tune these if the colours look wrong to you. */
function fluSeverity(rate){
  if(rate == null) return null;
  if(rate < 100)  return 8;
  if(rate < 300)  return 18;
  if(rate < 800)  return 30;
  if(rate < 2000) return 45;
  return 60;
}

export async function fetchERVISS(){
  const r = await fetchWithTimeout(ERVISS_URL);
  if(!r.ok) throw new Error('ERVISS returned ' + r.status);
  const rows = parseCSV(await r.text());

  const weeks = [...new Set(rows.map(x => x.yearweek))].sort();
  const latest = weeks[weeks.length - 1];
  const age = weeksOld(latest);

  // ECDC has paused GitHub updates. Don't publish months-old numbers as if
  // they were current — sit this source out until it starts moving again.
  const isStale = age != null && age > STALE_AFTER_WEEKS;
  if(isStale && !ERVISS_SHOW_STALE){
    return { countries:{}, latest, age, matched:0, stale:true, published:false };
  }

  const window = new Set(weeks.slice(-4));

  const best = {};   // iso -> { rate, week, indicator }

  for(const row of rows){
    if(!window.has(row.yearweek)) continue;
    if(row.age !== 'total') continue;
    if(row.countryname === 'EU/EEA') continue;      // that's an aggregate, not a country

    // prefer influenza-like illness; fall back to acute respiratory infection
    // for the countries that only report ARI
    const ili = row.indicator === 'ILIconsultationrate';
    const ari = row.indicator === 'ARIconsultationrate';
    if(!ili && !ari) continue;

    const iso = toISO(row.countryname);
    if(!iso) continue;

    const value = parseFloat(row.value);
    if(!Number.isFinite(value)) continue;

    const prev = best[iso];
    const beatsIt =
      !prev ||
      (ili && prev.indicator === 'ARI') ||               // ILI always wins over ARI
      (row.yearweek > prev.week && ili === (prev.indicator === 'ILI'));

    if(beatsIt) best[iso] = { rate:value, week:row.yearweek, indicator: ili ? 'ILI' : 'ARI' };
  }

  const countries = {};
  for(const [iso, v] of Object.entries(best)){
    countries[iso] = { conf:'high', diseases:[{
      name: v.indicator === 'ILI' ? 'Influenza-like illness' : 'Acute respiratory infection',
      cases:null, deaths:null, cfr:null,
      per100k: Math.round(v.rate),
      growth7d:null,
      severity: fluSeverity(v.rate),
      asOf: v.week,                          // e.g. "2026-W20"
      source:'ECDC ERVISS weekly respiratory surveillance',
      url:'https://erviss.org/',
      provisional:false,
      routine:true          // routine weekly surveillance, not an outbreak alert
    }]};
  }

  return { countries, latest, age, matched:Object.keys(countries).length,
           stale:isStale, published:true };
}
