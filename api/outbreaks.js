/* ===========================================================================
   api/outbreaks.js  —  THE BACKEND SCRAPER
   ---------------------------------------------------------------------------
   Runs on Vercel's servers, not in the browser. That matters: browsers are
   blocked from calling WHO directly (CORS), servers are not.

   Visit /api/outbreaks in your browser to see what it produces.

   Vercel caches the response for 6 hours, so WHO gets hit a few times a day
   no matter how many people visit your site.
   =========================================================================== */

const CACHE_HOURS = 6;

/* ---------------------------------------------------------------------------
   1. COUNTRY NAMES → ISO CODES
   WHO writes "Democratic Republic of the Congo". The map needs "COD".
   Add a line here any time the log says a country was skipped.
   --------------------------------------------------------------------------- */

const ISO = {
  // Africa
  'algeria':'DZA','angola':'AGO','benin':'BEN','botswana':'BWA','burkina faso':'BFA',
  'burundi':'BDI','cabo verde':'CPV','cape verde':'CPV','cameroon':'CMR',
  'central african republic':'CAF','central africa republic':'CAF','car':'CAF','chad':'TCD','comoros':'COM',
  'democratic republic of the congo':'COD','democratic republic of congo':'COD',
  'dr congo':'COD','drc':'COD','the democratic republic of the congo':'COD',
  'congo':'COG','republic of the congo':'COG','congo-brazzaville':'COG',
  "cote d'ivoire":'CIV','côte d’ivoire':'CIV','ivory coast':'CIV',
  'djibouti':'DJI','egypt':'EGY','equatorial guinea':'GNQ','eritrea':'ERI',
  'eswatini':'SWZ','swaziland':'SWZ','ethiopia':'ETH','gabon':'GAB','gambia':'GMB',
  'the gambia':'GMB','ghana':'GHA','guinea':'GIN','guinea-bissau':'GNB','kenya':'KEN',
  'lesotho':'LSO','liberia':'LBR','libya':'LBY','madagascar':'MDG','malawi':'MWI',
  'mali':'MLI','mauritania':'MRT','mauritius':'MUS','morocco':'MAR','mozambique':'MOZ',
  'namibia':'NAM','niger':'NER','nigeria':'NGA','rwanda':'RWA','senegal':'SEN',
  'seychelles':'SYC','reunion':'REU','la reunion':'REU','mayotte':'MYT','sierra leone':'SLE','somalia':'SOM','south africa':'ZAF',
  'south sudan':'SSD','sudan':'SDN','togo':'TGO','tunisia':'TUN','uganda':'UGA',
  'united republic of tanzania':'TZA','tanzania':'TZA','zambia':'ZMB','zimbabwe':'ZWE',

  // Asia
  'afghanistan':'AFG','bangladesh':'BGD','bhutan':'BTN','brunei':'BRN',
  'cambodia':'KHM','china':'CHN','india':'IND','indonesia':'IDN',
  'iran':'IRN','iran (islamic republic of)':'IRN','iraq':'IRQ','israel':'ISR',
  'japan':'JPN','jordan':'JOR','kazakhstan':'KAZ','kuwait':'KWT','kyrgyzstan':'KGZ',
  'laos':'LAO',"lao people's democratic republic":'LAO','lebanon':'LBN',
  'malaysia':'MYS','maldives':'MDV','mongolia':'MNG','myanmar':'MMR','burma':'MMR',
  'nepal':'NPL','oman':'OMN','pakistan':'PAK','philippines':'PHL','qatar':'QAT',
  'saudi arabia':'SAU','kingdom of saudi arabia':'SAU','singapore':'SGP','south korea':'KOR','republic of korea':'KOR',
  'sri lanka':'LKA','syria':'SYR','syrian arab republic':'SYR','taiwan':'TWN',
  'tajikistan':'TJK','thailand':'THA','timor-leste':'TLS','east timor':'TLS',
  'turkey':'TUR','türkiye':'TUR','turkmenistan':'TKM','united arab emirates':'ARE',
  'uzbekistan':'UZB','viet nam':'VNM','vietnam':'VNM','yemen':'YEM',

  // Europe
  'albania':'ALB','austria':'AUT','belarus':'BLR','belgium':'BEL',
  'bosnia and herzegovina':'BIH','bulgaria':'BGR','croatia':'HRV','cyprus':'CYP',
  'czechia':'CZE','czech republic':'CZE','denmark':'DNK','estonia':'EST',
  'finland':'FIN','france':'FRA','georgia':'GEO','germany':'DEU','greece':'GRC',
  'hungary':'HUN','iceland':'ISL','ireland':'IRL','italy':'ITA','latvia':'LVA',
  'lithuania':'LTU','luxembourg':'LUX','malta':'MLT','moldova':'MDA',
  'montenegro':'MNE','netherlands':'NLD','north macedonia':'MKD','norway':'NOR',
  'poland':'POL','portugal':'PRT','romania':'ROU','russia':'RUS',
  'russian federation':'RUS','serbia':'SRB','slovakia':'SVK','slovenia':'SVN',
  'spain':'ESP','sweden':'SWE','switzerland':'CHE','ukraine':'UKR',
  'kosovo':'XKX','united kingdom':'GBR','united kingdom of great britain and northern ireland':'GBR',

  // Americas
  'argentina':'ARG','puerto rico':'PRI','french guiana':'GUF','martinique':'MTQ','guadeloupe':'GLP','bahamas':'BHS','barbados':'BRB','belize':'BLZ','bolivia':'BOL',
  'bolivia (plurinational state of)':'BOL','brazil':'BRA','canada':'CAN','chile':'CHL',
  'colombia':'COL','costa rica':'CRI','cuba':'CUB','dominican republic':'DOM',
  'ecuador':'ECU','el salvador':'SLV','guatemala':'GTM','guyana':'GUY','haiti':'HTI',
  'honduras':'HND','jamaica':'JAM','mexico':'MEX','nicaragua':'NIC','panama':'PAN',
  'paraguay':'PRY','peru':'PER','suriname':'SUR','trinidad and tobago':'TTO',
  'united states of america':'USA','united states':'USA','uruguay':'URY',
  'venezuela':'VEN','venezuela (bolivarian republic of)':'VEN',

  // Oceania
  'australia':'AUS','fiji':'FJI','new zealand':'NZL','papua new guinea':'PNG',
  'samoa':'WSM','solomon islands':'SLB','vanuatu':'VUT'
};

function toISO(name){
  if(!name) return null;
  const clean = String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')  // strip accents
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/\s+/g,' ')
    .trim();
  return ISO[clean] || null;
}

/* ---------------------------------------------------------------------------
   2. HOW SERIOUS IS THIS DISEASE, MINIMUM?
   Fixes the calibration problem: a confirmed Ebola cluster must never rank
   below a big dengue season just because dengue has more cases.
   These are floors — the computed index can go higher, never lower.
   --------------------------------------------------------------------------- */

const SEVERITY_FLOOR = [
  [/ebola|marburg|bundibugyo/i,        75],
  [/nipah|lassa|crimean-congo|mers|middle east respiratory/i,  60],
  [/anthrax|plague|diphtheria/i,       55],
  [/cholera|polio|yellow fever/i,      45],
  [/measles|mpox|monkeypox|rabies/i,   35],
  [/dengue|chikungunya|zika|malaria/i, 20],
  [/influenza|covid|respiratory/i,     15]
];

function floorFor(disease){
  for(const [re, v] of SEVERITY_FLOOR) if(re.test(disease)) return v;
  return 10;
}

/* Bumps the floor when the numbers are bad. Simple and explainable —
   you can defend every line of this in a presentation. */
function severityFor(disease, cases, deaths){
  let s = floorFor(disease);
  if(cases  != null && cases  > 100)   s += 5;
  if(cases  != null && cases  > 1000)  s += 5;
  if(cases  != null && cases  > 10000) s += 5;
  if(deaths != null && deaths > 10)    s += 5;
  if(deaths != null && deaths > 100)   s += 5;
  if(cases && deaths && cases > 20){
    const cfr = deaths / cases * 100;
    if(cfr > 5)  s += 5;
    if(cfr > 20) s += 5;
  }
  return Math.min(100, s);
}

/* ---------------------------------------------------------------------------
   3. PULLING NUMBERS OUT OF WHO'S SENTENCES
   WHO writes "a cumulative total of 2 124 confirmed cases" — note the SPACES
   inside the number. That's why we strip whitespace before parsing.
   --------------------------------------------------------------------------- */

function toNumber(s){
  const n = parseInt(String(s).replace(/[\s,\u00a0\u2009]/g,''), 10);
  return Number.isFinite(n) ? n : null;
}

function findCases(text){
  const m = text.match(
    /([0-9][0-9\s,\u00a0\u2009]{0,12})\s+(?:confirmed\s+|suspected\s+|probable\s+|total\s+|reported\s+|new\s+)*cases/i
  );
  return m ? toNumber(m[1]) : null;
}

function findDeaths(text){
  const m = text.match(
    /([0-9][0-9\s,\u00a0\u2009]{0,12})\s+(?:associated\s+|reported\s+|related\s+)*deaths/i
  );
  return m ? toNumber(m[1]) : null;
}

/* WHO titles follow a strict convention:  "Disease name – Country name"
   The separator is an EN DASH (–), not a hyphen (-). Some older items use a
   hyphen, so we accept both. */
function splitTitle(title){
  const parts = String(title).split(/\s+[\u2013\u2014-]\s+/);
  if(parts.length < 2) return null;
  return {
    disease: parts[0].trim(),
    country: parts[parts.length - 1].trim()
  };
}

/* ---------------------------------------------------------------------------
   3b. RESCUING THE "GLOBAL" AND "MULTI-COUNTRY" BULLETINS

   Some of WHO's most valuable bulletins are titled "Dengue - Global situation"
   or "Cholera - Multi-country". There's no single country in the title, so the
   normal path throws them away — but the TEXT lists dozens of countries.

   This reads the text and finds every country mentioned.

   Longest names are matched first and then blanked out, so "Papua New Guinea"
   is consumed before plain "Guinea" can grab it, and word boundaries stop
   "Mali" matching inside "Somalia" or "Oman" inside "Romania".
   --------------------------------------------------------------------------- */

const SCAN_NAMES = Object.keys(ISO)
  .filter(n => n.length >= 4)
  .sort((a,b) => b.length - a.length);

function normalise(s){
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\u2018\u2019]/g,"'");
}

function scanForCountries(text){
  let hay = ' ' + normalise(text) + ' ';
  const found = new Set();
  for(const name of SCAN_NAMES){
    const safe = normalise(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + safe + '\\b', 'ig');
    if(re.test(hay)){
      found.add(ISO[name]);
      hay = hay.replace(re, ' ');   // consume it so shorter names can't re-match
    }
  }
  return [...found];
}

/* Titles that mean "this is about many countries, read the body" */
const IS_MULTI = /global|multi-country|region|regional|afro|amro|searo|euro|wpro|emro/i;

/* ---------------------------------------------------------------------------
   4. SOURCE: WHO DISEASE OUTBREAK NEWS
   The only agency source that is already a proper JSON API.
   --------------------------------------------------------------------------- */

async function fetchWHO(){
  const url = 'https://www.who.int/api/news/diseaseoutbreaknews'
            + '?$orderby=PublicationDateAndTime%20desc&$top=80';

  const r = await fetch(url, {
    headers: {
      'accept': 'application/json',
      // Identify yourself. It is polite and it stops you looking like a bot.
      'user-agent': 'PandemicTracker/1.0 (student project; contact: YOUR_EMAIL_HERE)'
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

/* ---------------------------------------------------------------------------
   4b. SOURCE: ECDC ERVISS  (fills Europe)

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
   --------------------------------------------------------------------------- */

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

function parseCSV(text){
  const lines = text.trim().split('\n');
  const head  = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    head.forEach((h,i) => row[h] = (cells[i] || '').trim());
    return row;
  });
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

async function fetchERVISS(){
  const r = await fetch(ERVISS_URL);
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

/* ---------------------------------------------------------------------------
   4c. SOURCE: WHO FluNet  (fills the whole world)

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
   --------------------------------------------------------------------------- */

const FLUNET_BASE = 'https://xmart-api-public.who.int/FLUMART/VIW_FNT';

/* Proper CSV parsing — handles quoted fields containing commas, which
   country names like "Bolivia, Plurinational State of" will have. */
function parseCSVSafe(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuotes){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if(c === '"'){ inQuotes = true; }
    else if(c === ','){ row.push(field); field = ''; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if(c !== '\r'){ field += c; }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  if(!rows.length) return [];

  const head = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.length >= head.length - 1)
    .map(r => {
      const o = {};
      head.forEach((h,i) => o[h] = (r[i] ?? '').trim());
      return o;
    });
}

/* Find a column whose name matches one of several candidates, ignoring case
   and underscores. Returns the real column name, or null. */
function findColumn(row, candidates){
  const keys = Object.keys(row);
  const flat = k => k.toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const want of candidates){
    const w = flat(want);
    const hit = keys.find(k => flat(k) === w);
    if(hit) return hit;
  }
  for(const want of candidates){            // looser: contains
    const w = flat(want);
    const hit = keys.find(k => flat(k).includes(w));
    if(hit) return hit;
  }
  return null;
}

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

async function fetchFluNet(){
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
      const r = await fetch(url, {
        headers:{ 'user-agent':'PandemicTracker/1.0 (student project; contact: YOUR_EMAIL_HERE)' }
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

/* ---------------------------------------------------------------------------
   4d. SOURCE: PAHO ARBO BULLETIN  (dengue, chikungunya, Zika across the Americas)

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
   --------------------------------------------------------------------------- */

function stripTags(html){
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

/* "Brazil with 10,266,017 cases" — country name, then a number, then "cases" */
const ARBO_PAIR = /([A-Z][A-Za-z\u00C0-\u017F.'\-]*(?:\s+[A-Za-z\u00C0-\u017F.'\-]+){0,3})\s+with\s+([\d][\d,\.]*)\s+cases/g;

async function fetchPAHO(){
  const thisYear = new Date().getUTCFullYear();
  let html = null, year = null;

  for(const y of [thisYear, thisYear - 1]){
    try{
      const r = await fetch(`https://ais.paho.org/ha_viz/Arbo/Arbo_Bulletin_${y}.asp?env=pri`, {
        headers:{ 'user-agent':'PandemicTracker/1.0 (student project; contact: YOUR_EMAIL_HERE)' }
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

/* ---------------------------------------------------------------------------
   4e. SOURCE: AFRICA CDC  (fills Africa)

   Everyone assumes this one needs a PDF parser. It doesn't.

   africacdc.org runs on WordPress, and WordPress ships a JSON API by default.
   Their outbreak briefs are a custom post type called "disease-outbreak", so:

     https://africacdc.org/wp-json/wp/v2/disease-outbreak?per_page=20

   returns the briefs as JSON — title, date, link and full body text. If that
   endpoint is ever switched off, this falls back to scraping the HTML listing
   at https://africacdc.org/disease-outbreak/ and following each link.

   The briefs use a consistent format for country breakdowns:

     "Burundi (8 cases; 0 deaths), Cameroon (35; 2), CAR (213; 0),
      Congo (146; 1), DRC (13,791; 450), Ghana (4; 0), Nigeria (24; 0)"

   so "Country (cases; deaths)" is what we pull out. Note they abbreviate —
   CAR and DRC are in the ISO map above for exactly this reason.
   --------------------------------------------------------------------------- */

const ACDC_BASE = 'https://africacdc.org';

/* Diseases Africa CDC reports on. Used to read the disease out of a title. */
const DISEASE_WORDS = [
  'Bundibugyo','Ebola','Marburg','Lassa fever','Rift Valley fever','Hantavirus',
  'Mpox','Monkeypox','Cholera','Measles','Diphtheria','Meningitis','Yellow fever',
  'Polio','Poliomyelitis','Dengue','Chikungunya','Malaria','Anthrax','Rabies',
  'Hepatitis','Plague','Typhoid','Influenza','COVID-19','Chikungunya'
];

function diseaseFromText(...sources){
  for(const text of sources){
    if(!text) continue;
    for(const d of DISEASE_WORDS){
      if(new RegExp('\\b' + d.replace(/[-]/g,'\\-') + '\\b', 'i').test(text)){
        return d === 'Monkeypox' ? 'Mpox'
             : d === 'Poliomyelitis' ? 'Polio'
             : d === 'Bundibugyo' ? 'Ebola (Bundibugyo virus)'
             : d;
      }
    }
  }
  return null;
}

/* "Burundi (8 cases; 0 deaths)"  and  "Cameroon (35; 2)" */
/* The (?:\([A-Z]{2,6}\)\s*)? part handles their habit of writing the full
   name followed by an abbreviation before the numbers:
     "Democratic Republic of Congo (DRC) (277; 198)"                        */
const QUAL = '(?:confirmed|suspected|probable|reported|new|total|cumulative)';
const ACDC_PAIR = new RegExp(
  "([A-Z][A-Za-z\\u00C0-\\u017F.'\\-]*(?:\\s+[A-Za-z\\u00C0-\\u017F.'\\-]+){0,3})" +
  "\\s*(?:\\([A-Z]{2,6}\\)\\s*)?" +          // optional "(DRC)" between name and numbers
  "\\(\\s*([\\d][\\d,\\s]*?)\\s*(?:" + QUAL + "\\s+)*(?:cases?)?" +
  "\\s*;\\s*([\\d][\\d,\\s]*?)\\s*(?:" + QUAL + "\\s+)*(?:deaths?)?\\s*\\)",
  'g');

const toInt = s => {
  const n = parseInt(String(s).replace(/[,\s]/g,''), 10);
  return Number.isFinite(n) ? n : null;
};

async function fetchAfricaCDC(){
  const headers = { 'user-agent':'PandemicTracker/1.0 (student project; contact: YOUR_EMAIL_HERE)' };
  let posts = [];
  let via = 'wp-json';

  // ---- Preferred path: the WordPress JSON API
  try{
    const r = await fetch(
      `${ACDC_BASE}/wp-json/wp/v2/disease-outbreak?per_page=20&orderby=date&order=desc`,
      { headers });
    if(r.ok){
      const j = await r.json();
      if(Array.isArray(j) && j.length){
        posts = j.map(p => ({
          title: stripTags(p.title?.rendered || ''),
          body:  stripTags(p.content?.rendered || p.excerpt?.rendered || ''),
          date:  String(p.date || '').slice(0,10),
          link:  p.link || `${ACDC_BASE}/disease-outbreak/`
        }));
      }
    }
  }catch(e){ /* fall through */ }

  // ---- Fallback: scrape the listing page, then each brief
  if(!posts.length){
    via = 'html';
    const r = await fetch(`${ACDC_BASE}/disease-outbreak/`, { headers });
    if(!r.ok) throw new Error('listing page returned ' + r.status);
    const html = await r.text();

    const links = [...new Set(
      [...html.matchAll(/href="(https:\/\/africacdc\.org\/disease-outbreak\/[^"#?]+)"/g)]
        .map(m => m[1])
        .filter(u => u.replace(`${ACDC_BASE}/disease-outbreak/`,'').length > 1)
    )].slice(0, 8);

    if(!links.length) throw new Error('no brief links found on the listing page');

    for(const link of links){
      try{
        const p = await fetch(link, { headers });
        if(!p.ok) continue;
        const pageHtml = await p.text();
        const titleMatch = pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const dateMatch  = pageHtml.match(/(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/);
        posts.push({
          title: titleMatch ? stripTags(titleMatch[1]) : '',
          body:  stripTags(pageHtml),
          date:  dateMatch ? new Date(dateMatch[1] + ' UTC').toISOString().slice(0,10) : null,
          link
        });
      }catch(e){ /* skip this brief */ }
    }
  }

  if(!posts.length) throw new Error('no outbreak briefs retrieved');

  // ---- Parse country breakdowns out of each brief
  const countries = {};
  const unmatched = [];
  let parsedBriefs = 0;

  // newest first, so the first figure we record for a country is the freshest
  posts.sort((a,b) => (b.date || '').localeCompare(a.date || ''));

  for(const post of posts){
    const disease = diseaseFromText(post.title, post.body.slice(0, 1200));
    if(!disease) continue;

    let hits = 0;
    const seenHere = new Set();

    for(const m of post.body.matchAll(ACDC_PAIR)){
      const rawName = m[1].trim().replace(/^(and|from|in|by)\s+/i, '');
      const cases   = toInt(m[2]);
      const deaths  = toInt(m[3]);
      if(cases == null || deaths == null) continue;

      const iso = toISO(rawName);
      if(!iso){ if(rawName.length > 2) unmatched.push(rawName); continue; }
      if(seenHere.has(iso)) continue;
      seenHere.add(iso);
      hits++;

      const rec = (countries[iso] ||= { conf:'medium', diseases:[] });
      // a newer brief already covered this disease for this country
      if(rec.diseases.some(d => d.name === disease)) continue;

      rec.diseases.push({
        name: disease,
        cases,
        deaths,
        cfr: (cases > 20) ? +(deaths / cases * 100).toFixed(1) : null,
        per100k: null,
        growth7d: null,
        severity: severityFor(disease, cases, deaths),
        asOf: post.date,
        source: `Africa CDC outbreak brief — ${post.title.slice(0, 70)}`,
        url: post.link,
        provisional: true
      });
    }
    if(hits) parsedBriefs++;
  }

  return {
    countries,
    matched: Object.keys(countries).length,
    briefs: posts.length,
    parsedBriefs,
    via,
    unmatched: [...new Set(unmatched)].slice(0, 8)
  };
}

/* ---------------------------------------------------------------------------
   5. BASELINE
   Things the scraper cannot get yet, so the map is never empty. Delete a line
   here as soon as a real source starts supplying it.
   --------------------------------------------------------------------------- */

const BASELINE = {
  ZAF: { conf:'high', diseases:[
    { name:'Measles', cases:null, deaths:null, severity:30, asOf:null,
      source:'NICD weekly situation report — adapter not built yet',
      url:'https://www.nicd.ac.za/', provisional:true }
  ]}
};

const GUIDANCE = {
  'Dengue':{
    treatments:['No specific antiviral. Paracetamol for fever.','<strong>Avoid ibuprofen and aspirin</strong> — they raise bleeding risk.','Qdenga vaccine is available in some countries.'],
    travel:['Risk peaks in the rainy season across the Americas and South-East Asia.','Brazil has all four serotypes circulating at once.'],
    avoid:['Standing water near where you sleep.','Being outdoors unprotected at dawn and dusk.'],
    prevention:['Repellent with DEET or picaridin.','Window screens and treated bed nets.']
  },
  'Measles':{
    treatments:['No antiviral. Vitamin A reduces mortality in children.'],
    travel:['Confirm two MMR doses 6–8 weeks before departure.'],
    avoid:['Crowded indoor spaces during an outbreak — the virus stays airborne for two hours.'],
    prevention:['Two-dose MMR is about 97% effective.','Isolate cases for four days after rash onset.']
  },
  'Cholera':{
    treatments:['Oral rehydration salts resolve most cases.','IV fluids for severe dehydration.'],
    travel:['Oral cholera vaccine for travel to active transmission areas.'],
    avoid:['Untreated water, ice, and raw shellfish.'],
    prevention:['Boil it, cook it, peel it, or leave it.','Handwash with soap.']
  },
  _default:{
    treatments:['No guidance loaded for this disease yet.'],
    travel:['Check CDC travel notices and WHO regional advisories.'],
    avoid:['No advisory loaded.'],
    prevention:['No guidance loaded.']
  }
};

/* ---------------------------------------------------------------------------
   6. THE HANDLER — this is what runs when the globe calls /api/outbreaks
   --------------------------------------------------------------------------- */

export default async function handler(req, res){
  // Tell Vercel's CDN to cache this. WHO gets hit ~4 times a day total.
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${CACHE_HOURS*3600}, stale-while-revalidate=86400`
  );

  const notes = [];
  let countries = {};

  try{
    const who = await fetchWHO();
    countries = who.countries;
    notes.push(`WHO: read ${who.count} bulletins, matched ${Object.keys(who.countries).length} countries (${who.rescued} from multi-country bulletins)`);
    if(who.skipped.length){
      notes.push(`Not a single country, ignored: ${[...new Set(who.skipped)].join(', ')}`);
    }
  }catch(err){
    notes.push('WHO fetch failed: ' + err.message);
  }

  try{
    const eu = await fetchERVISS();
    for(const [iso, rec] of Object.entries(eu.countries)){
      if(!countries[iso]) countries[iso] = { conf:'high', diseases:[] };
      countries[iso].diseases.push(...rec.diseases);
    }
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
  }catch(err){
    notes.push('ERVISS fetch failed: ' + err.message);
  }

  try{
    const flu = await fetchFluNet();
    for(const [iso, rec] of Object.entries(flu.countries)){
      if(!countries[iso]) countries[iso] = { conf:'high', diseases:[] };
      countries[iso].diseases.push(...rec.diseases);
    }
    notes.push(`FluNet: matched ${flu.matched} countries, newest week ${flu.newestWeek}`);
    notes.push(`FluNet columns detected: ${JSON.stringify(flu.columns)}`);
  }catch(err){
    notes.push('FluNet fetch failed: ' + err.message
      + ' | test it yourself: https://xmart-api-public.who.int/FLUMART/VIW_FNT?$format=csv&$top=5'
      + ' | column list: https://xmart-api-public.who.int/FLUMART/VIW_FLU_METADATA?$format=csv');
  }

  try{
    const paho = await fetchPAHO();
    for(const [iso, rec] of Object.entries(paho.countries)){
      if(!countries[iso]) countries[iso] = { conf:'high', diseases:[] };
      countries[iso].diseases.push(...rec.diseases);
    }
    notes.push(`PAHO ARBO: matched ${paho.matched} countries in the Americas, `
      + `bulletin ${paho.year} through EW ${paho.week ?? '?'} (${paho.asOf})`);
    if(paho.unmatched.length){
      notes.push(`PAHO names not in the ISO map: ${paho.unmatched.join(', ')}`);
    }
  }catch(err){
    notes.push('PAHO fetch failed: ' + err.message
      + ' | test it yourself: https://ais.paho.org/ha_viz/Arbo/Arbo_Bulletin_'
      + new Date().getUTCFullYear() + '.asp?env=pri');
  }

  try{
    const acdc = await fetchAfricaCDC();
    for(const [iso, rec] of Object.entries(acdc.countries)){
      if(!countries[iso]) countries[iso] = { conf:'medium', diseases:[] };
      countries[iso].diseases.push(...rec.diseases);
    }
    notes.push(`Africa CDC: matched ${acdc.matched} countries from `
      + `${acdc.parsedBriefs}/${acdc.briefs} briefs (via ${acdc.via})`);
    if(acdc.unmatched.length){
      notes.push(`Africa CDC names not in the ISO map: ${acdc.unmatched.join(', ')}`);
    }
  }catch(err){
    notes.push('Africa CDC fetch failed: ' + err.message
      + ' | test it yourself: https://africacdc.org/wp-json/wp/v2/disease-outbreak?per_page=3');
  }

  // merge the baseline in without overwriting anything live
  for(const [iso, rec] of Object.entries(BASELINE)){
    if(!countries[iso]) countries[iso] = rec;
  }

  res.status(200).json({
    updated: new Date().toISOString(),
    countries,
    admin1: {},
    cities: {},
    guidance: GUIDANCE,
    _notes: notes          // open /api/outbreaks and read this to debug
  });
}
