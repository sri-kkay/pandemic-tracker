/* ===========================================================================
   api/outbreaks.js  —  THE BACKEND SCRAPER
   ---------------------------------------------------------------------------
   Runs on Vercel's servers, not in the browser. That matters: browsers are
   blocked from calling WHO directly (CORS), servers are not.

   Visit /api/outbreaks in your browser to see what it produces.

   Sources, in the order they run:
     §4  WHO Disease Outbreak News      global, event-driven
     §4b ERVISS (ECDC)                  Europe, weekly respiratory surveillance
     §4c WHO FluNet                     global influenza laboratory data
     §4d PAHO arbovirus bulletin        the Americas
     §4e Africa CDC outbreak briefs     Africa
     §4f US CDC FluView                 US states
     §4g NICD                           South African provinces
     §4h US CDC travel health notices   global — this is what reaches Asia,
                                        the Middle East and the Pacific
     §4i ReliefWeb (UN OCHA)            global — reaches the countries whose
                                        own reporting has broken down
     §4j WHO EMRO outbreak table        the Eastern Mediterranean, when EMRO
                                        publishes it (see the note in §4j)
     §4k EMRO country weekly sitreps    Afghanistan, read out of the weekly
                                        PDF the country office publishes
     §4l WHO AFRO weekly bulletin       all 47 African Region countries
     §4m the press wire                 an open web search, allowlisted,
                                        corroborated, and never numeric

   The last two are advisory sources: they say an outbreak exists without
   giving case counts, so they run last and only fill gaps a counting source
   has left empty.

   Vercel caches the response for 6 hours, so WHO gets hit a few times a day
   no matter how many people visit your site.
   =========================================================================== */

import { buildGuidance, collectDiseaseNames } from './_guidance.js';

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
  'south sudan':'SDS','sudan':'SDN','togo':'TGO','tunisia':'TUN','uganda':'UGA',
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
  'kosovo':'KOS','united kingdom':'GBR','united kingdom of great britain and northern ireland':'GBR',

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
  'samoa':'WSM','solomon islands':'SLB','vanuatu':'VUT',

  /* ---- countries that could not match before ----------------------------
     These were missing entirely, so any bulletin naming them was thrown away.
     Note the codes: the globe resolves a country by Natural Earth's ADM0_A3,
     which is NOT always the ISO 3166 code. Kosovo draws as KOS, Palestine as
     PSX, Western Sahara as SAH. Use the code the basemap uses or the country
     stays hatched no matter how much data you feed it. */
  'armenia':'ARM','azerbaijan':'AZE','bahrain':'BHR',
  // spellings the EMRO table uses
  'islamic republic of iran':'IRN','saudi arabia, kingdom of':'SAU',
  'northwest syria':'SYR','north-west syria':'SYR','northeast syria':'SYR',
  'opt':'PSX','the occupied palestinian territory':'PSX',
  'north korea':'PRK',"democratic people's republic of korea":'PRK','dpr korea':'PRK',
  'palestine':'PSX','state of palestine':'PSX','occupied palestinian territory':'PSX',
  'west bank':'PSX','gaza':'PSX','gaza strip':'PSX',
  'greenland':'GRL','western sahara':'SAH','new caledonia':'NCL',
  'somaliland':'SOL','northern cyprus':'CYN','falkland islands':'FLK',
  'sao tome and principe':'STP','são tomé and príncipe':'STP',
  'monaco':'MCO','andorra':'AND','san marino':'SMR','liechtenstein':'LIE',

  /* ---- small states the 110m basemap does not draw ----------------------
     A record here shows up in the report list and the dossier, and clicking it
     selects the country without moving the camera. That is deliberate: a
     dengue outbreak in Vanuatu or the Marshall Islands is worth reporting even
     when the island is too small to paint at this scale. Swap in the 50m
     Natural Earth file if you want the polygons too. */
  'marshall islands':'MHL','micronesia':'FSM','federated states of micronesia':'FSM',
  'palau':'PLW','nauru':'NRU','kiribati':'KIR','tuvalu':'TUV','tonga':'TON',
  'cook islands':'COK','french polynesia':'PYF','american samoa':'ASM','guam':'GUM',
  'northern mariana islands':'MNP','niue':'NIU','tokelau':'TKL',
  'wallis and futuna':'WLF','norfolk island':'NFK',
  'antigua and barbuda':'ATG','dominica':'DMA','grenada':'GRD','saint lucia':'LCA',
  'saint vincent and the grenadines':'VCT','saint kitts and nevis':'KNA',
  'aruba':'ABW','curacao':'CUW','curaçao':'CUW','bermuda':'BMU',
  'cayman islands':'CYM','turks and caicos islands':'TCA',
  'british virgin islands':'VGB','us virgin islands':'VIR','saint martin':'MAF',
  'sint maarten':'SXM','anguilla':'AIA','montserrat':'MSR',
  'hong kong':'HKG','macao':'MAC','macau':'MAC'
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

/* One user agent for the whole file. Put a real address in it before you
   demo this: several of these agencies ask for one, and it is how they tell a
   student project apart from a scraper worth blocking. */
const UA = 'PandemicTracker/2.0 (student project; contact: YOUR_EMAIL_HERE)';

/* ---------------------------------------------------------------------------
   3c. MERGING ADVISORY SOURCES WITHOUT CREATING DUPLICATES

   A travel notice and a WHO bulletin can describe the same outbreak. The
   bulletin has numbers, the notice does not, so the bulletin has to win. These
   two helpers implement that: compare disease names loosely enough that
   "Monkeypox" and "Mpox" are one disease, then only add if nothing is there.
   --------------------------------------------------------------------------- */

const DISEASE_ALIAS = {
  'monkeypox':'mpox', 'covid 19':'covid', 'coronavirus':'covid',
  'poliomyelitis':'polio', 'acute watery diarrhoea':'cholera'
};

function diseaseKey(name){
  const n = String(name).toLowerCase()
    .replace(/\(.*?\)/g, ' ')                     // drop "(Bundibugyo virus)"
    .replace(/\b(virus|viral)\s+(disease|infection|fever)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return DISEASE_ALIAS[n] || n;
}

/** Add a record only if that country has no report of the same disease yet.
 *  Returns true if it was added. */
function addIfNew(countries, iso, entry, conf){
  if(!iso || !entry || !entry.name) return false;
  if(!countries[iso]) countries[iso] = { conf, diseases: [] };
  const key = diseaseKey(entry.name);
  if(countries[iso].diseases.some(d => diseaseKey(d.name) === key)) return false;
  countries[iso].diseases.push(entry);
  return true;
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
   4f. SOURCE: US CDC — STATE LEVEL  (fills the admin1 layer for the USA)

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
   --------------------------------------------------------------------------- */

/* ILINet jurisdiction names that are not US states. New York City is folded
   into New York State; the rest get their own country record. */
const US_TERRITORY = {
  'puerto rico':'PRI', 'virgin islands':'VIR', 'u.s. virgin islands':'VIR',
  'guam':'GUM', 'american samoa':'ASM',
  'commonwealth of the northern mariana islands':'MNP', 'northern mariana islands':'MNP'
};

const CDC_STATE_URL = 'https://data.cdc.gov/resource/f3zz-zga5.json';

/* CDC reports a category, not a count. These map onto the 0-100 index. */
const ARI_LEVEL_SEVERITY = {
  'minimal':6, 'very low':6, 'low':16, 'moderate':30, 'high':44, 'very high':56
};

/* Places in the feed that aren't states, or that Natural Earth names
   differently. NYC is reported separately by CDC but is inside New York. */
/* Rows that are not a place this map can draw at all. The territories used to
   be listed here too — Natural Earth carries them as their own country
   features rather than US admin1 polygons, so as "USA:Puerto Rico" they could
   never colour. They are no longer skipped: US_TERRITORY routes them to their
   own country records instead, which is where they belong. */
const CDC_SKIP = new Set([
  'united states','national','nationwide','us','usa','new york city'
]);

async function fetchCDCStates(){
  const attempts = [
    `${CDC_STATE_URL}?$limit=800&$order=week_end_date%20DESC`,
    `${CDC_STATE_URL}?$limit=800&$order=week_ending_date%20DESC`,
    `${CDC_STATE_URL}?$limit=3000`
  ];

  let rows = null, lastErr = null;
  for(const url of attempts){
    try{
      const r = await fetch(url, {
        headers:{ 'user-agent':'PandemicTracker/1.0 (student project; contact: YOUR_EMAIL_HERE)' }
      });
      if(!r.ok){ lastErr = 'HTTP ' + r.status; continue; }
      const j = await r.json();
      if(Array.isArray(j) && j.length){ rows = j; break; }
      lastErr = 'no rows';
    }catch(e){ lastErr = e.message; }
  }
  if(!rows) throw new Error('all query attempts failed (' + lastErr + ')');

  /* Socrata omits null fields ROW BY ROW in its JSON output, so the first row
     is not a reliable list of the dataset's columns — a row that happens to
     have no activity level simply has no activity_level key. Reading columns
     off rows[0] is what made this adapter fail with "Saw: week_end, geography,
     label, buildnumber". Union the keys across a chunk of rows instead. */
  const SCAN = Math.min(rows.length, 400);
  const sample = {};
  for(const row of rows.slice(0, SCAN)){
    for(const k of Object.keys(row)) if(!(k in sample)) sample[k] = row[k];
  }

  const col = {
    date:  findColumn(sample, ['week_end_date','week_ending_date','weekendingdate','week_end','weekend','date']),
    place: findColumn(sample, ['geography','jurisdiction','state','location','geo_name','statename']),
    /* The dataset is "Level of Acute Respiratory Illness (ARI) Activity by
       State" (f3zz-zga5). Its columns are week_end, geography, label and
       buildnumber — the ARI level lives in `label`, not in anything called
       activity_level. That is why this adapter has been failing: it was
       looking for a column name the dataset does not use. */
    level: findColumn(sample, ['activity_level','ari_activity_level','level','activity','category','label'])
  };
  if(!col.place || !col.level){
    throw new Error('columns not recognised across ' + SCAN + ' rows. Saw: '
      + Object.keys(sample).slice(0, 30).join(', '));
  }

  // Most recent week present in the response
  let newest = '';
  if(col.date) for(const r of rows){
    const d = String(r[col.date] || '').slice(0,10);
    if(d > newest) newest = d;
  }

  const admin1 = {};
  const territories = {};
  const unmatched = [];

  for(const row of rows){
    if(col.date && String(row[col.date] || '').slice(0,10) !== newest) continue;

    const rawPlace = String(row[col.place] || '').trim();
    if(!rawPlace || CDC_SKIP.has(rawPlace.toLowerCase())) continue;

    const levelRaw = String(row[col.level] || '').trim().toLowerCase();
    const severity = ARI_LEVEL_SEVERITY[levelRaw];
    if(severity == null){ unmatched.push(levelRaw || '(blank)'); continue; }

    // "ISO3:Name" — Name must match Natural Earth's properties.name
    /* ILINet reports Puerto Rico, the US Virgin Islands and Guam as
       jurisdictions alongside the 50 states. Written as "USA:Puerto Rico"
       they land in an admin1 key that does not exist — admin1.json holds 50
       states and DC — so the data was being discarded silently while Puerto
       Rico sat hatched on the globe with its own country polygon. Route the
       territories to their own country records instead. */
    const territory = US_TERRITORY[rawPlace.toLowerCase()];
    if(territory){
      if(territories[territory]) continue;              // first row for it wins
      territories[territory] = { conf:'high', diseases:[] };
      territories[territory].diseases.push({
        name: 'Acute respiratory illness',
        cases: null, deaths: null, cfr: null, per100k: null, growth7d: null,
        severity,
        asOf: newest,
        source: 'US CDC NSSP — emergency department visits for respiratory illness',
        url: 'https://data.cdc.gov/Public-Health-Surveillance/Level-of-Acute-Respiratory-Illness-ARI-Activity-by/f3zz-zga5',
        routine: true
      });
      continue;
    }

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

  /* If the column we picked holds something other than activity levels, say so
     with examples rather than returning an empty result and no explanation. */
  if(!Object.keys(admin1).length && unmatched.length){
    throw new Error(`column "${col.level}" does not hold activity levels. Saw: `
      + [...new Set(unmatched)].slice(0, 6).join(', '));
  }

  return {
    admin1,
    territories,
    matched: Object.keys(admin1).length,
    newest,
    columns: col,
    unmatchedLevels: [...new Set(unmatched)].slice(0,6)
  };
}

/* ---------------------------------------------------------------------------
   4g. SOURCE: NICD  (South Africa, province level)

   The National Institute for Communicable Diseases publishes a weekly
   measles and rubella situation report. Like Africa CDC, nicd.ac.za runs on
   WordPress, so the reports come back as JSON:

     https://www.nicd.ac.za/wp-json/wp/v2/posts?search=measles%20rubella

   The province breakdowns follow a stable sentence pattern:

     "The Free State reported the highest number of new cases (132), followed
      by Western Cape (58), Gauteng (46), Northern Cape (44), Limpopo (36),
      Mpumalanga (28), Eastern Cape (20), KwaZulu-Natal (6), North West (4)"

   Only the nine real province names are searched for, so stray numbers in
   parentheses elsewhere in the text can't be mistaken for a province.

   These names already match the boundary file exactly, so they join straight
   onto the map with no aliasing.
   --------------------------------------------------------------------------- */

const ZA_PROVINCES = [
  'Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo',
  'Mpumalanga','North West','Northern Cape','Western Cape'
];

/* NICD writes the leading province differently from the rest:

     "The Free State reported the highest number of new cases (132),
      followed by Western Cape (58), Gauteng (46)"

   so the pattern allows a short run of words between the name and its number.
   Capped at 80 characters with no "(" in between, which keeps it from
   reaching across into a neighbouring province's figure. */
function zaProvinceRegex(name){
  const loose = name.replace(/[\s\-]+/g, '[\\s\\-]+');
  return new RegExp(loose + '(?:\\s+Province)?[^(]{0,80}?\\(\\s*(\\d[\\d,]*)\\s*\\)', 'i');
}

/* Find the sentence that actually carries the province breakdown, so the
   disease and the reporting period are read from the right context rather
   than from anywhere in a long report that mentions both diseases. */
function bestProvinceSentence(body){
  const sentences = body.split(/(?<=[.!?])\s+/);
  let best = null, bestCount = 0;
  for(const sen of sentences){
    let n = 0;
    for(const prov of ZA_PROVINCES) if(zaProvinceRegex(prov).test(sen)) n++;
    if(n > bestCount){ bestCount = n; best = sen; }
  }
  return { sentence: best, count: bestCount };
}

async function fetchNICD(){
  const headers = { 'user-agent':'PandemicTracker/1.0 (student project; contact: YOUR_EMAIL_HERE)' };

  const r = await fetch(
    `https://www.nicd.ac.za/wp-json/wp/v2/posts?search=measles%20rubella%20situation%20report`
    + `&per_page=10&orderby=date&order=desc`, { headers });
  if(!r.ok) throw new Error('NICD returned ' + r.status);

  const posts = await r.json();
  if(!Array.isArray(posts) || !posts.length) throw new Error('no situation reports returned');

  const admin1 = {};
  let used = null;

  for(const post of posts){
    const title = stripTags(post.title?.rendered || '');
    const body  = stripTags(post.content?.rendered || '');
    if(!/situation report/i.test(title)) continue;

    const { sentence, count } = bestProvinceSentence(body);
    if(!sentence || count < 3) continue;

    // Read the disease from the breakdown sentence and the text just before
    // it — these reports cover measles AND rubella, so the title can't decide.
    const idx = body.indexOf(sentence);
    const context = body.slice(Math.max(0, idx - 400), idx + sentence.length);
    const disease = /rubella/i.test(context) && !/measles/i.test(context)
      ? 'Rubella'
      : (/rubella/i.test(context) && context.lastIndexOf('rubella') > context.lastIndexOf('measles')
          ? 'Rubella' : 'Measles');

    // "new cases" means this week only; otherwise it's the running annual total
    const isNew = /new cases/i.test(sentence);
    const scope = isNew ? 'new cases in the latest week' : 'cumulative this year';

    const natMatch = context.match(/([\d,]+)\s+laboratory-confirmed\s+(?:measles|rubella)\s+cases/i);
    const nationalTotal = natMatch ? toInt(natMatch[1]) : null;

    let found = 0;
    for(const prov of ZA_PROVINCES){
      const m = sentence.match(zaProvinceRegex(prov));
      if(!m) continue;
      const cases = toInt(m[1]);
      if(cases == null) continue;
      found++;

      admin1['ZAF:' + prov] = {
        conf:'high',
        pop:1,
        diseases:[{
          name: disease,
          cases,
          deaths:null,
          cfr:null,
          per100k:null,
          growth7d:null,
          severity: severityFor(disease, cases, null),
          asOf: String(post.date || '').slice(0,10),
          source:`NICD weekly situation report — ${disease}, ${scope}`,
          url: post.link || 'https://www.nicd.ac.za/',
          provisional:false
        }]
      };
    }

    used = { title, date:String(post.date || '').slice(0,10), scope, disease,
             provinces:found, nationalTotal };
    break;
  }

  if(!used) throw new Error('no province breakdown found in the last 10 posts');
  return { admin1, matched:Object.keys(admin1).length, used,
           disease:used.disease, nationalTotal:used.nationalTotal };
}

/* ---------------------------------------------------------------------------
   4h. SOURCE: US CDC TRAVEL HEALTH NOTICES

   This is the adapter that fills in Asia and the Pacific.

   The other regional feeds each cover one WHO region — ERVISS Europe, PAHO the
   Americas, Africa CDC Africa — which left 62 countries and roughly 4.8 billion
   people reachable only when WHO happens to publish a bulletin about them. CDC
   posts travel notices for outbreaks anywhere in the world, in a plain RSS feed,
   and the titles are already structured:

       Level 2 - Chikungunya in Sri Lanka
       Level 1 - Rocky Mountain Spotted Fever in Mexico
       Level 2 - Clade II Monkeypox in Ghana and Liberia
       Level 1 - Global Dengue

   It is US federal work, so there is no licence to worry about and no key.

   What it does NOT give you is case counts. A notice says "there is an outbreak
   of X in Y", not how big it is, so every record here carries cases: null and
   the globe shows "no count" rather than inventing a number. The severity comes
   from the disease floor plus the CDC notice level, which is exactly what the
   notice actually tells you.
   --------------------------------------------------------------------------- */

const CDC_NOTICES_RSS = 'https://wwwnc.cdc.gov/travel/rss/notices.xml';

/* Minimal RSS reader. The feed is small and well-formed, and pulling in an XML
   parser for four tags would be silly. */
function parseRSS(xml){
  const items = [];
  const blocks = String(xml).match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for(const block of blocks){
    const pick = tag => {
      const m = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
      if(!m) return '';
      return m[1]
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    items.push({ title: pick('title'), link: pick('link'),
                 date: pick('pubDate'), description: pick('description') });
  }
  return items;
}

function rssDate(s){
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

/* Boilerplate CDC uses in level 3 and 4 titles, where the disease is not in the
   title at all and has to come out of the description. */
const CDC_BOILERPLATE = /^(avoid all travel|avoid nonessential travel|reconsider nonessential travel|practice enhanced precautions|practice usual precautions|global measles|updated)\b/i;

function parseNoticeTitle(title){
  const m = String(title).match(/^\s*Level\s*([1-4])\s*[-\u2013\u2014:]\s*(.+)$/i);
  const level = m ? +m[1] : 1;
  let rest = (m ? m[2] : String(title)).trim();

  let global = false;
  if(/^(global|worldwide|multi-?country)\b/i.test(rest)){
    global = true;
    rest = rest.replace(/^(global|worldwide|multi-?country)\s*/i, '').trim();
  }

  // "<Disease> in <Place>" is the common shape; level 3 and 4 use "... to <Place>"
  let disease = rest, where = '';
  const inMatch = rest.match(/^(.*?)\s+(?:in|to)\s+(.+)$/i);
  if(inMatch){ disease = inMatch[1].trim(); where = inMatch[2].trim(); }
  if(/\b(global|worldwide|multiple countries)\b/i.test(where)) global = true;

  return { level, disease, where, global, boilerplate: CDC_BOILERPLATE.test(disease) };
}

/* Global notices name their countries on the notice page, under a "Country
   List" heading. Reading that page is one extra request per global notice, and
   there are rarely more than a handful. */
async function cdcNoticeCountries(url){
  const r = await fetch(url, { headers:{ 'user-agent':UA } });
  if(!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  // prefer the explicit list if the page has one
  const list = text.match(/Country List\s*:?\s*([^.]{3,600})/i);
  return scanForCountries(list ? list[1] : text.slice(0, 4000));
}

async function fetchCDCNotices(){
  const r = await fetch(CDC_NOTICES_RSS, {
    headers:{ 'accept':'application/rss+xml, application/xml, text/xml', 'user-agent':UA }
  });
  if(!r.ok) throw new Error('CDC returned ' + r.status);

  const items = parseRSS(await r.text());
  if(!items.length) throw new Error('no <item> elements in the feed');

  const countries = {};
  const unmatched = [];
  let globalsRead = 0, records = 0;
  const GLOBAL_PAGE_LIMIT = 5;    // extra page fetches per run
  const COUNTRY_CAP = 30;         // one notice must not paint the whole globe

  for(const item of items){
    const parsed = parseNoticeTitle(item.title);

    // work out the disease: the title normally holds it, level 3/4 titles don't
    let disease = parsed.disease;
    if(parsed.boilerplate || !disease){
      disease = diseaseFromText(item.title, item.description) || null;
    } else {
      const known = diseaseFromText(disease);
      if(known) disease = known;                   // normalises Monkeypox -> Mpox
    }
    if(!disease){ unmatched.push(item.title.slice(0, 70)); continue; }

    // work out the countries
    let isos = parsed.where ? scanForCountries(parsed.where) : [];
    if(!isos.length && !parsed.global) isos = scanForCountries(item.title);
    if(!isos.length && parsed.global && item.link && globalsRead < GLOBAL_PAGE_LIMIT){
      globalsRead++;
      try{ isos = await cdcNoticeCountries(item.link); }
      catch(err){ /* the notice still counts, we just can't place it */ }
    }
    if(!isos.length){ unmatched.push(item.title.slice(0, 70)); continue; }
    if(isos.length > COUNTRY_CAP) isos = isos.slice(0, COUNTRY_CAP);

    // level 1 is "usual precautions", level 4 is "avoid all travel"
    const bump = [0, 0, 8, 18, 28][parsed.level] || 0;
    const severity = Math.min(100, severityFor(disease, null, null) + bump);
    const asOf = rssDate(item.date);

    for(const iso of isos){
      const entry = {
        name: disease,
        cases: null,            // a travel notice is an advisory, not a count
        deaths: null,
        cfr: null,
        per100k: null,
        growth7d: null,
        severity,
        asOf,
        source: `US CDC travel health notice (Level ${parsed.level})`,
        url: item.link || 'https://wwwnc.cdc.gov/travel/notices',
        provisional: true
      };
      if(addIfNew(countries, iso, entry, 'medium')) records++;
    }
  }

  return { countries, matched:Object.keys(countries).length, notices:items.length,
           records, globalsRead, unmatched:[...new Set(unmatched)].slice(0, 8) };
}

/* ---------------------------------------------------------------------------
   4i. SOURCE: RELIEFWEB (UN OCHA)

   ReliefWeb curates situation reports from thousands of humanitarian sources
   and tags every one with a disaster type and a country. Its API is public,
   returns JSON, and needs no key — only an `appname` so they can see who is
   calling.

   This is the feed that reaches the countries nobody else reports on: Yemen,
   Afghanistan, Sudan, Syria, Myanmar, Haiti, the places where the health
   ministry has other problems and the reporting comes from an NGO instead.

   Treat it accordingly. Records land with conf:'low' and provisional:true,
   because the underlying reports vary from a WHO sitrep to an NGO field
   update, and the globe's confidence badge should say so.
   --------------------------------------------------------------------------- */

/* v1 was decommissioned in Q1 2026 and answers 410 Gone. v2 is the current
   version and is documented as fully compatible with v1, so only the path
   changed here.

   ONE THING TO DO: since 1 November 2025 ReliefWeb asks for a pre-approved
   appname. Register yours at https://apidoc.reliefweb.int/ and put it below.
   Unregistered names still work today, but that is not a promise they made. */
const RELIEFWEB_API = 'https://api.reliefweb.int/v2/reports';
const RELIEFWEB_APP = 'pandemic-tracker-student-project';
const RELIEFWEB_DAYS = 45;      // how far back to look

/* ReliefWeb speaks ISO 3166 alpha-3. Natural Earth's 110m basemap resolves a
   few territories under its own codes, and the globe matches on those, so
   translate before writing anything into the payload. */
/* ---------------------------------------------------------------------------
   THE CODE THE GLOBE MATCHES ON IS NOT ALWAYS THE ISO 3166 CODE

   The globe resolves a country by Natural Earth's ADM0_A3. For eight countries
   that differs from the ISO 3166 alpha-3 code every data feed publishes, and a
   record written under the ISO code lands on a polygon that does not exist. It
   does not error, it does not warn — the country just stays hatched while its
   data sits in the payload.

   That is exactly what was happening to South Sudan (cholera, influenza and
   polio all present under SSD), Kosovo (XKX) and Palestine (PSE). FluNet and
   ReliefWeb publish raw ISO 3166, so every adapter needs this, not just the
   one it was first written for.
   --------------------------------------------------------------------------- */
const ISO3_FIX = {
  SSD:'SDS',     // South Sudan
  XKX:'KOS',     // Kosovo
  PSE:'PSX',     // Palestine
  ESH:'SAH',     // Western Sahara
  ROM:'ROU',     // Romania, old code
  TMP:'TLS',     // Timor-Leste, old code
  ZAR:'COD'      // DR Congo, old code
};
function fixISO(code){
  const up = String(code || '').toUpperCase();
  return ISO3_FIX[up] || up;
}

/** Rewrite any record filed under a code the basemap cannot draw. Runs over
 *  the finished payload, so it covers every adapter including future ones. */
function normaliseCodes(countries, admin1, notes){
  const moved = [];

  for(const [iso, rec] of Object.entries(countries)){
    const fixed = fixISO(iso);
    if(fixed === iso) continue;
    if(countries[fixed]){
      for(const d of rec.diseases) addIfNew(countries, fixed, d, rec.conf);
    } else {
      countries[fixed] = rec;
    }
    delete countries[iso];
    moved.push(`${iso}->${fixed}`);
  }

  for(const [key, rec] of Object.entries(admin1)){
    const [iso, ...rest] = key.split(':');
    const fixed = fixISO(iso);
    if(fixed === iso) continue;
    const newKey = [fixed, ...rest].join(':');
    if(!admin1[newKey]) admin1[newKey] = rec;
    delete admin1[key];
  }

  if(moved.length){
    notes.push(`Basemap codes corrected so these countries can paint: ${moved.join(', ')}`);
  }
}

async function fetchReliefWeb(){
  const since = new Date(Date.now() - RELIEFWEB_DAYS * 86400000).toISOString().slice(0, 10);
  const include = ['title','date.created','country.iso3','country.name','url','source.shortname','disaster_type.name'];
  const common = [
    `appname=${encodeURIComponent(RELIEFWEB_APP)}`,
    'limit=120',
    'sort[]=date.created:desc',
    ...include.map((f, i) => `fields[include][${i}]=${encodeURIComponent(f)}`)
  ];

  // Attempt 1: the proper taxonomy filter. Attempt 2: a title search, in case
  // the taxonomy field is renamed — same failure handling as FluNet.
  const attempts = [
    `${RELIEFWEB_API}?${common.join('&')}`
      + '&filter[operator]=AND'
      + '&filter[conditions][0][field]=disaster_type.name'
      + '&filter[conditions][0][value]=Epidemic'
      + `&filter[conditions][1][field]=date.created`
      + `&filter[conditions][1][value][from]=${since}`,
    `${RELIEFWEB_API}?${common.join('&')}`
      + '&query[value]=' + encodeURIComponent(DISEASE_WORDS.join(' OR '))
      + '&query[fields][0]=title'
      + '&filter[field]=date.created'
      + `&filter[value][from]=${since}`
  ];

  /* A third, deliberately plain attempt. If the structured queries are being
     rejected, this one tells us whether the problem is the query or the
     appname. */
  attempts.push(`${RELIEFWEB_API}?appname=${encodeURIComponent(RELIEFWEB_APP)}`
    + '&limit=50&sort[]=date.created:desc'
    + '&query[value]=outbreak&query[fields][]=title');

  let data = null, usedAttempt = 0, lastErr = null;
  for(let i = 0; i < attempts.length; i++){
    try{
      const r = await fetch(attempts[i], { headers:{ accept:'application/json', 'user-agent':UA } });
      if(r.status === 410){
        lastErr = 'HTTP 410 — this API version has been retired, check https://apidoc.reliefweb.int/';
        continue;
      }
      if(!r.ok){
        /* ReliefWeb explains its own 400s in the body. Carrying that message
           into _notes is the difference between "HTTP 400" and knowing the
           appname needs registering at https://apidoc.reliefweb.int/ */
        let why = '';
        try{
          const body = (await r.text()).replace(/\s+/g, ' ').slice(0, 160);
          if(body) why = ' — ' + body;
        }catch(e){ /* body already consumed or empty */ }
        lastErr = 'HTTP ' + r.status + why;
        continue;
      }
      const j = await r.json();
      if(Array.isArray(j?.data) && j.data.length){ data = j.data; usedAttempt = i + 1; break; }
      lastErr = 'no reports returned';
    }catch(err){ lastErr = err.message; }
  }
  if(!data) throw new Error('both queries failed (' + lastErr + ')');

  const countries = {};
  const skipped = [];
  let records = 0;
  const COUNTRY_CAP = 12;        // a regional roundup is not 40 outbreaks

  for(const item of data){
    const f = item.fields || {};
    const title = String(f.title || '');
    const disease = diseaseFromText(title);
    if(!disease){ skipped.push(title.slice(0, 70)); continue; }

    const list = (Array.isArray(f.country) ? f.country : [])
      .filter(c => c && c.iso3 && !/^world$/i.test(c.name || ''))
      .slice(0, COUNTRY_CAP);
    if(!list.length){ skipped.push(title.slice(0, 70)); continue; }

    const asOf = String(f.date?.created || '').slice(0, 10) || null;
    const org = f.source?.[0]?.shortname || 'ReliefWeb';

    for(const c of list){
      const entry = {
        name: disease,
        cases: findCases(title),      // occasionally the headline carries them
        deaths: findDeaths(title),
        cfr: null,
        per100k: null,
        growth7d: null,
        severity: severityFor(disease, findCases(title), findDeaths(title)),
        asOf,
        source: `ReliefWeb — ${org}`,
        url: f.url || 'https://reliefweb.int/disasters',
        provisional: true
      };
      if(addIfNew(countries, fixISO(c.iso3), entry, 'low')) records++;
    }
  }

  return { countries, matched:Object.keys(countries).length, reports:data.length,
           records, usedAttempt, skipped:[...new Set(skipped)].slice(0, 6) };
}

/* ---------------------------------------------------------------------------
   4j. SOURCE: WHO EMRO — THE EASTERN MEDITERRANEAN

   EMRO maintains a "Current outbreaks in the WHO Eastern Mediterranean Region"
   table: one row per country per disease, with cumulative cases, deaths, CFR
   and the month the event started. It is the only regional table that covers
   Afghanistan, Iraq, Somalia, Sudan, Syria, Yemen and Pakistan in one place.

   READ THIS BEFORE YOU TRUST IT.

   EMRO publishes that table irregularly. At the time this adapter was written
   the page at /pandemic-epidemic-diseases/outbreaks/ was stamped "Table last
   updated on 27 January 2024", and the newer table under
   /surveillance-forecasting-response/outbreaks carried figures through
   28 December 2024. Both are old enough that presenting them as current
   outbreak data would be dishonest — a 2024 cholera figure painted on a 2026
   map is worse than an honest hatch.

   So this adapter does three things the others do not:

     1. it reads BOTH table URLs and keeps whichever is stamped more recently;
     2. it parses the stamp, and if the table is older than EMRO_MAX_AGE_DAYS
        it publishes NOTHING and says so in _notes;
     3. it marks countries carrying EMRO's asterisk — "no update received from
        this country during the reporting period" — as low confidence.

   The gate is the point. Leave the adapter in: the day EMRO refreshes the
   table, the Middle East fills in by itself with no code change. Until then
   ReliefWeb and the CDC travel notices are what reach those countries.
   --------------------------------------------------------------------------- */

const EMRO_TABLES = [
  'https://www.emro.who.int/surveillance-forecasting-response/outbreaks',
  'https://www.emro.who.int/pandemic-epidemic-diseases/outbreaks/index.html'
];
const EMRO_MAX_AGE_DAYS = 120;    // older than this and nothing is published
const EMRO_SHOW_STALE   = false;  // set true to publish it anyway, dates and all

/* --- tiny HTML table reader ---------------------------------------------- */

function cellText(cell){
  return String(cell)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'").replace(/&ndash;/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlTableRows(html){
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  return tables.map(tbl =>
    (tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [])
      .map(tr => (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(cellText))
  );
}

/* A value slot is a number, a percentage, or one of EMRO's dashes for "not
   reported". Keeping the empty ones as null is what makes the column layout
   readable: "5033 | - | 45447 | - | -" has to stay five slots wide or the
   numbers shift into the wrong columns. */
function isSlot(s){
  return s === '' || s === '-' || s === '--' || s === '–'
      || /^[0-9][0-9\s,.\u00a0]*%?$/.test(s);
}
function slotValue(s){
  if(!s || /^[-–]+$/.test(s)) return null;
  const n = parseFloat(String(s).replace(/[%\s,\u00a0]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* "Jan-24", "January-23", "Aug-23" — the month the event began, not the month
   the figures are from. Used for context only. */
const EVENT_DATE = /^[A-Za-z]{3,9}\s*[-\u2013]\s*\d{2,4}$/;

const MONTHS = ['january','february','march','april','may','june','july',
                'august','september','october','november','december'];

/* Find how old the table is. Two stamp formats have been seen:
     "Table last updated on 27 January 2024"
     column header "Cumulative 1 Jan-28 Dec. 2024"  */
function emroStamp(text){
  const explicit = text.match(/Table last updated on\s*([0-9]{1,2})\s+([A-Za-z]+)\s+([0-9]{4})/i);
  if(explicit){
    const mi = MONTHS.findIndex(m => m.startsWith(explicit[2].toLowerCase().slice(0, 3)));
    if(mi >= 0) return { date: new Date(Date.UTC(+explicit[3], mi, +explicit[1])), via: 'page stamp' };
  }
  /* Otherwise take the END of the reporting period out of a column header.
     Both shapes have been seen, and both end with "<day> <month> <year>":
         "Cumulative 1 Jan-28 Dec. 2024"   ->  28 Dec 2024
         "1-28 December 2024"              ->  28 December 2024
     Scanning for the LAST day-month-year in the page is what makes one
     pattern cover both. */
  const period = [...text.matchAll(/([0-9]{1,2})\s*[-\u2013]?\s*([A-Za-z]{3,9})\.?\s*,?\s*([0-9]{4})/g)];
  const last = period[period.length - 1];
  if(last){
    const mi = MONTHS.findIndex(m => m.startsWith(last[2].toLowerCase().slice(0, 3)));
    if(mi >= 0) return { date: new Date(Date.UTC(+last[3], mi, +last[1])), via: 'column header' };
  }
  return { date: null, via: 'none found' };
}

/* EMRO's disease names, normalised to what the rest of the pipeline and the
   guidance library expect. Anything not listed passes through as written. */
const EMRO_DISEASE = [
  [/acute watery diarrho?ea|(^|\W)awd(\W|$)/i, 'Cholera (acute watery diarrhoea)'],
  [/cholera/i,                                  'Cholera'],
  [/crimean/i,                                  'Crimean-Congo haemorrhagic fever'],
  [/circulating vaccine[- ]derived/i,           'Circulating vaccine-derived poliovirus (cVDPV2)'],
  [/wild polio/i,                               'Polio (wild poliovirus type 1)'],
  [/poliomyelitis|polio/i,                      'Polio'],
  [/middle east respiratory|mers/i,             'MERS-CoV'],
  [/mpox|monkeypox/i,                           'Mpox'],
  [/dengue/i,                                   'Dengue'],
  [/chikungunya/i,                              'Chikungunya'],
  [/rift valley/i,                              'Rift Valley fever'],
  [/legionnaire/i,                              "Legionnaires' disease"],
  [/diphtheria/i,                               'Diphtheria'],
  [/measles/i,                                  'Measles'],
  [/malaria/i,                                  'Malaria'],
  [/hepatitis a/i,                              'Hepatitis A'],
  [/hepatitis e/i,                              'Hepatitis E'],
  [/brucellosis/i,                              'Brucellosis'],
  [/botulism/i,                                 'Botulism'],
  [/meningitis|meningococcal/i,                 'Meningococcal meningitis'],
  [/leishmania/i,                               'Leishmaniasis'],
  [/typhoid/i,                                  'Typhoid fever']
];

/* Chronic-infection rows sit in the same table but are not outbreak signals,
   and putting an HIV programme total on an outbreak globe would misread it. */
const EMRO_SKIP = /human immunodeficiency|(^|\W)hiv(\W|$)|tuberculosis/i;

function emroDisease(raw){
  for(const [re, name] of EMRO_DISEASE) if(re.test(raw)) return name;
  return raw.replace(/\s*\([^)]*\)\s*$/, '').trim();   // drop a trailing "(XYZ)"
}

async function fetchEMRO(){
  let best = null;

  for(const url of EMRO_TABLES){
    try{
      const r = await fetch(url, { headers:{ accept:'text/html', 'user-agent':UA } });
      if(!r.ok) continue;
      const html = await r.text();
      const plain = cellText(html.replace(/<script[\s\S]*?<\/script>/gi, ' '));
      const stamp = emroStamp(plain);

      // the outbreak table is the one with a Countries column and a Diseases column
      const tables = htmlTableRows(html);
      const table = tables.find(rows => rows.some(cells => {
        const joined = cells.join(' ').toLowerCase();
        return /countr/.test(joined) && /disease/.test(joined);
      }));
      if(!table) continue;

      if(!best || (stamp.date && (!best.stamp.date || stamp.date > best.stamp.date))){
        best = { url, table, stamp };
      }
    }catch(err){ /* try the next URL */ }
  }

  if(!best) throw new Error('neither outbreak table could be read');

  const asOf = best.stamp.date ? best.stamp.date.toISOString().slice(0, 10) : null;
  const ageDays = best.stamp.date
    ? Math.round((Date.now() - best.stamp.date.getTime()) / 86400000)
    : null;

  const countries = {};
  const unmatched = [];
  let rows = 0, noUpdate = 0;

  for(const cells of best.table){
    if(cells.length < 4) continue;

    let country = cells[0];
    const diseaseRaw = cells[1];
    if(!country || !diseaseRaw) continue;
    if(/countr|disease|cumulative|new cases/i.test(country + ' ' + diseaseRaw)) continue;  // header row

    // EMRO marks countries that did not report this period with an asterisk
    const stale = /\*+\s*$/.test(country);
    country = country.replace(/\*+\s*$/, '').trim();
    if(stale) noUpdate++;

    const iso = toISO(country) || (scanForCountries(country)[0] || null);
    if(!iso){ unmatched.push(country); continue; }

    if(EMRO_SKIP.test(diseaseRaw)) continue;
    const disease = emroDisease(diseaseRaw);

    // read the numeric columns positionally, keeping the dashes as empty slots
    let rest = cells.slice(2);
    if(rest.length && EVENT_DATE.test(rest[rest.length - 1])) rest = rest.slice(0, -1);
    const slots = rest.filter(isSlot).map(slotValue);

    let cases = null, deaths = null;
    if(slots.length >= 5){ cases = slots[2]; deaths = slots[3]; }        // new/new/cum/cum/cfr
    else if(slots.length === 4){ cases = slots[0]; deaths = slots[1]; }
    else if(slots.length === 3){ cases = slots[0]; deaths = slots[1]; }  // cum/cum/cfr
    else if(slots.length === 2){ cases = slots[0]; deaths = slots[1]; }
    else if(slots.length === 1){ cases = slots[0]; }
    if(cases == null && deaths == null) continue;

    const entry = {
      name: disease,
      cases,
      deaths,
      cfr: (cases && deaths && cases > 20) ? +(deaths / cases * 100).toFixed(1) : null,
      per100k: null,
      growth7d: null,
      severity: severityFor(disease, cases, deaths),
      asOf,                                  // the table's stamp, not today
      source: stale
        ? 'WHO EMRO regional outbreak table (country did not report this period)'
        : 'WHO EMRO regional outbreak table',
      url: best.url,
      provisional: true
    };
    if(addIfNew(countries, iso, entry, stale ? 'low' : 'medium')) rows++;
  }

  const fresh = ageDays != null && ageDays <= EMRO_MAX_AGE_DAYS;
  return {
    countries: (fresh || EMRO_SHOW_STALE) ? countries : {},
    parsed: rows,
    matched: Object.keys(countries).length,
    noUpdate,
    asOf, ageDays, fresh,
    published: fresh || EMRO_SHOW_STALE,
    via: best.stamp.via,
    url: best.url,
    unmatched: [...new Set(unmatched)].slice(0, 8)
  };
}

/* ---------------------------------------------------------------------------
   4k. SOURCE: EMRO COUNTRY OFFICE WEEKLY SITUATION REPORTS (PDF)

   The regional table in §4j has gone quiet, but the country offices are still
   publishing. Afghanistan's WHO office puts out an "Infectious disease
   outbreaks situation report" every epidemiological week, as a PDF, with
   measles, AWD, dengue, CCHF, malaria and respiratory numbers in it. That is a
   live weekly feed for a country nothing else in this pipeline reaches.

   HOW THIS READS A PDF, AND WHAT IT REFUSES TO READ
   ------------------------------------------------
   The report opens with an infographic: disease names in coloured boxes with
   the cumulative counts underneath. Do not trust it. PDF text extraction walks
   the drawing order, not the visual order, and in these files the labels and
   the numbers come out offset from each other. In the week 26-2024 report the
   extracted text reads

       AWD 70,350   ARI *8,313   COVID-19 35,021   Measles 787,721

   but the figure captions in the same document say measles was 35,021 and the
   asterisk note says 8,313 is the COVID-19 count. Pair label-to-number there
   and you publish 787,721 measles cases in Afghanistan, which would swamp the
   globe with a number nobody reported.

   So this parser ignores the infographic entirely and reads only self-contained
   sentences, where the disease and its number sit in the same clause:

     · figure captions  "…suspected measles cases in Afghanistan, 29 Dec 2024
                         – 16 Aug 2025 (N= 84,922)"        -> cumulative
     · weekly bullets   "During week 45-2025, a total of 2,780 AWD with
                         dehydration cases, with one associated death…"  -> weekly
     · year-to-date     "Since the beginning of 2025, 19,272 cases of suspected
                         measles and 129 associated deaths…"  -> cumulative

   Anything it cannot attribute to a disease with confidence is dropped rather
   than guessed at.

   ADDING MORE COUNTRIES
   ---------------------
   Add an entry to EMRO_COUNTRY_REPORTS. Only Afghanistan is enabled because
   Afghanistan's format is the one that has been checked line by line against
   real reports. Other EMR country offices publish weekly bulletins in their own
   layouts (Iraq and Yemen use EWARN formats); verify the sentence patterns
   survive before you switch one on, and check the parsed numbers against the
   PDF by hand the first time.

   Needs the `unpdf` package: npm i unpdf. The import is dynamic, so if the
   dependency is missing the adapter reports that in _notes and the rest of the
   API carries on.
   --------------------------------------------------------------------------- */

const EMRO_COUNTRY_REPORTS = [
  {
    iso: 'AFG',
    label: 'Afghanistan',
    enabled: true,
    index: 'https://www.emro.who.int/afg/information-resources/infectious-disease-outbreak-situation-reports.html',
    // the PDFs live in the country's media folder, under half a dozen naming
    // conventions across the years, so match the folder and rank by week
    pdfMatch: /\/images\/stories\/afghanistan\/[^"']+\.pdf/i
  }
  // { iso:'IRQ', label:'Iraq', enabled:false, index:'…', pdfMatch:/…/ },
  // { iso:'YEM', label:'Yemen', enabled:false, index:'…', pdfMatch:/…/ },
];

const EMRO_REPORT_MAX_AGE_DAYS = 60;   // a "weekly" report two months old is not weekly
const EMRO_PDF_MAX_BYTES = 12 * 1024 * 1024;

/* unpdf is only loaded when a PDF actually needs reading. */
let _pdfLib = null;
async function pdfLib(){
  if(_pdfLib) return _pdfLib;
  try{
    _pdfLib = await import('unpdf');
  }catch(err){
    throw new Error('the unpdf package is not installed — run `npm i unpdf` and redeploy');
  }
  return _pdfLib;
}

/* Cache extracted text per URL. A warm lambda re-reading the same weekly report
   costs nothing, and the report only changes once a week. */
const pdfTextCache = new Map();

async function pdfText(url){
  if(pdfTextCache.has(url)) return pdfTextCache.get(url);

  const r = await fetch(url, { headers:{ 'user-agent':UA } });
  if(!r.ok) throw new Error('PDF HTTP ' + r.status);

  const len = +(r.headers.get('content-length') || 0);
  if(len && len > EMRO_PDF_MAX_BYTES) throw new Error('PDF is ' + Math.round(len/1e6) + ' MB, too large to parse here');

  const bytes = new Uint8Array(await r.arrayBuffer());
  if(bytes.length > EMRO_PDF_MAX_BYTES) throw new Error('PDF is too large to parse here');

  /* A .pdf link does not guarantee a PDF. IRIS and some CDNs answer with a
     bot-check or a redirect page carrying HTTP 200, and handing that to the
     parser produces "Invalid PDF structure" with no hint of why. Check the
     magic bytes and say what actually came back. */
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  if(magic !== '%PDF-'){
    const head = new TextDecoder().decode(bytes.slice(0, 120)).replace(/\s+/g, ' ').trim();
    throw new Error('not a PDF (served ' + (head.startsWith('<') ? 'an HTML page' : 'something else')
      + ': "' + head.slice(0, 80) + '")');
  }

  const { extractText, getDocumentProxy } = await pdfLib();
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: true });

  const clean = String(text)
    .replace(/-\s*\n\s*/g, '')        // rejoin words hyphenated across a line break
    .replace(/\s+/g, ' ')
    .trim();

  if(pdfTextCache.size > 12) pdfTextCache.clear();
  pdfTextCache.set(url, clean);
  return clean;
}

/* --- reading the numbers ------------------------------------------------- */

const WORD_NUM = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };

function countOf(raw){
  if(raw == null) return null;
  const word = WORD_NUM[String(raw).toLowerCase()];
  if(word) return word;
  const n = parseInt(String(raw).replace(/[\s,\u00a0]/g, ''), 10);
  // a national weekly bulletin does not report tens of millions of cases; a
  // number that big is a parse error, not an outbreak
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
}

const SITREP_DISEASE = [
  [/acute watery diarrho?ea|\bAWD\b/i,            'Cholera (acute watery diarrhoea)'],
  [/\bcholera\b/i,                                'Cholera'],
  [/\bmeasles\b/i,                                'Measles'],
  [/\bdengue\b/i,                                 'Dengue'],
  [/\bCCHF\b|crimean/i,                           'Crimean-Congo haemorrhagic fever'],
  [/\bmalaria\b/i,                                'Malaria'],
  [/pertussis|whooping cough/i,                   'Pertussis'],
  [/\bdiphtheria\b/i,                             'Diphtheria'],
  [/\bchikungunya\b/i,                            'Chikungunya'],
  [/\bpolio|\bAFP\b|poliovirus/i,                 'Polio'],
  [/\bCOVID[- ]?19\b/i,                           'COVID-19'],
  [/\binfluenza\b|\bILI\b|\bSARI\b/i,             'Influenza'],
  [/acute respiratory infection|\bARI\b/i,        'Acute respiratory illness'],
  [/\bhepatitis\b/i,                              'Viral hepatitis'],
  [/leishmania/i,                                 'Leishmaniasis']
];

function sitrepDisease(text){
  if(!text) return null;
  for(const [re, name] of SITREP_DISEASE) if(re.test(text)) return name;
  return null;
}

/* When a weekly bullet says "a total of 1,344 suspected cases" without naming
   the disease, the disease is whatever the section was about. Look back a short
   way for the last disease word — and give up rather than guess if there isn't
   one. */
function diseaseNearby(text, index, back = 700){
  const before = text.slice(Math.max(0, index - back), index);
  for(const re of [/[^.]*$/]){ void re; }
  let found = null;
  for(const [re, name] of SITREP_DISEASE){
    const m = before.match(new RegExp(re.source + '(?![\\s\\S]*' + re.source + ')', re.flags.replace('g','')));
    if(m && m.index != null && (found == null || m.index > found.at)) found = { at:m.index, name };
  }
  return found ? found.name : null;
}

/* ISO week -> the Sunday that ends it, for reports that only give a week number */
function isoWeekEnd(year, week){
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = (jan4.getUTCDay() + 6) % 7;                 // Monday = 0
  const week1Monday = new Date(jan4.getTime() - dow * 86400000);
  return new Date(week1Monday.getTime() + ((week - 1) * 7 + 6) * 86400000);
}

const MONTH_RE = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';

/* "No. 45 (03 - 09 Nov 2025)" and "07 - 13 December 2025" both give an end date */
function sitrepEndDate(text){
  const m = text.match(new RegExp('(\\d{1,2})\\s*[-\\u2013]\\s*(\\d{1,2})\\s*' + MONTH_RE + '\\.?\\s*(20\\d{2})', 'i'));
  if(m){
    const mi = MONTHS.findIndex(x => x.startsWith(m[3].toLowerCase().slice(0, 3)));
    if(mi >= 0) return new Date(Date.UTC(+m[4], mi, +m[2]));
  }
  return null;
}

/**
 * Pull disease records out of one situation report's text.
 * Every record carries how it was read, so a wrong number can be traced back
 * to the sentence that produced it.
 */
function parseSitrep(text){
  const found = new Map();   // disease -> record

  const put = (disease, patch, how) => {
    if(!disease) return;
    const cur = found.get(disease) || { name:disease, cases:null, deaths:null, weekCases:null, weekDeaths:null, how:[] };
    for(const [k, v] of Object.entries(patch)) if(v != null) cur[k] = Math.max(cur[k] ?? 0, v);
    if(!cur.how.includes(how)) cur.how.push(how);
    found.set(disease, cur);
  };

  /* 1. figure captions: cumulative total for a named disease */
  const caption = /Figure[^.]{0,8}\.\s*([^()]{0,160}?)\bcases\b[^()]{0,90}?\(\s*N\s*=\s*([\d,\s]+)\)/gi;
  for(const m of text.matchAll(caption)){
    put(sitrepDisease(m[1]), { cases: countOf(m[2]) }, 'figure caption');
  }

  /* 2. year-to-date sentences */
  const ytd = /Since the beginning of\s+(20\d{2})[,\s]+([\d,]+)\s+cases of\s+([^,.;]{0,60}?)\s+and\s+([\d,]+)[^.]{0,40}?deaths/gi;
  for(const m of text.matchAll(ytd)){
    put(sitrepDisease(m[3]), { cases: countOf(m[2]), deaths: countOf(m[4]) }, 'year-to-date sentence');
  }

  /* 3. weekly bullets. The disease is sometimes in the clause and sometimes
        only in the section above it. */
  const weekly = /During\s+(?:epidemiological\s+)?week\s*#?\s*(\d{1,2})\s*[-\u2013]?\s*(20\d{2})?[,\s]+(?:a\s+total\s+of\s+)?([\d,]+)\s+([^,.;]{0,70}?)\bcases?\b/gi;
  for(const m of text.matchAll(weekly)){
    const disease = sitrepDisease(m[4]) || diseaseNearby(text, m.index);
    const tail = text.slice(m.index, m.index + 320);
    const dm = tail.match(/(\b[\d,]+\b|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:new\s+|associated\s+|suspected\s+|reported\s+|related\s+)*deaths?/i);
    put(disease, { weekCases: countOf(m[3]), weekDeaths: dm ? countOf(dm[1]) : null }, 'weekly bullet');
  }

  return [...found.values()];
}

/* --- the adapter --------------------------------------------------------- */

async function fetchEMROCountryReports(){
  const countries = {};
  const reports = [];
  const problems = [];

  for(const country of EMRO_COUNTRY_REPORTS){
    if(!country.enabled) continue;
    try{
      /* find the newest PDF on the index page. The filenames have changed
         format at least four times, so rank by the week and year in the link
         text or the filename rather than trusting any one pattern. */
      const r = await fetch(country.index, { headers:{ accept:'text/html', 'user-agent':UA } });
      if(!r.ok) throw new Error('index HTTP ' + r.status);
      const html = await r.text();

      const links = [];
      for(const m of html.matchAll(/<a[^>]+href=["']([^"']+\.pdf[^"']*)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi)){
        const href = m[1].startsWith('http') ? m[1] : 'https://www.emro.who.int' + (m[1].startsWith('/') ? '' : '/') + m[1];
        if(!country.pdfMatch.test(href)) continue;
        const label = cellText(m[2]);
        const hay = label + ' ' + decodeURIComponent(href);
        const wk = hay.match(/week[\s_#-]*(\d{1,2})/i);
        const yr = hay.match(/(20\d{2})/);
        links.push({
          href, label,
          week: wk ? +wk[1] : null,
          year: yr ? +yr[1] : null,
          rank: (yr ? +yr[1] : 0) * 100 + (wk ? +wk[1] : 0)
        });
      }
      if(!links.length) throw new Error('no situation report PDFs linked on the index page');

      links.sort((a, b) => b.rank - a.rank);
      const newest = links[0];

      /* date the report: the link text usually carries the week's date range,
         otherwise fall back to the ISO week itself */
      let end = sitrepEndDate(newest.label);
      let dateVia = 'index link';
      const text = await pdfText(newest.href);
      if(!end){ end = sitrepEndDate(text.slice(0, 600)); dateVia = 'PDF header'; }
      if(!end && newest.week && newest.year){ end = isoWeekEnd(newest.year, newest.week); dateVia = 'ISO week number'; }
      if(!end) throw new Error('could not date the newest report');

      const ageDays = Math.round((Date.now() - end.getTime()) / 86400000);
      const asOf = end.toISOString().slice(0, 10);

      if(ageDays > EMRO_REPORT_MAX_AGE_DAYS){
        reports.push({ iso:country.iso, label:country.label, asOf, ageDays, week:newest.week,
                       url:newest.href, published:false, records:0, dateVia });
        continue;
      }

      const rows = parseSitrep(text);
      let added = 0;
      for(const row of rows){
        const cases  = row.cases  ?? row.weekCases  ?? null;
        const deaths = row.deaths ?? row.weekDeaths ?? null;
        if(cases == null && deaths == null) continue;
        const cumulative = row.cases != null;

        const entry = {
          name: row.name,
          cases,
          deaths,
          cfr: (cases && deaths && cases > 20) ? +(deaths / cases * 100).toFixed(1) : null,
          per100k: null,
          growth7d: null,
          severity: severityFor(row.name, cases, deaths),
          asOf,
          source: `WHO ${country.label} weekly outbreak situation report`
                + (newest.week ? `, epidemiological week ${newest.week}` : '')
                + ` (${cumulative ? 'cumulative' : 'cases reported that week'}; read from the ${row.how.join(' and ')})`,
          url: newest.href,
          provisional: true
        };
        if(addIfNew(countries, country.iso, entry, 'medium')) added++;
      }

      reports.push({ iso:country.iso, label:country.label, asOf, ageDays, week:newest.week,
                     url:newest.href, published:true, records:added, diseases:rows.length, dateVia });
    }catch(err){
      problems.push(`${country.label}: ${err.message}`);
    }
  }

  return { countries, reports, problems };
}

/* ---------------------------------------------------------------------------
   4l. SOURCE: WHO AFRO WEEKLY BULLETIN ON OUTBREAKS AND OTHER EMERGENCIES

   The regional bulletin covers all 47 countries in the WHO African Region and
   is published every week. This is what reaches Botswana, Lesotho, eSwatini,
   Malawi, Eritrea, the Gambia, Guinea-Bissau and Equatorial Guinea — countries
   Africa CDC's briefs mention only occasionally and nothing else covers.

   HOW THE NUMBERS ARE READ, AND HOW THEY ARE CHECKED
   --------------------------------------------------
   Like the country sitreps in §4k, this reads sentences, not the layout:

     "Since the outbreak began in October 2024, Zambia has reported a
      cumulative 398 confirmed mpox cases with three deaths (CFR 0.8%)…"

   What makes this source safer than most is that the bulletin usually prints
   the case fatality ratio alongside the counts. That is a free checksum: if
   the cases and deaths this parser pulled out do not reproduce the CFR the
   bulletin printed, the parse is wrong and the record is dropped. A figure
   that fails its own arithmetic never reaches the globe.

   Where no CFR is printed the record still stands, but it carries the usual
   provisional flag and medium confidence.

   Sentences naming two countries ("the outbreak in DRC and Uganda") are read
   for neither — there is no honest way to decide which country the number
   belongs to, so the numbers are skipped rather than guessed.
   --------------------------------------------------------------------------- */

const AFRO_INDEXES = [
  'https://www.afro.who.int/health-topics/disease-outbreaks/outbreaks-and-other-emergencies-updates',
  'https://www.afro.who.int/outbreaks-and-emergencies-updates',
  'https://www.afro.who.int/publications/weekly-bulletin-outbreaks-and-other-emergencies'
];
const AFRO_MAX_AGE_DAYS = 45;
const AFRO_FOLLOW_LIMIT = 3;     // publication pages to open looking for a PDF

/* The bulletin prints its own CFR. Treat a parse that cannot reproduce it,
   within a quarter of its value, as a misread rather than a discovery. */
function cfrAgrees(cases, deaths, printed){
  if(printed == null) return true;             // nothing to check against
  if(!cases || deaths == null) return false;
  const computed = (deaths / cases) * 100;
  const slack = Math.max(0.5, printed * 0.25);
  return Math.abs(computed - printed) <= slack;
}

function splitSentences(text){
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Read one bulletin's text into per-country disease records. */
function parseAFRO(text){
  const out = new Map();        // "ISO|Disease" -> record
  const sentences = splitSentences(text);

  const NUM = '([0-9][0-9,\\s]*|one|two|three|four|five|six|seven|eight|nine|ten)';
  const caseRe  = new RegExp(NUM + '\\s*(?:\\([0-9,]+\\)\\s*)?(?:new\\s+|confirmed\\s+|suspected\\s+|laboratory[- ]confirmed\\s+|cumulative\\s+)*[a-z ]{0,30}?cases?\\b', 'i');
  const deathRe = new RegExp(NUM + '\\s*(?:\\([0-9,]+\\)\\s*)?(?:new\\s+|confirmed\\s+|suspected\\s+|associated\\s+|community\\s+)*deaths?\\b', 'i');
  const cfrRe   = /CFR[:\s]*([0-9]+(?:\.[0-9]+)?)\s*%/i;

  sentences.forEach((sentence, i) => {
    /* The bulletin names a disease once and then writes two or three
       sentences about it, so a cumulative figure often sits in a sentence
       that never repeats the disease name:

         "From 1 to 25 January 2026, Liberia reported four new confirmed
          Lassa fever cases, including one death."
         "Cumulatively, a total of 41 confirmed cases with nine deaths have
          been reported from Liberia…"

       The second sentence carries the number that matters. Inherit the
       disease from the sentence immediately before, and only from there. */
    let disease = diseaseFromText(sentence);
    let diseaseVia = 'sentence';
    if(!disease && i > 0){
      disease = diseaseFromText(sentences[i - 1]);
      diseaseVia = 'previous sentence';
    }
    if(!disease) return;

    /* which country? exactly one in the sentence, or exactly one in the
       sentence before it — a bulletin paragraph names the country once and
       then keeps talking about it */
    let isos = scanForCountries(sentence);
    let via = 'sentence';
    if(isos.length === 0 && i > 0){
      const prev = scanForCountries(sentences[i - 1]);
      if(prev.length === 1){ isos = prev; via = 'previous sentence'; }
    }
    if(isos.length !== 1) return;              // 0 or 2+: no honest attribution
    const iso = isos[0];

    const cm = sentence.match(caseRe);
    const dm = sentence.match(deathRe);
    const fm = sentence.match(cfrRe);
    const cases  = cm ? countOf(cm[1]) : null;
    const deaths = dm ? countOf(dm[1]) : null;
    const cfr    = fm ? parseFloat(fm[1]) : null;
    if(cases == null && deaths == null) return;

    // the checksum
    if(!cfrAgrees(cases, deaths, cfr)) return;
    if(cases != null && deaths != null && deaths > cases) return;   // impossible

    const key = iso + '|' + disease;
    const prev = out.get(key);
    // a bulletin repeats a figure in several forms; keep the largest, which is
    // the cumulative one
    if(prev && (prev.cases ?? 0) >= (cases ?? 0)) return;
    out.set(key, { iso, disease, cases, deaths, cfr,
                   via: diseaseVia === 'sentence' ? via : `${via} / disease from ${diseaseVia}`,
                   quote: sentence.slice(0, 180) });
  });

  return [...out.values()];
}

async function fetchAFRO(){
  /* find the newest bulletin PDF. The links sit on an index page, sometimes
     directly and sometimes behind a publication page, and the files live on
     either afro.who.int or iris.who.int. */
  const pdfs = [];
  const follow = [];

  for(const index of AFRO_INDEXES){
    try{
      const r = await fetch(index, { headers:{ accept:'text/html', 'user-agent':UA } });
      if(!r.ok) continue;
      const html = await r.text();

      for(const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,180}?)<\/a>/gi)){
        const href = m[1].startsWith('http') ? m[1]
                   : 'https://www.afro.who.int' + (m[1].startsWith('/') ? '' : '/') + m[1];
        const label = cellText(m[2]);
        const hay = label + ' ' + decodeURIComponent(href);
        if(!/week/i.test(hay)) continue;

        const wk = hay.match(/week[\s_#:-]*(\d{1,2})/i);
        const yr = hay.match(/(20\d{2})/);
        const entry = { href, label, week: wk ? +wk[1] : null, year: yr ? +yr[1] : null,
                        rank: (yr ? +yr[1] : 0) * 100 + (wk ? +wk[1] : 0) };

        if(/\.pdf($|\?)/i.test(href) || /bitstream/i.test(href)) pdfs.push(entry);
        else if(/bulletin|publication/i.test(hay)) follow.push(entry);
      }
      if(pdfs.length) break;
    }catch(err){ /* try the next index */ }
  }

  // no direct PDF links: open the newest publication pages and look inside
  if(!pdfs.length && follow.length){
    follow.sort((a, b) => b.rank - a.rank);
    for(const page of follow.slice(0, AFRO_FOLLOW_LIMIT)){
      try{
        const r = await fetch(page.href, { headers:{ accept:'text/html', 'user-agent':UA } });
        if(!r.ok) continue;
        const html = await r.text();
        for(const m of html.matchAll(/href=["']([^"']+(?:\.pdf|bitstreams?\/[^"']+\/(?:download|content)))["']/gi)){
          const href = m[1].startsWith('http') ? m[1] : 'https://www.afro.who.int' + m[1];
          pdfs.push({ ...page, href });
        }
        if(pdfs.length) break;
      }catch(err){ /* next */ }
    }
  }

  if(!pdfs.length) throw new Error('no bulletin PDF could be located from the index pages');

  pdfs.sort((a, b) => b.rank - a.rank);

  /* Work down the candidates: the newest link is sometimes a landing page or a
     bot-checked mirror, and the week before it is a perfectly good bulletin. */
  let newest = null, text = null, tried = [];
  for(const candidate of pdfs.slice(0, 4)){
    try{
      text = await pdfText(candidate.href);
      newest = candidate;
      break;
    }catch(err){
      tried.push(`${candidate.href.split('/').pop()}: ${err.message}`);
    }
  }
  if(!newest) throw new Error('no candidate bulletin could be read — ' + tried.join(' | '));

  /* date it: the bulletin's own header carries the reporting period */
  let end = sitrepEndDate(text.slice(0, 1200)) || sitrepEndDate(newest.label);
  let dateVia = 'bulletin header';
  if(!end && newest.week && newest.year){ end = isoWeekEnd(newest.year, newest.week); dateVia = 'ISO week number'; }
  if(!end) throw new Error('could not date the bulletin');

  const asOf = end.toISOString().slice(0, 10);
  const ageDays = Math.round((Date.now() - end.getTime()) / 86400000);

  const rows = parseAFRO(text);
  const countries = {};
  let added = 0;

  if(ageDays <= AFRO_MAX_AGE_DAYS){
    for(const row of rows){
      const entry = {
        name: row.disease,
        cases: row.cases,
        deaths: row.deaths,
        cfr: row.cfr ?? ((row.cases && row.deaths && row.cases > 20)
              ? +(row.deaths / row.cases * 100).toFixed(1) : null),
        per100k: null,
        growth7d: null,
        severity: severityFor(row.disease, row.cases, row.deaths),
        asOf,
        source: `WHO AFRO weekly bulletin`
              + (newest.week ? `, week ${newest.week}` : '')
              + (row.cfr != null ? ' (figures check out against the printed CFR)' : ''),
        url: newest.href,
        provisional: true
      };
      if(addIfNew(countries, row.iso, entry, 'medium')) added++;
    }
  }

  return {
    countries, added, parsed: rows.length,
    matched: Object.keys(countries).length,
    asOf, ageDays, week: newest.week, dateVia,
    published: ageDays <= AFRO_MAX_AGE_DAYS,
    url: newest.href
  };
}

/* ---------------------------------------------------------------------------
   4m. SOURCE: THE PRESS WIRE — searching the open web, under rules

   Every other adapter in this file reads a source somebody chose in advance.
   This one searches. It asks GDELT — a public, keyless index of news in 65
   languages — what is being reported about outbreaks in the last week, and
   turns credible, corroborated coverage into a signal on the globe.

   That is a genuinely different kind of source, and it is the one most likely
   to put something wrong on a disease map, so the rules below are strict and
   deliberately conservative. Read them before changing any of them.

   RULE 1 — ALLOWLIST, NEVER BLOCKLIST
   A domain is either on the list below or its article is discarded. There is
   no "looks reputable" path. A blocklist would need to anticipate every bad
   actor; an allowlist only needs to name the good ones, and being wrong means
   missing a story rather than publishing a false one.

   RULE 2 — THE WIRE NEVER PUBLISHES A NUMBER
   Every record from here has cases:null and deaths:null. Not because the
   numbers are always wrong, but because a headline's number cannot be checked
   — "Cholera cases top 2,000" might be cumulative, weekly, national, regional,
   suspected or confirmed, and nothing in the headline says which. So the wire
   says an outbreak is being reported, the severity comes from the disease
   floor, and the globe shows "no count". The Rwanda Marburg record that read
   202,466 cases is exactly the failure this rule forecloses.

   RULE 3 — CORROBORATION
   Two independent domains must report the same disease in the same country
   before anything is published. One exception: a single tier-1 source — a
   health ministry, WHO, a CDC — is enough on its own, because it is the
   primary source rather than a report of one.

   RULE 4 — IT NEVER OVERRIDES A COUNTING SOURCE
   The wire runs last and goes through addIfNew(), so if PAHO or WHO has
   already reported that disease in that country, the wire record is dropped.
   It only ever fills silence.

   RULE 5 — NO SPECULATION
   Headlines carrying rumour, fear, denial or hypothetical language are
   dropped, along with anything that does not name both a disease and exactly
   one country.

   Everything here is tunable in WIRE below, and every decision it makes is
   reported in _notes so you can see what it accepted and what it threw away.
   --------------------------------------------------------------------------- */

const WIRE = {
  enabled: true,
  windowDays: 7,          // how far back to search
  maxRecords: 250,        // per query, GDELT's own ceiling
  minSources: 2,          // independent domains needed to publish
  maxPerRun: 40,          // records this adapter may add in one run
  queries: 2,             // GDELT requests per run — see the rate limit note
  spacingMs: 1500,        // wait between them
  retryMs: 4000           // wait once more after a 429 before giving up
};

/* GDELT rate-limits by IP, and on Vercel that IP is shared with every other
   project on the same edge node, so a burst of four requests can come back
   429 even on the first run of the day. Two spaced requests with one backoff
   is what stopped it. If _notes still shows 429 every time, the shared IP is
   exhausted — set WIRE.enabled = false and the rest of the API is unaffected. */

const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

/* ---- the allowlist -------------------------------------------------------
   Tier 1: primary public health authorities. Their own site reporting their
           own outbreak is a primary source, so one is enough.
   Tier 2: international wires and peer-reviewed or specialist health press.
   Tier 3: established national outlets, mostly in the regions the other
           adapters reach least.
   Adding a domain is a judgement about whether you would cite it in the
   paper. If you would not, leave it out. */

const WIRE_TIER1 = [
  'who.int', 'cdc.gov', 'ecdc.europa.eu', 'paho.org', 'africacdc.org',
  'reliefweb.int', 'unicef.org', 'un.org', 'europa.eu', 'gavi.org',
  'nicd.ac.za', 'gov.uk', 'canada.ca', 'health.gov.au', 'mohfw.gov.in'
];
const WIRE_TIER2 = [
  'reuters.com', 'apnews.com', 'afp.com', 'bbc.com', 'bbc.co.uk',
  'aljazeera.com', 'theguardian.com', 'ft.com', 'economist.com',
  'nature.com', 'thelancet.com', 'nejm.org', 'bmj.com', 'science.org',
  'cidrap.umn.edu', 'promedmail.org', 'statnews.com', 'healthpolicy-watch.news',
  'devex.com', 'gavi.org', 'msf.org', 'redcross.org', 'ifrc.org'
];
const WIRE_TIER3 = [
  'nation.africa', 'standardmedia.co.ke', 'thecitizen.co.tz', 'monitor.co.ug',
  'premiumtimesng.com', 'punchng.com', 'vanguardngr.com', 'graphic.com.gh',
  'ewn.co.za', 'news24.com', 'mg.co.za', 'dailymaverick.co.za',
  'thehindu.com', 'indianexpress.com', 'thedailystar.net', 'dawn.com',
  'scmp.com', 'straitstimes.com', 'bangkokpost.com', 'jakartapost.com',
  'nst.com.my', 'inquirer.net', 'rappler.com', 'vnexpress.net',
  'folha.uol.com.br', 'globo.com', 'eltiempo.com', 'clarin.com',
  'jpost.com', 'arabnews.com', 'thenationalnews.com', 'dailysabah.com',
  'kyivindependent.com', 'themoscowtimes.com', 'japantimes.co.jp',
  'koreaherald.com', 'taipeitimes.com', 'focustaiwan.tw', 'rnz.co.nz',
  'abc.net.au', 'stuff.co.nz', 'fijitimes.com.fj'
];

function wireTier(domain){
  const d = String(domain || '').toLowerCase().replace(/^www\./, '');
  const on = list => list.some(x => d === x || d.endsWith('.' + x));
  if(on(WIRE_TIER1)) return 1;
  // any government or intergovernmental domain counts as primary
  if(/(^|\.)gov(\.|$)/.test(d) || d.endsWith('.int') || d.endsWith('.go.ke')
     || d.endsWith('.gouv.fr') || d.endsWith('.gob.mx')) return 1;
  if(on(WIRE_TIER2)) return 2;
  if(on(WIRE_TIER3)) return 3;
  return 0;                                   // not on the list: discarded
}

/* Headlines that are about a possibility, a denial or a rumour rather than a
   reported outbreak. */
/* Built from parts rather than written as one literal, because the obvious
   literal is subtly wrong: /\b(conspirac|alleged)\b/ never matches, since the
   trailing boundary falls inside "conspiracy" and "allegedly". Each pattern
   below carries its own suffix wildcard.

   "may" is matched only as an auxiliary verb — a bare \bmay\b would throw away
   every headline dated in May. */
const WIRE_SPECULATIVE = new RegExp([
  'rumou?rs?', 'conspirac\\w*', 'hoax(?:es)?', 'myths?', 'fears?', 'feared',
  'panic', 'scares?', 'alleged\\w*', 'unverified', 'unconfirmed', 'speculat\\w*',
  'could', 'might', 'would', 'may\\s+(?:be|have|become|spread|reach)',
  'possible', 'possibly', 'den(?:y|ies|ied|ial)', 'debunk\\w*',
  'false\\s+claims?', 'no\\s+cases', 'not\\s+an\\s+outbreak', 'free\\s+of',
  'ruled\\s+out', 'not\\s+confirmed'
].map(p => '\\b' + p + '\\b').join('|'), 'i');

function gdeltQuery(diseases){
  // GDELT understands quoted phrases and OR groups
  const terms = diseases.map(d => `"${d}"`).join(' OR ');
  return `(outbreak OR cases OR epidemic OR "cases reported") AND (${terms})`;
}

const sleep = ms => new Promise(done => setTimeout(done, ms));

async function gdeltSearch(query, allowRetry = true){
  const url = `${GDELT_API}?query=${encodeURIComponent(query)}`
            + `&mode=ArtList&maxrecords=${WIRE.maxRecords}&format=json`
            + `&timespan=${WIRE.windowDays * 24}h&sort=DateDesc`;
  const r = await fetch(url, { headers:{ accept:'application/json', 'user-agent':UA } });
  if(r.status === 429 && allowRetry){
    await sleep(WIRE.retryMs);
    return gdeltSearch(query, false);
  }
  if(!r.ok) throw new Error('HTTP ' + r.status + (r.status === 429 ? ' (rate limited)' : ''));

  // GDELT answers some errors with an HTML page and a 200, so check the body
  const body = await r.text();
  if(!body.trim().startsWith('{')) throw new Error('non-JSON response (GDELT error page)');
  const j = JSON.parse(body);
  return Array.isArray(j.articles) ? j.articles : [];
}

/* "20260914T121500Z" -> "2026-09-14" */
function gdeltDate(s){
  const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

async function fetchWire(){
  if(!WIRE.enabled) return { countries:{}, disabled:true };

  /* Split the disease list across a few queries so no single query gets too
     long for GDELT to parse. */
  const groups = [];
  const size = Math.ceil(DISEASE_WORDS.length / WIRE.queries);
  for(let i = 0; i < DISEASE_WORDS.length; i += size) groups.push(DISEASE_WORDS.slice(i, i + size));

  const articles = [];
  const failures = [];
  const plan = groups.slice(0, WIRE.queries);
  for(let i = 0; i < plan.length; i++){
    if(i) await sleep(WIRE.spacingMs);
    try{
      articles.push(...await gdeltSearch(gdeltQuery(plan[i])));
    }catch(err){
      failures.push(err.message);
    }
  }
  if(!articles.length){
    throw new Error('no articles returned' + (failures.length ? ' (' + failures[0] + ')' : ''));
  }

  /* The queries overlap — an article about cholera and measles comes back in
     two of them — so deduplicate by URL before counting anything. Otherwise
     the rejection statistics in _notes read several times too high. */
  const seenUrls = new Set();
  const unique = articles.filter(a => {
    const u = String(a.url || '');
    if(!u || seenUrls.has(u)) return false;
    seenUrls.add(u);
    return true;
  });

  /* Sort what came back into (country, disease) buckets, discarding as we go
     and counting why. */
  const buckets = new Map();
  const rejected = { domain:0, speculative:0, noDisease:0, noCountry:0, manyCountries:0 };

  for(const a of unique){
    const domain = String(a.domain || '').toLowerCase();
    const tier = wireTier(domain);
    if(!tier){ rejected.domain++; continue; }

    const title = String(a.title || '');
    if(WIRE_SPECULATIVE.test(title)){ rejected.speculative++; continue; }

    const disease = diseaseFromText(title);
    if(!disease){ rejected.noDisease++; continue; }

    const isos = scanForCountries(title);
    if(isos.length === 0){ rejected.noCountry++; continue; }
    if(isos.length > 1){ rejected.manyCountries++; continue; }

    const key = isos[0] + '|' + disease;
    const bucket = buckets.get(key) || { iso:isos[0], disease, domains:new Map(), best:null, newest:null };
    if(!bucket.domains.has(domain)) bucket.domains.set(domain, tier);

    const seen = gdeltDate(a.seendate);
    if(!bucket.newest || (seen && seen > bucket.newest)) bucket.newest = seen;
    if(!bucket.best || tier < bucket.best.tier){
      bucket.best = { tier, url:a.url, domain, title };
    }
    buckets.set(key, bucket);
  }

  /* Publish what clears corroboration. */
  const countries = {};
  const published = [];
  let thin = 0;

  const ranked = [...buckets.values()].sort((a, b) => b.domains.size - a.domains.size);
  for(const b of ranked){
    if(published.length >= WIRE.maxPerRun) break;

    const tiers = [...b.domains.values()];
    const hasPrimary = tiers.includes(1);
    if(b.domains.size < WIRE.minSources && !hasPrimary){ thin++; continue; }

    const outlets = [...b.domains.keys()];
    const entry = {
      name: b.disease,
      cases: null,                 // rule 2: the wire never publishes a number
      deaths: null,
      cfr: null,
      per100k: null,
      growth7d: null,
      severity: severityFor(b.disease, null, null),
      asOf: b.newest,
      source: `Press reports · ${outlets.length} source${outlets.length === 1 ? '' : 's'} `
            + `(${outlets.slice(0, 3).join(', ')}${outlets.length > 3 ? ', …' : ''}) `
            + `— reported, not counted`,
      url: b.best?.url || 'https://www.gdeltproject.org/',
      provisional: true
    };
    if(addIfNew(countries, b.iso, entry, 'low')){
      published.push(`${b.iso} ${b.disease} (${outlets.length})`);
    }
  }

  return {
    countries,
    read: unique.length,
    fetched: articles.length,
    buckets: buckets.size,
    published: published.length,
    thin,
    rejected,
    examples: published.slice(0, 6)
  };
}

/* ---------------------------------------------------------------------------
   4z. SANITY CHECK ON THE NUMBERS

   Bulletins are prose, and prose parsers pick up the wrong number sometimes.
   The Rwanda Marburg record was a live example: 202,466 cases against 15
   deaths, from a Disease Outbreak News item about an outbreak that had 66
   cases. The case count was some other figure in the same paragraph — contacts
   traced, samples tested, people vaccinated.

   A number that wrong is worse than no number: it topped the globe, drove the
   world severity index and made the drawer look authoritative about nonsense.

   The check is the case fatality rate. Marburg kills between a quarter and
   most of the people it infects; a Marburg record with a CFR of 0.007% is not
   a small outbreak, it is a parse error. So for the diseases whose lethality
   is well established, a case count that implies a CFR ten times below the
   floor is dropped. The deaths stay — those come from a plainer sentence and
   are usually right — and the record says what happened.
   --------------------------------------------------------------------------- */

const MIN_PLAUSIBLE_CFR = [
  [/marburg/i,                    10],
  [/\bebola\b|sudan virus|bundibugyo/i, 10],
  [/nipah/i,                      20],
  [/\brabies\b/i,                 50],
  [/mers|middle east respiratory/i, 10],
  [/crimean|\bcchf\b/i,            5],
  [/\bplague\b/i,                  2],
  [/h5n1|h5n5|h7n9|avian influenza/i, 10],
  [/lassa/i,                       0.5]
];

function sanityCheck(countries, admin1, notes){
  const dropped = [];

  const check = (where, rec) => {
    for(const d of rec.diseases || []){
      if(d.cases == null || d.deaths == null || d.cases <= 0) continue;
      const rule = MIN_PLAUSIBLE_CFR.find(([re]) => re.test(d.name));
      if(!rule) continue;

      const cfr = (d.deaths / d.cases) * 100;
      if(cfr >= rule[1] / 10) continue;          // an order of magnitude of slack

      dropped.push(`${where} ${d.name}: ${d.cases.toLocaleString()} cases vs `
        + `${d.deaths} deaths is a CFR of ${cfr.toFixed(3)}%, far below what this `
        + `disease does — case count dropped, deaths kept`);
      d.cases = null;
      d.cfr = null;
      d.per100k = null;
      d.provisional = true;
      d.severity = severityFor(d.name, null, d.deaths);
      d.source = (d.source || '') + ' — case count withheld as implausible';
    }
  };

  for(const [iso, rec] of Object.entries(countries)) check(iso, rec);
  for(const [key, rec] of Object.entries(admin1))   check(key, rec);

  for(const line of dropped) notes.push('Sanity check — ' + line);
  if(!dropped.length) notes.push('Sanity check: every case-to-death ratio looked plausible');
}

/* ---------------------------------------------------------------------------
   5. BASELINE
   Things the scraper cannot get yet, so the map is never empty. Delete a line
   here as soon as a real source starts supplying it.
   --------------------------------------------------------------------------- */

const BASELINE = {};   // NICD now supplies South Africa directly (§4g)

/* The drawer content used to live here as a three-disease stub. It now lives in
   guidance.js, which carries a full entry for every disease these adapters can
   emit and goes and builds one automatically for anything new. See §7 below. */

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
  let admin1 = {};

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

  try{
    const st = await fetchCDCStates();
    Object.assign(admin1, st.admin1);
    for(const [iso, rec] of Object.entries(st.territories || {})){
      for(const d of rec.diseases) addIfNew(countries, iso, d, 'high');
    }
    notes.push(`CDC states: matched ${st.matched} US states/jurisdictions, week ending ${st.newest}`);
    if(Object.keys(st.territories || {}).length){
      notes.push('CDC states: US territories filed as countries of their own: '
        + Object.keys(st.territories).join(', '));
    }
    notes.push(`CDC state columns detected: ${JSON.stringify(st.columns)}`);
    if(st.unmatchedLevels.length){
      notes.push(`CDC activity levels not recognised: ${st.unmatchedLevels.join(', ')}`);
    }
  }catch(err){
    notes.push('CDC states fetch failed: ' + err.message
      + ' | test it yourself: https://data.cdc.gov/resource/f3zz-zga5.json?$limit=3');
  }

  try{
    const za = await fetchNICD();
    Object.assign(admin1, za.admin1);
    notes.push(`NICD: matched ${za.matched} South African provinces (${za.disease}, `
      + `${za.used.scope}) from "${za.used.title.slice(0,60)}" dated ${za.used.date}`);
  }catch(err){
    notes.push('NICD fetch failed: ' + err.message
      + ' | test it yourself: https://www.nicd.ac.za/wp-json/wp/v2/posts?search=measles&per_page=3');
  }

  try{
    const emro = await fetchEMRO();
    let added = 0;
    for(const [iso, rec] of Object.entries(emro.countries)){
      for(const d of rec.diseases) if(addIfNew(countries, iso, d, rec.conf)) added++;
    }
    if(emro.published){
      notes.push(`WHO EMRO: parsed ${emro.parsed} rows across ${emro.matched} countries, `
        + `added ${added} (table stamped ${emro.asOf}, ${emro.ageDays} days old, via ${emro.via}; `
        + `${emro.noUpdate} rows from countries that did not report this period)`);
    } else {
      notes.push(`WHO EMRO: HIDDEN — the table is stamped ${emro.asOf || 'no date found'}`
        + (emro.ageDays != null ? ` (${emro.ageDays} days old)` : '')
        + `, past the ${EMRO_MAX_AGE_DAYS}-day limit, so its ${emro.parsed} rows across `
        + `${emro.matched} countries were NOT published. EMRO updates this table irregularly; `
        + `the adapter starts publishing on its own when they do. `
        + `Set EMRO_SHOW_STALE = true to publish it anyway. Source: ${emro.url}`);
    }
    if(emro.unmatched.length){
      notes.push(`EMRO names not in the ISO map: ${emro.unmatched.join(', ')}`);
    }
  }catch(err){
    notes.push('WHO EMRO fetch failed: ' + err.message
      + ' | test it yourself: https://www.emro.who.int/pandemic-epidemic-diseases/outbreaks/index.html');
  }

  try{
    const sit = await fetchEMROCountryReports();
    let added = 0;
    for(const [iso, rec] of Object.entries(sit.countries)){
      for(const d of rec.diseases) if(addIfNew(countries, iso, d, rec.conf)) added++;
    }
    for(const rep of sit.reports){
      if(rep.published){
        notes.push(`EMRO sitrep ${rep.label}: week ${rep.week ?? '?'} ending ${rep.asOf} `
          + `(${rep.ageDays}d old, dated via ${rep.dateVia}), read ${rep.diseases} diseases, `
          + `added ${added} records — ${rep.url}`);
      } else {
        notes.push(`EMRO sitrep ${rep.label}: HIDDEN — newest report is week ${rep.week ?? '?'} `
          + `ending ${rep.asOf}, ${rep.ageDays} days old, past the ${EMRO_REPORT_MAX_AGE_DAYS}-day limit. `
          + `The country office has stopped publishing weekly, or the index page moved.`);
      }
    }
    if(!sit.reports.length && !sit.problems.length){
      notes.push('EMRO sitreps: no countries enabled in EMRO_COUNTRY_REPORTS');
    }
    for(const p of sit.problems) notes.push('EMRO sitrep failed — ' + p);
  }catch(err){
    notes.push('EMRO sitreps fetch failed: ' + err.message);
  }

  try{
    const afro = await fetchAFRO();
    let added = 0;
    for(const [iso, rec] of Object.entries(afro.countries)){
      for(const d of rec.diseases) if(addIfNew(countries, iso, d, rec.conf)) added++;
    }
    if(afro.published){
      notes.push(`WHO AFRO bulletin: week ${afro.week ?? '?'} ending ${afro.asOf} `
        + `(${afro.ageDays}d old, dated via ${afro.dateVia}), read ${afro.parsed} events `
        + `across ${afro.matched} countries, added ${added} — ${afro.url}`);
    } else {
      notes.push(`WHO AFRO bulletin: HIDDEN — newest bulletin ends ${afro.asOf}, `
        + `${afro.ageDays} days old, past the ${AFRO_MAX_AGE_DAYS}-day limit. `
        + `It parsed ${afro.parsed} events; nothing was published.`);
    }
  }catch(err){
    notes.push('WHO AFRO bulletin failed: ' + err.message
      + ' | test it yourself: https://www.afro.who.int/outbreaks-and-emergencies-updates');
  }

  /* The advisory sources run last on purpose. addIfNew() drops anything a
     counting source has already reported for that country, so these two only
     ever fill gaps — they cannot overwrite a figure that came with a number. */

  try{
    const cdc = await fetchCDCNotices();
    let added = 0;
    for(const [iso, rec] of Object.entries(cdc.countries)){
      for(const d of rec.diseases) if(addIfNew(countries, iso, d, 'medium')) added++;
    }
    notes.push(`CDC travel notices: read ${cdc.notices} notices, matched `
      + `${cdc.matched} countries, added ${added} new records `
      + `(${cdc.records - added} already covered by a counting source; `
      + `${cdc.globalsRead} global notices expanded)`);
    if(cdc.unmatched.length){
      notes.push(`CDC notices with no country or disease matched: ${cdc.unmatched.join(' | ')}`);
    }
  }catch(err){
    notes.push('CDC travel notices fetch failed: ' + err.message
      + ' | test it yourself: https://wwwnc.cdc.gov/travel/rss/notices.xml');
  }

  try{
    const rw = await fetchReliefWeb();
    let added = 0;
    for(const [iso, rec] of Object.entries(rw.countries)){
      for(const d of rec.diseases) if(addIfNew(countries, iso, d, 'low')) added++;
    }
    notes.push(`ReliefWeb: read ${rw.reports} reports (query ${rw.usedAttempt}), matched `
      + `${rw.matched} countries, added ${added} new records`);
    if(rw.skipped.length){
      notes.push(`ReliefWeb reports with no disease or country matched: ${rw.skipped.join(' | ')}`);
    }
  }catch(err){
    notes.push('ReliefWeb fetch failed: ' + err.message
      + ' | test it yourself: https://api.reliefweb.int/v2/reports?appname=pandemic-tracker&limit=2'
      + ' | if it says the appname is unknown, register one at https://apidoc.reliefweb.int/');
  }

  /* The press wire runs after everything else, so corroborated coverage only
     ever fills a silence no counting source could. */
  try{
    const wire = await fetchWire();
    if(wire.disabled){
      notes.push('Press wire: disabled (WIRE.enabled = false)');
    } else {
      let added = 0;
      for(const [iso, rec] of Object.entries(wire.countries)){
        for(const d of rec.diseases) if(addIfNew(countries, iso, d, 'low')) added++;
      }
      const rej = wire.rejected;
      notes.push(`Press wire: read ${wire.read} articles, ${wire.buckets} country-disease `
        + `pairs, published ${added} (${wire.thin} dropped for having only one source). `
        + `Discarded: ${rej.domain} off-allowlist, ${rej.speculative} speculative, `
        + `${rej.noDisease} no disease named, ${rej.noCountry + rej.manyCountries} no single country. `
        + `No case counts are taken from press reporting.`);
      if(wire.examples.length) notes.push('Press wire published: ' + wire.examples.join(' | '));
    }
  }catch(err){
    notes.push('Press wire failed: ' + err.message
      + ' | test it yourself: https://api.gdeltproject.org/api/v2/doc/doc?query=cholera%20outbreak&mode=ArtList&format=json&timespan=48h');
  }

  // merge the baseline in without overwriting anything live
  for(const [iso, rec] of Object.entries(BASELINE)){
    if(!countries[iso]) countries[iso] = rec;
  }

  /* Two passes over the finished payload, before anything is published:
     one so every record sits on a code the globe can draw, one so no record
     carries a number the disease could not possibly produce. */
  normaliseCodes(countries, admin1, notes);
  sanityCheck(countries, admin1, notes);

  /* -------------------------------------------------------------------------
     7. GUIDANCE — the bottom-right drawer

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
