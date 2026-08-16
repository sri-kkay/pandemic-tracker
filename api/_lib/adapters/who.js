/* ===========================================================================
   SOURCE: WHO DISEASE OUTBREAK NEWS
   The only agency source that is already a proper JSON API.
   =========================================================================== */

import { fetchWithTimeout, USER_AGENT } from '../http.js';
import { toISO, scanForCountries } from '../iso.js';
import { findCases, findDeaths, splitTitle } from '../text.js';
import { severityFor } from '../severity.js';

export async function fetchWHO(){
  const url = 'https://www.who.int/api/news/diseaseoutbreaknews'
            + '?$orderby=PublicationDateAndTime%20desc&$top=80';

  const r = await fetchWithTimeout(url, {
    headers: {
      'accept': 'application/json',
      // Identify yourself. It is polite and it stops you looking like a bot.
      'user-agent': USER_AGENT
    }
  });
  if(!r.ok) throw new Error('WHO returned ' + r.status);

  const body = await r.json();
  const items = Array.isArray(body) ? body : (body.value || []);

  const countries = {};
  const skipped = [];
  let rescued = 0;

  /* small helper so both paths write records the same way */
  function record(iso, disease, cases, deaths, date, item, viaText){
    const entry = {
      name: disease,
      cases: viaText ? null : cases,      // a shared total isn't this country's total
      deaths: viaText ? null : deaths,
      cfr: (!viaText && cases && deaths && cases > 20) ? +(deaths/cases*100).toFixed(1) : null,
      per100k: null,
      growth7d: null,
      severity: severityFor(disease, viaText ? null : cases, viaText ? null : deaths),
      asOf: date || null,
      source: viaText
        ? 'WHO Disease Outbreak News (named in a multi-country bulletin)'
        : 'WHO Disease Outbreak News',
      url: item.ItemDefaultUrl
        ? 'https://www.who.int' + item.ItemDefaultUrl
        : 'https://www.who.int/emergencies/disease-outbreak-news',
      provisional: true
    };

    if(!countries[iso]) countries[iso] = { conf:'medium', diseases:[] };
    const at = countries[iso].diseases.findIndex(d => d.name === entry.name);
    if(at === -1){ countries[iso].diseases.push(entry); return; }

    const old = countries[iso].diseases[at];
    // a country-specific bulletin always beats one that merely name-dropped it
    const betterSource = !viaText && old.source.includes('multi-country');
    if(betterSource || (entry.asOf||'') > (old.asOf||'')) countries[iso].diseases[at] = entry;
  }

  for(const item of items){
    const title = item.Title || '';
    const split = splitTitle(title);
    if(!split) continue;

    const text   = (item.Summary || '') + ' ' + title;
    const cases  = findCases(text);
    const deaths = findDeaths(text);
    const date   = String(item.PublicationDateAndTime || item.PublicationDate || '').slice(0,10);

    const iso = toISO(split.country);

    if(iso){
      record(iso, split.disease, cases, deaths, date, item, false);
      continue;
    }

    // No single country matched. Read the body and find every country named.
    // This catches "Dengue - Global situation" and also odd titles like
    // "Chikungunya - La Reunion and Mayotte" that name two places at once.
    const hits = scanForCountries(text);
    if(hits.length){
      hits.forEach(h => record(h, split.disease, null, null, date, item, true));
      rescued += hits.length;
    } else {
      skipped.push(split.country);
    }
  }

  return { countries, skipped, rescued, count: items.length };
}
