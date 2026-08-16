/* ===========================================================================
   SOURCE: PAHO ARBO BULLETIN  (dengue, chikungunya, Zika across the Americas)

   PAHO's arbovirus bulletin lives at a predictable address:

     https://ais.paho.org/ha_viz/Arbo/Arbo_Bulletin_2026.asp?env=pri

   PAHO says the underlying data is "updated daily from official government
   sources", making this the freshest feed in the whole pipeline. 46 countries
   and territories report weekly: cases, incidence, severe cases, deaths, CFR.

   There's no JSON API — it's a web page. But the sentences are generated from
   a template and have been word-for-word stable since at least 2020:

     "Brazil with 10,266,017 cases (78.6%), Argentina with 581,559 cases..."

   so "<Country> with <number> cases" is a reliable pattern to pull out.

   Related pages worth building adapters for later:
     https://www.paho.org/en/health-emergencies/dashboards
     https://www.paho.org/en/epidemiological-alerts-and-updates
     https://opendata.paho.org/en/dengue-indicators
   =========================================================================== */

import { fetchWithTimeout, USER_AGENT } from '../http.js';
import { toISO } from '../iso.js';
import { stripTags } from '../text.js';
import { severityFor } from '../severity.js';

/* "Brazil with 10,266,017 cases" — country name, then a number, then "cases" */
const ARBO_PAIR = /([A-Z][A-Za-zÀ-ſ.'\-]*(?:\s+[A-Za-zÀ-ſ.'\-]+){0,3})\s+with\s+([\d][\d,\.]*)\s+cases/g;

export async function fetchPAHO(){
  const thisYear = new Date().getUTCFullYear();
  let html = null, year = null;

  for(const y of [thisYear, thisYear - 1]){
    try{
      const r = await fetchWithTimeout(`https://ais.paho.org/ha_viz/Arbo/Arbo_Bulletin_${y}.asp?env=pri`, {
        headers:{ 'user-agent': USER_AGENT }
      });
      if(!r.ok) continue;
      const body = await r.text();
      if(body.length > 2000){ html = body; year = y; break; }
    }catch(e){ /* try the previous year */ }
  }
  if(!html) throw new Error('bulletin page not reachable for ' + thisYear + ' or ' + (thisYear-1));

  const text = stripTags(html);

  // Which epidemiological week is this bulletin current to?
  let week = null;
  const weekPatterns = [
    /(?:EW|epidemiological week)\s+(\d{1,2})\s+of\s+(\d{4})/gi,
    /and\s+(?:EW\s+)?(\d{1,2})\s+of\s+(\d{4})/gi,
    /as of\s+(?:EW\s+)?(\d{1,2})\s+of\s+(\d{4})/gi
  ];
  for(const re of weekPatterns){
    for(const m of text.matchAll(re)){
      if(+m[2] === year && +m[1] >= 1 && +m[1] <= 53){
        week = Math.max(week ?? 0, +m[1]);
      }
    }
  }
  const asOf = week ? `${year}-W${String(week).padStart(2,'0')}` : `${year}-W01`;

  // Section boundaries, so each country/number pair gets the right disease
  const iChik   = text.search(/chikungunya cases were reported/i);
  const iZika   = text.search(/of\s+Zika\s+(?:have\s+been|were)\s+reported/i);
  const iSevere = text.search(/severe dengue cases were reported/i);

  function diseaseAt(offset){
    if(iZika > -1 && offset >= iZika) return 'Zika';
    if(iChik > -1 && offset >= iChik) return 'Chikungunya';
    // between the severe-dengue sentence and the chikungunya section, the
    // numbers are severe cases only — a different measure, so name it so
    if(iSevere > -1 && offset >= iSevere && (iChik === -1 || offset < iChik)){
      return 'Severe dengue';
    }
    return 'Dengue';
  }

  // Regional case fatality rates, used as a fallback since the bulletin
  // doesn't publish CFR per country
  const cfrMatches = [...text.matchAll(/([\d.]+)\s*%\s*case fatality rate/gi)].map(m => parseFloat(m[1]));
  const regionalCFR = { Dengue: cfrMatches[0] ?? null,
                        'Severe dengue': cfrMatches[0] ?? null,
                        Chikungunya: cfrMatches[1] ?? null,
                        Zika: cfrMatches[2] ?? null };

  const seen = new Set();      // first mention wins — the headline list comes
                               // before the severe-cases list further down
  const countries = {};
  const unmatched = [];

  for(const m of text.matchAll(ARBO_PAIR)){
    const rawName = m[1].trim().replace(/^(and|by|followed by|with)\s+/i, '');
    const cases   = parseInt(m[2].replace(/[,\.]/g, ''), 10);
    if(!Number.isFinite(cases)) continue;

    const iso = toISO(rawName);
    if(!iso){ unmatched.push(rawName); continue; }

    const disease = diseaseAt(m.index);
    const key = iso + '|' + disease;
    if(seen.has(key)) continue;
    seen.add(key);

    // PAHO publishes CFR for the region, not per country. Multiplying it by a
    // country's cases would produce an estimate, not a measurement — so deaths
    // stay null and the regional rate is reported as context in the source line.
    const regCFR = regionalCFR[disease];
    const deaths = null;

    (countries[iso] ||= { conf:'high', diseases:[] }).diseases.push({
      name: disease,
      cases,
      deaths,
      cfr: null,
      per100k: null,
      growth7d: null,
      severity: severityFor(disease, cases, null),
      asOf,
      source: `PAHO ARBO bulletin ${year} (PLISA), cumulative through EW ${week ?? '?'}`
            + (regCFR != null ? ` · regional CFR ${regCFR}%` : ''),
      url: `https://ais.paho.org/ha_viz/Arbo/Arbo_Bulletin_${year}.asp?env=pri`,
      provisional: true      // PAHO states these are preliminary and can move
    });
  }

  return {
    countries,
    matched: Object.keys(countries).length,
    asOf, year, week,
    unmatched: [...new Set(unmatched)].slice(0, 8)
  };
}
