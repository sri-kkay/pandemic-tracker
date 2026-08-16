/* ===========================================================================
   SOURCE: US CDC — STATE LEVEL  (fills the admin1 layer for the USA)

   Everything above this point is national. Hover a US state and you get
   nothing, because the 538 figure is a country total from FluNet and no
   source was writing to the `admin1` layer at all.

   CDC publishes respiratory illness activity per state weekly through
   Socrata, which is a plain JSON API:

     https://data.cdc.gov/resource/f3zz-zga5.json

   Dataset: "Level of Acute Respiratory Illness (ARI) Activity by State",
   updated Fridays. Open that URL in a browser to see the real column names.

   IMPORTANT — the key format. The globe joins subnational records on
   "ISO3:Name" where Name must match Natural Earth's `properties.name`
   exactly. For US states that's the plain English name: "USA:California",
   "USA:Texas". Get this wrong and the state silently never colours.

   Column names couldn't be verified before shipping, so this sniffs for them
   the same way the FluNet adapter does and reports what it found.
   =========================================================================== */

import { fetchWithTimeout, USER_AGENT } from '../http.js';
import { findColumn } from '../text.js';

const CDC_STATE_URL = 'https://data.cdc.gov/resource/f3zz-zga5.json';

/* CDC reports a category, not a count. These map onto the 0-100 index. */
const ARI_LEVEL_SEVERITY = {
  'minimal':6, 'very low':6, 'low':16, 'moderate':30, 'high':44, 'very high':56
};

/* Places in the feed that aren't states, or that Natural Earth names
   differently. NYC is reported separately by CDC but is inside New York. */
const CDC_SKIP = new Set([
  'united states','national','nationwide','us','usa',
  'new york city','virgin islands','guam','american samoa',
  'puerto rico',   // Natural Earth carries PR as its own country feature,
                   // not as a US admin1 polygon, so it would never colour
  'northern mariana islands','commonwealth of the northern mariana islands'
]);

export async function fetchCDCStates(){
  const attempts = [
    `${CDC_STATE_URL}?$limit=800&$order=week_end_date%20DESC`,
    `${CDC_STATE_URL}?$limit=800&$order=week_ending_date%20DESC`,
    `${CDC_STATE_URL}?$limit=3000`
  ];

  let rows = null, lastErr = null;
  for(const url of attempts){
    try{
      const r = await fetchWithTimeout(url, {
        headers:{ 'user-agent': USER_AGENT }
      });
      if(!r.ok){ lastErr = 'HTTP ' + r.status; continue; }
      const j = await r.json();
      if(Array.isArray(j) && j.length){ rows = j; break; }
      lastErr = 'no rows';
    }catch(e){ lastErr = e.message; }
  }
  if(!rows) throw new Error('all query attempts failed (' + lastErr + ')');

  const sample = rows[0];
  const col = {
    date:  findColumn(sample, ['week_end_date','week_ending_date','weekendingdate','weekend','date']),
    place: findColumn(sample, ['geography','jurisdiction','state','location','geo_name','statename']),
    level: findColumn(sample, ['activity_level','ari_activity_level','level','activity','category'])
  };
  if(!col.place || !col.level){
    throw new Error('columns not recognised. Saw: ' + Object.keys(sample).slice(0,20).join(', '));
  }

  // Most recent week present in the response
  let newest = '';
  if(col.date) for(const r of rows){
    const d = String(r[col.date] || '').slice(0,10);
    if(d > newest) newest = d;
  }

  const admin1 = {};
  const unmatched = [];

  for(const row of rows){
    if(col.date && String(row[col.date] || '').slice(0,10) !== newest) continue;

    const rawPlace = String(row[col.place] || '').trim();
    if(!rawPlace || CDC_SKIP.has(rawPlace.toLowerCase())) continue;

    const levelRaw = String(row[col.level] || '').trim().toLowerCase();
    const severity = ARI_LEVEL_SEVERITY[levelRaw];
    if(severity == null){ unmatched.push(levelRaw || '(blank)'); continue; }

    // "ISO3:Name" — Name must match Natural Earth's properties.name
    const key = 'USA:' + rawPlace;
    if(admin1[key]) continue;

    admin1[key] = {
      conf:'high',
      diseases:[{
        name:'Acute respiratory illness',
        cases:null,                    // CDC publishes a category, not a count
        deaths:null,
        cfr:null,
        per100k:null,
        growth7d:null,
        severity,
        asOf: newest || null,
        source:`US CDC — ED visit activity level: ${levelRaw}`,
        url:'https://data.cdc.gov/Public-Health-Surveillance/Level-of-Acute-Respiratory-Illness-ARI-Activity-by/f3zz-zga5',
        provisional:false,
        routine:true
      }]
    };
  }

  return {
    admin1,
    matched: Object.keys(admin1).length,
    newest,
    columns: col,
    unmatchedLevels: [...new Set(unmatched)].slice(0,6)
  };
}
