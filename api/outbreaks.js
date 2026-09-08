/* ===========================================================================
   api/outbreaks.js  —  THE BACKEND SCRAPER
   ---------------------------------------------------------------------------
   Runs on Vercel's servers, not in the browser. That matters: browsers are
   blocked from calling WHO directly (CORS), servers are not.

   Visit /api/outbreaks in your browser to see what it produces. Read the
   `_notes` array at the bottom of that response before you touch anything:
   every adapter reports what it matched, what it could not resolve, and a URL
   you can paste into a browser to check the source yourself.

   TEN SOURCES, grouped by what they are for:

     global reach     WHO Disease Outbreak News      §4a
                      CDC Travel Health Notices      §4h   ← graded 1-4
                      ReliefWeb (OCHA)               §4i   ← ISO-tagged
     regional depth   ECDC ERVISS       Europe       §4b
                      WHO FluNet        influenza    §4c
                      PAHO ARBO         Americas     §4d
                      Africa CDC        Africa       §4e
     subnational      US CDC            US states    §4f
                      NICD              ZA provinces §4g
     endemic baseline WHO GHO           annual        §4j   ← never painted

   The first three exist because the middle four leave holes. WHO only covers
   what it publishes a bulletin about; ERVISS is Europe; PAHO is the Americas
   and nothing else; Africa CDC is Africa; FluNet is influenza everywhere but
   only influenza. Everything else — most of Asia, the Pacific, Central Asia,
   Russia, Türkiye — depended on WHO happening to write about it. §4h and §4i
   are what closed that.

   §4k carries the WHO surfaces that CANNOT be read programmatically — the
   Health Emergency Dashboard, the Weekly Epidemiological Record, the
   per-disease dashboards and EIOS — as a linked attribution layer. Read the
   comment there before trying to turn any of them into a feed.

   Vercel caches the response for 6 hours, so each agency gets hit a few times
   a day no matter how many people visit the site.
   =========================================================================== */

import { buildGuidance, collectDiseaseNames } from './_guidance.js';

const CACHE_HOURS = 6;

/* One identity string for every outbound request. Agencies are more tolerant
   of a scraper that says who it is. Put a real address in before you hand the
   project in — several of these sites publish a contact policy that asks. */
const UA = 'PandemicTracker/2.0 (student project; contact: YOUR_EMAIL_HERE)';
const UA_HEADERS = { 'user-agent': UA };

/* No single fetch may hold the whole response hostage. Each adapter gets its
   own budget; whatever has not answered by then is dropped and reported in
   _notes. Vercel kills the function at 60s (see vercel.json), so the sum of
   these has to stay comfortably under that even in the worst case — which it
   does, because §6 runs them all at the same time rather than one after
   another. */
const ADAPTER_TIMEOUT_MS = 20000;

/* GHO gets longer. Its indicator catalogue is a single large document and
   the per-indicator pulls are wide, but it never blocks the map: baseline is
   context, so if it misses the deadline the globe is unaffected. */
const GHO_TIMEOUT_MS = 28000;

/* ---------------------------------------------------------------------------
   1. COUNTRY NAMES → ISO CODES

   WHO writes "Democratic Republic of the Congo". The map needs "COD".
   Add a line here any time the log says a country was skipped.

   ⚠ THE CODES HERE ARE NATURAL EARTH's `ADM0_A3`, NOT ISO 3166.

   They agree for almost every country, but not all of them, and the globe
   joins on whatever `isoOf()` in index.html pulls off the GeoJSON feature —
   which is ADM0_A3 first. Two of these used to be wrong, so the records were
   built correctly and then silently never painted:

       South Sudan   ISO says SSD,  Natural Earth says SDS
       Kosovo        ISO says XKX,  Natural Earth says KOS

   Both are fixed below. If you ever add a country and it refuses to colour in,
   this is the first thing to check: open the GeoJSON, find the feature, and
   read its ADM0_A3 rather than trusting the ISO standard.
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
  'south sudan':'SDS','republic of south sudan':'SDS',   // Natural Earth: SDS, not SSD
  'sudan':'SDN','togo':'TGO','tunisia':'TUN','uganda':'UGA',
  'united republic of tanzania':'TZA','tanzania':'TZA','zambia':'ZMB','zimbabwe':'ZWE',
  'sao tome and principe':'STP','são tomé and príncipe':'STP','sao tome':'STP',
  'somaliland':'SOL','western sahara':'SAH','saint helena':'SHN',

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
  'uae':'ARE','uzbekistan':'UZB','viet nam':'VNM','vietnam':'VNM','yemen':'YEM',
  /* Added in the final coverage pass — every one of these was structurally
     invisible before, because no adapter could resolve the name. */
  'armenia':'ARM','azerbaijan':'AZE','bahrain':'BHR',
  'north korea':'PRK',"democratic people's republic of korea":'PRK','dprk':'PRK',
  'korea':'KOR','hong kong':'HKG','hong kong sar':'HKG','macau':'MAC','macao':'MAC',
  'palestine':'PSX','state of palestine':'PSX','west bank and gaza':'PSX','gaza':'PSX',
  'occupied palestinian territory':'PSX',

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
  'kosovo':'KOS',                                        // Natural Earth: KOS, not XKX
  'united kingdom':'GBR','united kingdom of great britain and northern ireland':'GBR',
  'england':'GBR','scotland':'GBR','wales':'GBR','northern ireland':'GBR',
  'andorra':'AND','liechtenstein':'LIE','monaco':'MCO','san marino':'SMR',
  'holy see':'VAT','vatican city':'VAT','greenland':'GRL','faroe islands':'FRO',
  'isle of man':'IMN','guernsey':'GGY','jersey':'JEY','gibraltar':'GIB',
  'northern cyprus':'CYN','north cyprus':'CYN',

  // Americas
  /* ⚠ GUF, MTQ, GLP, REU and MYT resolve, but will not colour in. Natural
     Earth's 110m country file folds the French overseas departments into
     FRA, so there is no polygon to paint. They are kept because they cost
     nothing and the moment the globe moves to the 50m file they start
     working; WHO's "Chikungunya – La Réunion and Mayotte" bulletins are the
     reason this matters. Do not "fix" it by pointing them at FRA — that would
     turn mainland France red for an outbreak 9,000 km away. */
  'argentina':'ARG','puerto rico':'PRI','french guiana':'GUF','martinique':'MTQ','guadeloupe':'GLP','bahamas':'BHS','barbados':'BRB','belize':'BLZ','bolivia':'BOL',
  'bolivia (plurinational state of)':'BOL','brazil':'BRA','canada':'CAN','chile':'CHL',
  'colombia':'COL','costa rica':'CRI','cuba':'CUB','dominican republic':'DOM',
  'ecuador':'ECU','el salvador':'SLV','guatemala':'GTM','guyana':'GUY','haiti':'HTI',
  'honduras':'HND','jamaica':'JAM','mexico':'MEX','nicaragua':'NIC','panama':'PAN',
  'paraguay':'PRY','peru':'PER','suriname':'SUR','trinidad and tobago':'TTO',
  'united states of america':'USA','united states':'USA','uruguay':'URY',
  'venezuela':'VEN','venezuela (bolivarian republic of)':'VEN',
  /* The eastern Caribbean is where measles and dengue alerts land first and
     where nothing was resolving before. */
  'antigua and barbuda':'ATG','dominica':'DMA','grenada':'GRD',
  'saint kitts and nevis':'KNA','st kitts and nevis':'KNA',
  'saint lucia':'LCA','st lucia':'LCA',
  'saint vincent and the grenadines':'VCT','st vincent and the grenadines':'VCT',
  'aruba':'ABW','curacao':'CUW','curaçao':'CUW','sint maarten':'SXM',
  'bermuda':'BMU','cayman islands':'CYM','turks and caicos islands':'TCA',
  'british virgin islands':'VGB','united states virgin islands':'VIR',
  'us virgin islands':'VIR','anguilla':'AIA','montserrat':'MSR',
  'falkland islands':'FLK','saint pierre and miquelon':'SPM',

  // Oceania
  'australia':'AUS','fiji':'FJI','new zealand':'NZL','papua new guinea':'PNG',
  'samoa':'WSM','solomon islands':'SLB','vanuatu':'VUT',
  /* The Pacific was completely dark. Measles and dengue move through these
     islands fast and they show up in CDC travel notices and ReliefWeb. */
  'american samoa':'ASM','cook islands':'COK','french polynesia':'PYF',
  'guam':'GUM','kiribati':'KIR','marshall islands':'MHL',
  'micronesia':'FSM','federated states of micronesia':'FSM',
  'nauru':'NRU','new caledonia':'NCL','niue':'NIU',
  'northern mariana islands':'MNP','palau':'PLW','tokelau':'TKL',
  'tonga':'TON','tuvalu':'TUV','wallis and futuna':'WLF'
};

/* ---------------------------------------------------------------------------
   1b. ISO 3166 → NATURAL EARTH

   Some sources hand over a code rather than a name — ReliefWeb tags every
   report with a proper ISO 3166 alpha-3. Those go through here so they land in
   the same key space as everything else. Only the codes that actually differ
   need a line; everything else passes through unchanged.
   --------------------------------------------------------------------------- */

const ISO3_TO_NE = {
  SSD:'SDS',   // South Sudan
  XKX:'KOS', XKO:'KOS',   // Kosovo
  PSE:'PSX',   // Palestine
  ESH:'SAH',   // Western Sahara
  SHN:'SHN'
};

function neCode(iso3){
  if(!iso3) return null;
  const up = String(iso3).toUpperCase().trim();
  if(!/^[A-Z]{3}$/.test(up)) return null;
  return ISO3_TO_NE[up] || up;
}

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

/* ---------------------------------------------------------------------------
   3c. MERGING TWO SOURCES THAT REPORT THE SAME THING

   Every adapter used to push straight onto `countries[iso].diseases`, which
   meant a country covered twice ended up with the disease listed twice — and
   the front end's aggregateDiseases() then added the two case counts together
   and counted the country twice in its rollup. Adding two more global sources
   would have made that much worse, so everything now goes through here.

   The rule, in order:
     1. a record carrying case numbers beats one that carries none;
     2. failing that, the more recent `asOf` wins;
     3. the loser's severity is still honoured — the worst assessment of a
        disease stands, even if the record it came from was thinner. A CDC
        Level 3 advisory should not be quietly softened by a stale bulletin
        that happened to have a number in it.
   --------------------------------------------------------------------------- */

function mergeCountry(countries, iso, entry, conf = 'medium'){
  if(!iso || !entry || !entry.name) return;

  if(!countries[iso]) countries[iso] = { conf, diseases: [] };
  const rec = countries[iso];

  const key = entry.name.trim().toLowerCase();
  const at  = rec.diseases.findIndex(d => String(d.name).trim().toLowerCase() === key);

  if(at === -1){ rec.diseases.push(entry); return; }

  const old = rec.diseases[at];
  const worst = Math.max(old.severity ?? 0, entry.severity ?? 0);

  const oldHasNumbers = old.cases   != null;
  const newHasNumbers = entry.cases != null;

  let winner;
  if(newHasNumbers !== oldHasNumbers)      winner = newHasNumbers ? entry : old;
  else if((entry.asOf || '') > (old.asOf || '')) winner = entry;
  else                                     winner = old;

  rec.diseases[at] = { ...winner, severity: worst };
}

/* Bulk form, for adapters that hand back a whole { iso: {conf, diseases} }. */
function mergeAll(countries, incoming, conf){
  for(const [iso, rec] of Object.entries(incoming || {})){
    for(const d of rec.diseases || []) mergeCountry(countries, iso, d, rec.conf || conf);
  }
}

/* ---------------------------------------------------------------------------
   4. SOURCE: WHO DISEASE OUTBREAK NEWS
   The only agency source that is already a proper JSON API.
   --------------------------------------------------------------------------- */

async function fetchWHO(){
  const url = 'https://www.who.int/api/news/diseaseoutbreaknews'
            + '?$orderby=PublicationDateAndTime%20desc&$top=80';

  const r = await fetch(url, {
    headers: { 'accept': 'application/json', 'user-agent': UA }
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
        headers: UA_HEADERS
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
        headers: UA_HEADERS
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
  const headers = UA_HEADERS;
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
        headers: UA_HEADERS
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
  const headers = UA_HEADERS;

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
   4h. SOURCE: CDC TRAVEL HEALTH NOTICES  (fills the whole world)

   Everything above this point is regional. WHO covers whatever it happens to
   publish a bulletin about, ERVISS covers Europe, PAHO the Americas, Africa
   CDC Africa, and FluNet covers influenza and nothing else. That left roughly
   sixty countries — most of Asia, all of the Pacific, Russia, Türkiye,
   Australia — with no adapter at all. They only ever appeared if WHO happened
   to name them.

   This closes that. CDC's travel notices are:

     · global by design — the whole point is to cover everywhere Americans go;
     · public domain, so no licence to worry about;
     · keyless, and published as RSS, so no scraping fragility;
     · already graded 1–4, which drops straight onto the severity ramp.

       https://wwwnc.cdc.gov/travel/rss/notices.xml

   The catch is that a notice is an ASSESSMENT, not a case count — "Level 2:
   Dengue in Sri Lanka" tells you it is bad, not how bad in numbers. So these
   records carry `cases: null` and lose to any source that has real figures,
   which is exactly what mergeCountry() arranges. What they contribute is the
   floor: a country nobody else covers stops being grey.

   Notices titled "Global Measles" name no country in the title. The body text
   lists the affected ones, so the same country scanner the WHO multi-country
   bulletins use is pointed at it. If a notice names nothing, it is dropped
   rather than smeared across the map.
   --------------------------------------------------------------------------- */

const CDC_TRAVEL_RSS = 'https://wwwnc.cdc.gov/travel/rss/notices.xml';

/* CDC ran on words before it ran on numbers, and old notices are still live. */
const CDC_WORD_LEVEL = { watch: 1, alert: 2, warning: 3 };

/* A notice level is a judgement about travel, so it maps onto the index as a
   bump rather than a value: the disease still sets the floor. */
const CDC_LEVEL_BUMP = { 1: 0, 2: 8, 3: 18, 4: 30 };

/* Longest and most specific first — "Avian influenza" has to be tested before
   plain "influenza", and "Sudan virus" before "Sudan" can be read as a place.
   The right-hand side is the exact key the curated library uses, so a match
   here lands on a real drawer entry instead of the automatic lookup. */
const GLOBAL_DISEASE_WORDS = [
  [/avian influenza|bird flu|h5n1|h5n5|h9n2|h7n9/i,        'Avian influenza A(H5N1)'],
  [/middle east respiratory|\bmers\b/i,                     'Middle East respiratory syndrome'],
  [/crimean[- ]congo/i,                                     'Crimean-Congo haemorrhagic fever'],
  [/sudan virus|sudan ebolavirus/i,                         'Sudan virus disease'],
  [/bundibugyo/i,                                           'Ebola (Bundibugyo virus)'],
  [/marburg/i,                                              'Marburg virus disease'],
  [/\bebola\b/i,                                            'Ebola'],
  [/\blassa\b/i,                                            'Lassa fever'],
  [/rift valley/i,                                          'Rift Valley fever'],
  [/\bnipah\b/i,                                            'Nipah virus infection'],
  [/oropouche/i,                                            'Oropouche fever'],
  [/japanese encephalitis/i,                                'Japanese encephalitis'],
  [/tick[- ]borne encephalitis/i,                           'Tick-borne encephalitis'],
  [/west nile/i,                                            'West Nile fever'],
  [/yellow fever/i,                                         'Yellow fever'],
  [/\bdengue\b/i,                                           'Dengue'],
  [/chikungunya/i,                                          'Chikungunya'],
  [/\bzika\b/i,                                             'Zika virus disease'],
  [/\bmalaria\b/i,                                          'Malaria'],
  [/\bcholera\b/i,                                          'Cholera'],
  [/\bmeasles\b|rubeola/i,                                  'Measles'],
  [/\brubella\b/i,                                          'Rubella'],
  [/\bmumps\b/i,                                            'Mumps'],
  [/diphtheria/i,                                           'Diphtheria'],
  [/pertussis|whooping cough/i,                             'Pertussis'],
  [/poliomyel|\bpolio\b|poliovirus/i,                       'Polio'],
  [/mpox|monkeypox/i,                                       'Mpox'],
  [/meningococcal|meningitis/i,                             'Meningococcal disease'],
  [/hepatitis a\b/i,                                        'Hepatitis A'],
  [/hepatitis e\b/i,                                        'Hepatitis E'],
  [/typhoid|enteric fever/i,                                'Typhoid fever'],
  [/leptospirosis/i,                                        'Leptospirosis'],
  [/melioidosis/i,                                          'Melioidosis'],
  [/scrub typhus/i,                                         'Scrub typhus'],
  [/legionell/i,                                            'Legionellosis'],
  [/\bplague\b/i,                                           'Plague'],
  [/anthrax/i,                                              'Anthrax'],
  [/\brabies\b/i,                                           'Rabies'],
  [/guinea[- ]worm|dracunculiasis/i,                        'Guinea-worm disease'],
  [/hand,? foot,? and mouth/i,                              'Hand, foot and mouth disease'],
  [/\bcovid|sars-cov-2/i,                                   'COVID-19'],
  [/respiratory syncytial|\brsv\b/i,                        'Respiratory syncytial virus'],
  [/\binfluenza\b|\bflu\b/i,                                'Influenza'],
  [/tuberculosis|\btb\b/i,                                  'Tuberculosis'],
  [/\bhantavirus\b/i,                                       'Hantavirus'],
  [/leishmania/i,                                           'Leishmaniasis']
];

function diseaseFromTitle(...texts){
  for(const text of texts){
    if(!text) continue;
    for(const [re, name] of GLOBAL_DISEASE_WORDS){
      if(re.test(text)) return name;
    }
  }
  return null;
}

/* --- the smallest XML reader that will do the job -------------------------
   RSS and Atom both wrap each notice in a repeating element, so pulling the
   blocks out and then reading named tags inside them is enough. No parser
   dependency, and nothing here can be tripped by a malformed feed — a tag it
   cannot read comes back as an empty string. */

function feedItems(xml){
  const out = [];
  const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m;
  while((m = re.exec(xml)) !== null) out.push(m[0]);
  return out;
}

function unwrap(s){
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tagText(block, name){
  const m = new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i').exec(block);
  return m ? stripTags(unwrap(m[1])).trim() : '';
}

function itemLink(block){
  const plain = tagText(block, 'link');
  if(plain) return plain;
  const href = /<link\b[^>]*href=["']([^"']+)["']/i.exec(block);   // Atom style
  return href ? unwrap(href[1]) : '';
}

function cdcLevel(title, body, link){
  const numbered = /level\s*[-:]?\s*([1-4])\b/i.exec(title + ' ' + body);
  if(numbered) return +numbered[1];

  const fromPath = /\/notices\/(?:level)?([1-4])\b/i.exec(link);
  if(fromPath) return +fromPath[1];

  const word = /\b(watch|alert|warning)\b/i.exec(link + ' ' + title);
  if(word) return CDC_WORD_LEVEL[word[1].toLowerCase()];

  return 1;                       // unlabelled notices are treated as the mildest
}

async function fetchCDCTravel(){
  const r = await fetch(CDC_TRAVEL_RSS, {
    headers: { ...UA_HEADERS, accept: 'application/rss+xml, application/xml, text/xml' }
  });
  if(!r.ok) throw new Error('CDC travel notices returned ' + r.status);

  const xml = await r.text();
  const items = feedItems(xml);
  if(!items.length) throw new Error('feed parsed but held no <item> elements');

  const countries = {};
  const unresolved = [];
  const levels = {};
  let matched = 0, global = 0;

  for(const block of items){
    const title = tagText(block, 'title');
    const body  = tagText(block, 'description') || tagText(block, 'summary');
    const link  = itemLink(block) || 'https://wwwnc.cdc.gov/travel/notices';
    const date  = (tagText(block, 'pubDate') || tagText(block, 'updated') || '').trim();

    const disease = diseaseFromTitle(title, body);
    if(!disease){ unresolved.push(title.slice(0, 60)); continue; }

    const level = cdcLevel(title, body, link);
    levels[level] = (levels[level] || 0) + 1;

    /* A notice about one country names it in the title; a global notice names
       a list of them in the body. Reading both covers each case, and the
       scanner consumes long names before short ones so "Papua New Guinea"
       cannot be read as "Guinea". */
    const hits = scanForCountries(title + ' ' + body);
    if(!hits.length){ global++; continue; }

    const asOf = date ? new Date(date).toISOString().slice(0, 10) : null;
    const sev  = Math.min(100, severityFor(disease, null, null) + (CDC_LEVEL_BUMP[level] || 0));

    for(const iso of hits){
      mergeCountry(countries, iso, {
        name: disease,
        cases: null, deaths: null, cfr: null, per100k: null, growth7d: null,
        severity: sev,
        asOf: Number.isNaN(Date.parse(date)) ? null : asOf,
        source: `CDC Travel Health Notice — Level ${level}`,
        url: link,
        provisional: true
      }, 'medium');
      matched++;
    }
  }

  return {
    countries,
    matched: Object.keys(countries).length,
    records: matched,
    notices: items.length,
    global,
    levels,
    unresolved: [...new Set(unresolved)].slice(0, 8)
  };
}

/* ---------------------------------------------------------------------------
   4i. SOURCE: RELIEFWEB  (fills Asia, Central Asia and the Pacific)

   CDC's notices are graded but sparse — a country with a real outbreak and no
   travel implication may carry no notice at all. ReliefWeb is the opposite: it
   is an OCHA-run index of situation reports from WHO country offices,
   ministries of health, MSF, IFRC and the rest, and it is unusually strong in
   exactly the places the other adapters miss — Afghanistan, Bangladesh,
   Myanmar, Yemen, Pakistan, the Pacific islands.

       https://api.reliefweb.int/v1/reports

   Two things make it easy to use. It is a real JSON API with no key, and every
   report is already tagged with its country's ISO 3166 code, so there is no
   name matching to get wrong — the codes go through neCode() and land in the
   Natural Earth key space directly.

   What it does not give is structure: a report is a document, and its title is
   the only reliably parseable thing on it. So the title has to name a disease
   or the report is ignored, and reports older than the window below are never
   requested. Anything that survives both filters is a genuine signal that
   somebody official is writing about an outbreak there this month.
   --------------------------------------------------------------------------- */

const RW_WINDOW_DAYS = 90;

function reliefWebURL(){
  const since = new Date(Date.now() - RW_WINDOW_DAYS * 86400000)
                  .toISOString().slice(0, 10) + 'T00:00:00+00:00';

  return 'https://api.reliefweb.int/v1/reports'
    + '?appname=pandemic-tracker'
    + '&limit=200'
    + '&sort[]=date.created:desc'
    + '&fields[include][]=title'
    + '&fields[include][]=date.created'
    + '&fields[include][]=url'
    + '&fields[include][]=primary_country.iso3'
    + '&fields[include][]=primary_country.name'
    + '&fields[include][]=source.shortname'
    + '&filter[operator]=AND'
    + '&filter[conditions][0][field]=theme.name'
    + '&filter[conditions][0][value]=Health'
    + '&filter[conditions][1][field]=date.created'
    + '&filter[conditions][1][value][from]=' + encodeURIComponent(since);
}

/* If the conditions syntax is ever rejected, a plain keyword search over
   titles still returns the same kind of document. Worth having: the whole
   point of this adapter is the countries nobody else reaches. */
const RW_FALLBACK =
  'https://api.reliefweb.int/v1/reports'
  + '?appname=pandemic-tracker&limit=200&sort[]=date.created:desc'
  + '&query[value]=' + encodeURIComponent('outbreak OR epidemic OR "cases reported"')
  + '&query[fields][]=title'
  + '&fields[include][]=title&fields[include][]=date.created&fields[include][]=url'
  + '&fields[include][]=primary_country.iso3&fields[include][]=primary_country.name'
  + '&fields[include][]=source.shortname';

async function fetchReliefWeb(){
  let data = null, via = 'filtered', lastErr = null;

  for(const [url, label] of [[reliefWebURL(), 'filtered'], [RW_FALLBACK, 'keyword fallback']]){
    try{
      const r = await fetch(url, { headers: { ...UA_HEADERS, accept: 'application/json' } });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if(Array.isArray(j?.data)){ data = j.data; via = label; break; }
      throw new Error('response had no data array');
    }catch(err){ lastErr = err; }
  }

  if(!data) throw new Error(lastErr ? lastErr.message : 'no response');

  const countries = {};
  const unresolved = [];
  let records = 0, noDisease = 0, noCountry = 0;

  for(const row of data){
    const f = row.fields || {};
    const title = String(f.title || '').trim();
    if(!title) continue;

    const disease = diseaseFromTitle(title);
    if(!disease){ noDisease++; continue; }

    /* Only the PRIMARY country. Reports are often tagged with a dozen
       countries for filing reasons, and honouring all of them would paint a
       continent off one document. */
    const raw = f.primary_country?.iso3;
    const iso = neCode(raw);
    if(!iso){
      noCountry++;
      if(raw) unresolved.push(String(raw).toUpperCase());
      continue;
    }

    const cases  = findCases(title);
    const deaths = findDeaths(title);
    const asOf   = String(f.date?.created || '').slice(0, 10) || null;
    const who    = f.source?.[0]?.shortname || f.source?.shortname || 'ReliefWeb';

    mergeCountry(countries, iso, {
      name: disease,
      cases, deaths,
      cfr: (cases && deaths && cases > 20) ? +(deaths / cases * 100).toFixed(1) : null,
      per100k: null, growth7d: null,
      severity: severityFor(disease, cases, deaths),
      asOf,
      source: `ReliefWeb — ${who}`,
      url: f.url || 'https://reliefweb.int/updates',
      provisional: true
    }, 'low');
    records++;
  }

  return {
    countries,
    matched: Object.keys(countries).length,
    records, reports: data.length, noDisease, noCountry, via,
    unresolved: [...new Set(unresolved)].slice(0, 8)
  };
}

/* ---------------------------------------------------------------------------
   4j. SOURCE: WHO GLOBAL HEALTH OBSERVATORY  (the endemic baseline)

   This one does NOT colour the map, and that is the point of it.

   Everything above reports EVENTS: a bulletin, an alert, a notice. Events are
   published where somebody is looking, which is why the globe has always had
   a bias built into it — a country with good surveillance lights up, and a
   country with none stays blank and reads as safe. Chad looking calmer than
   France is an artefact of who files reports, not of where disease is.

   GHO is the other half of the picture. It is WHO's own statistical database,
   it is a documented public OData API with no key:

       https://ghoapi.azureedge.net/api/Indicator      list every indicator
       https://ghoapi.azureedge.net/api/{code}         the rows for one

   and it carries each member state's ANNUAL reported case totals for the
   notifiable diseases. That is slow data — a year or two behind, sometimes
   more — so putting it in `diseases[]` would light half the world permanently
   red off numbers from 2023. It goes in a separate `baseline` field that the
   interface shows in the panel and never paints from.

   What that buys: a country with nothing in `diseases` can now say either
   "nothing reported, and WHO's last annual return was 4,100 cholera cases"
   or "nothing reported, and no annual return either." Those are very
   different statements and the map used to render them identically.

   The indicator CODES are discovered at runtime rather than hard-coded. WHO
   renumbers them between releases, and a hard-coded code that quietly 404s is
   the kind of failure nobody notices for a month. This asks WHO what it has,
   matches on the indicator NAME, and reports in _notes what it matched.
   --------------------------------------------------------------------------- */

const GHO_BASE = 'https://ghoapi.azureedge.net/api';

/* Oldest annual return worth showing. Past this it is history, not baseline. */
const GHO_MIN_YEAR = new Date().getUTCFullYear() - 6;

/* Indicator names to look for, and the disease name to file the result under.
   Matched against IndicatorName, case-insensitively, first hit wins. The GHO
   immunization module publishes most of these as "<Disease> - number of
   reported cases", which is why that shape appears so often. */
const GHO_WANTED = [
  [/^cholera\b.*reported cases|number of reported cases of cholera/i, 'Cholera'],
  [/^measles\b.*reported cases/i,                                     'Measles'],
  [/^diphtheria\b.*reported cases/i,                                  'Diphtheria'],
  [/^pertussis\b.*reported cases/i,                                   'Pertussis'],
  [/^(polio|poliomyelitis)\b.*reported cases/i,                       'Polio'],
  [/^(japanese encephalitis)\b.*reported cases/i,                     'Japanese encephalitis'],
  [/^(mumps)\b.*reported cases/i,                                     'Mumps'],
  [/^(rubella)\b.*reported cases/i,                                   'Rubella'],
  [/^(yellow fever)\b.*reported cases/i,                              'Yellow fever'],
  [/^(neonatal tetanus|total tetanus)\b.*reported cases/i,            'Tetanus'],
  [/number of (new and relapse )?tuberculosis cases|tuberculosis.*notified/i, 'Tuberculosis'],
  [/estimated number of malaria cases|malaria.*number of.*cases/i,    'Malaria']
];

/* Six is enough to be useful and keeps the request count sane. */
const GHO_MAX_INDICATORS = 6;

async function ghoJSON(url){
  const r = await fetch(url, { headers: { ...UA_HEADERS, accept: 'application/json' } });
  if(!r.ok) throw new Error('GHO returned ' + r.status);
  const j = await r.json();
  if(!Array.isArray(j?.value)) throw new Error('GHO response had no value array');
  return j.value;
}

async function fetchWHOBaseline(){
  /* --- 1. ask WHO what it publishes, rather than assuming --- */
  const catalogue = await ghoJSON(`${GHO_BASE}/Indicator`);

  const picked = [];
  const seen = new Set();
  for(const [re, disease] of GHO_WANTED){
    if(picked.length >= GHO_MAX_INDICATORS) break;
    const hit = catalogue.find(i =>
      !seen.has(i.IndicatorCode) && re.test(String(i.IndicatorName || '')));
    if(hit){
      seen.add(hit.IndicatorCode);
      picked.push({ code: hit.IndicatorCode, label: hit.IndicatorName, disease });
    }
  }

  if(!picked.length) throw new Error(`none of the wanted indicators are in GHO's catalogue of ${catalogue.length}`);

  /* --- 2. pull the recent rows for each, all at once --- */
  const results = await Promise.allSettled(picked.map(async p => {
    const url = `${GHO_BASE}/${encodeURIComponent(p.code)}`
              + `?$filter=SpatialDimType%20eq%20%27COUNTRY%27%20and%20TimeDim%20ge%20${GHO_MIN_YEAR}`;
    return { ...p, rows: await ghoJSON(url) };
  }));

  /* --- 3. keep only the newest year each country actually reported --- */
  const baseline = {};
  const used = [];
  const failed = [];

  for(let i = 0; i < results.length; i++){
    const r = results[i];
    if(r.status !== 'fulfilled'){ failed.push(picked[i].disease); continue; }

    const { disease, label, code, rows } = r.value;
    const newest = new Map();          // iso -> row

    for(const row of rows){
      if(row.SpatialDimType !== 'COUNTRY') continue;
      const iso = neCode(row.SpatialDim);
      const year = Number(row.TimeDim);
      const val = row.NumericValue;
      if(!iso || !Number.isFinite(year) || val == null) continue;

      const prev = newest.get(iso);
      if(!prev || year > Number(prev.TimeDim)) newest.set(iso, row);
    }

    for(const [iso, row] of newest){
      if(!baseline[iso]) baseline[iso] = [];
      baseline[iso].push({
        name: disease,
        cases: Math.round(Number(row.NumericValue)),
        year: Number(row.TimeDim),
        source: `WHO Global Health Observatory — ${label}`,
        url: `https://www.who.int/data/gho/data/indicators/indicator-details/GHO/${encodeURIComponent(code)}`
      });
    }

    used.push(`${disease} (${code}, ${newest.size} countries)`);
  }

  /* Biggest number first, so the panel leads with what matters. */
  for(const iso of Object.keys(baseline)){
    baseline[iso].sort((a, b) => (b.cases || 0) - (a.cases || 0));
    baseline[iso] = baseline[iso].slice(0, 6);
  }

  return {
    baseline,
    countries: Object.keys(baseline).length,
    catalogue: catalogue.length,
    used, failed
  };
}

/* ---------------------------------------------------------------------------
   4k. THE OFFICIAL WHO SURFACES

   ⚠ READ THIS BEFORE ASKING WHY THESE ARE LINKS AND NOT FEEDS.

   Four things people reasonably assume are scrapeable are not:

     WHO Health Emergency Dashboard   extranet.who.int/publicemergency
       An Esri front end. There is no documented public API behind it, and the
       page's own notice says it is a SUBSET of events reported through IHR
       channels, refreshed every 30 minutes, offered for general information
       with the interpretation left to the reader. Reverse-engineering the
       tile service would give numbers with no contract behind them, which is
       worse than no numbers.

     Weekly Epidemiological Record    who.int/publications/journals/...
       Published as a PDF. Authoritative, and the right thing to cite, but
       parsing a PDF layout weekly is a maintenance liability, not a feature.

     Per-disease dashboards           cholera, mpox, measles, MERS, polio
       Shiny and Power BI applications. Same problem as the emergency
       dashboard: a private endpoint, no contract, silent breakage.

     EIOS                             Epidemic Intelligence from Open Sources
       NOT PUBLIC. Access is restricted to WHO and to designated national
       public health authorities. There is no open endpoint and there is no
       way for this project to have one. Anything claiming otherwise is not
       EIOS.

   So they are carried as an attribution layer instead: every one is named,
   linked, and labelled with what it is, and the interface points a reader at
   the authoritative surface for anything this globe shows. For a project that
   cannot own the numbers, sending people to the body that does is the honest
   design, and it is also what makes the tracker checkable.
   --------------------------------------------------------------------------- */

const WHO_OFFICIAL = [
  { id:'emergency-dashboard',
    name:'WHO Health Emergency Dashboard',
    url:'https://extranet.who.int/publicemergency',
    kind:'dashboard', access:'public',
    note:'Events reported through IHR channels, refreshed every 30 minutes. A subset, not a complete picture.' },

  { id:'don',
    name:'WHO Disease Outbreak News',
    url:'https://www.who.int/emergencies/disease-outbreak-news',
    kind:'bulletin', access:'public', feedsThisSite:true,
    note:'Read directly by this tracker (§4a). The primary record for a declared outbreak.' },

  { id:'wer',
    name:'Weekly Epidemiological Record',
    url:'https://www.who.int/publications/journals/weekly-epidemiological-record',
    kind:'journal', access:'public',
    note:'WHO\'s weekly epidemiological journal, published as PDF. The citable version of most figures here.' },

  { id:'cholera',
    name:'WHO Global Cholera Dashboard',
    url:'https://www.who.int/teams/global-cholera-and-acute-watery-diarrhoea-control',
    kind:'disease-dashboard', access:'public', disease:'Cholera' },

  { id:'mpox',
    name:'WHO Global Mpox Trends',
    url:'https://worldhealthorg.shinyapps.io/mpx_global/',
    kind:'disease-dashboard', access:'public', disease:'Mpox' },

  { id:'measles',
    name:'WHO Measles and Rubella Surveillance',
    url:'https://immunizationdata.who.int/global?topic=Provisional-measles-and-rubella-surveillance',
    kind:'disease-dashboard', access:'public', disease:'Measles' },

  { id:'influenza',
    name:'WHO FluNet / Global Influenza Programme',
    url:'https://www.who.int/tools/flunet',
    kind:'disease-dashboard', access:'public', disease:'Influenza', feedsThisSite:true },

  { id:'polio',
    name:'Global Polio Eradication Initiative',
    url:'https://polioeradication.org/polio-today/polio-now/this-week/',
    kind:'disease-dashboard', access:'public', disease:'Polio' },

  { id:'gho',
    name:'WHO Global Health Observatory',
    url:'https://www.who.int/data/gho',
    kind:'statistics', access:'public', feedsThisSite:true,
    note:'Annual reported case totals per member state. Supplies the endemic baseline shown in each country panel (§4j).' },

  { id:'eios',
    name:'EIOS — Epidemic Intelligence from Open Sources',
    url:'https://www.who.int/initiatives/eios',
    kind:'intelligence', access:'restricted',
    note:'Restricted to WHO and designated national public health authorities. No public API exists, so this tracker does not and cannot use it.' }
];

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
   5b. COVERAGE AUDIT

   The single most useful line in _notes. It answers the question a reviewer
   will actually ask — "is this globe comprehensive, or does it just look
   comprehensive?" — by naming the large countries that came back with nothing
   at all on this run.

   A country appearing here is not a bug. It means no source reported an
   outbreak there today, which for somewhere like Japan or Australia is
   usually the truth. It becomes a bug when the same country is listed every
   single day, because that is the signature of a coverage hole rather than a
   quiet month.
   --------------------------------------------------------------------------- */

const WATCH_LIST = {
  CHN:'China', IND:'India', USA:'United States', IDN:'Indonesia', PAK:'Pakistan',
  NGA:'Nigeria', BRA:'Brazil', BGD:'Bangladesh', RUS:'Russia', MEX:'Mexico',
  JPN:'Japan', ETH:'Ethiopia', PHL:'Philippines', EGY:'Egypt', VNM:'Viet Nam',
  COD:'DR Congo', TUR:'T\u00fcrkiye', IRN:'Iran', DEU:'Germany', THA:'Thailand',
  GBR:'United Kingdom', FRA:'France', ITA:'Italy', ZAF:'South Africa',
  TZA:'Tanzania', MMR:'Myanmar', KOR:'South Korea', COL:'Colombia',
  KEN:'Kenya', ESP:'Spain', ARG:'Argentina', DZA:'Algeria', SDN:'Sudan',
  UKR:'Ukraine', IRQ:'Iraq', AFG:'Afghanistan', POL:'Poland', CAN:'Canada',
  MAR:'Morocco', SAU:'Saudi Arabia', UZB:'Uzbekistan', PER:'Peru',
  AUS:'Australia', NPL:'Nepal', MYS:'Malaysia', LKA:'Sri Lanka'
};

function coverageNote(countries){
  const dark = Object.entries(WATCH_LIST)
    .filter(([iso]) => !countries[iso] || !countries[iso].diseases?.length)
    .map(([, name]) => name);

  if(!dark.length) return `Coverage: every country on the watch list reported something.`;
  return `Coverage: ${Object.keys(WATCH_LIST).length - dark.length}/`
       + `${Object.keys(WATCH_LIST).length} watch-list countries have data. `
       + `Nothing today from: ${dark.join(', ')}.`;
}

/* ---------------------------------------------------------------------------
   6. THE HANDLER \u2014 this is what runs when the globe calls /api/outbreaks

   The nine adapters all start AT ONCE and are collected in a fixed order.
   Started one after another they added up to more than Vercel allows a
   function to run for, and the whole response died with them; started
   together, the request takes as long as the slowest single source rather
   than the sum of all of them.

   Each one also gets a hard deadline. An agency site that accepts the
   connection and then never answers used to hang the entire endpoint \u2014 now
   it costs that one source and is written into _notes.
   --------------------------------------------------------------------------- */

/* Reject after `ms` no matter what the underlying fetch is doing. */
function withDeadline(promise, ms, label){
  let timer;
  const bell = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, bell]).finally(() => clearTimeout(timer));
}

export default async function handler(req, res){
  // Tell Vercel's CDN to cache this. WHO gets hit ~4 times a day total.
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${CACHE_HOURS*3600}, stale-while-revalidate=86400`
  );
  res.setHeader('Access-Control-Allow-Origin', '*');

  const notes = [];
  let countries = {};
  let admin1 = {};

  /* Fire everything now. Attaching a no-op catch immediately keeps Node from
     treating a rejection as unhandled while we are still awaiting an earlier
     job \u2014 the real error is caught properly in each block below. */
  const t0 = Date.now();
  const jobs = {
    who:       withDeadline(fetchWHO(),        ADAPTER_TIMEOUT_MS, 'WHO'),
    erviss:    withDeadline(fetchERVISS(),     ADAPTER_TIMEOUT_MS, 'ERVISS'),
    flunet:    withDeadline(fetchFluNet(),     ADAPTER_TIMEOUT_MS, 'FluNet'),
    paho:      withDeadline(fetchPAHO(),       ADAPTER_TIMEOUT_MS, 'PAHO'),
    acdc:      withDeadline(fetchAfricaCDC(),  ADAPTER_TIMEOUT_MS, 'Africa CDC'),
    cdcTravel: withDeadline(fetchCDCTravel(),  ADAPTER_TIMEOUT_MS, 'CDC travel notices'),
    reliefweb: withDeadline(fetchReliefWeb(),  ADAPTER_TIMEOUT_MS, 'ReliefWeb'),
    states:    withDeadline(fetchCDCStates(),  ADAPTER_TIMEOUT_MS, 'CDC states'),
    nicd:      withDeadline(fetchNICD(),       ADAPTER_TIMEOUT_MS, 'NICD'),
    gho:       withDeadline(fetchWHOBaseline(), GHO_TIMEOUT_MS,    'WHO GHO')
  };
  for(const p of Object.values(jobs)) p.catch(() => {});

  try{
    const who = await jobs.who;
    mergeAll(countries, who.countries, 'medium');
    notes.push(`WHO: read ${who.count} bulletins, matched ${Object.keys(who.countries).length} countries (${who.rescued} from multi-country bulletins)`);
    if(who.skipped.length){
      notes.push(`Not a single country, ignored: ${[...new Set(who.skipped)].join(', ')}`);
    }
  }catch(err){
    notes.push('WHO fetch failed: ' + err.message);
  }

  try{
    const eu = await jobs.erviss;
    mergeAll(countries, eu.countries, 'high');
    if(!eu.published){
      notes.push(`ERVISS: HIDDEN \u2014 newest week ${eu.latest} is about ${eu.age} weeks old. `
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
    const flu = await jobs.flunet;
    mergeAll(countries, flu.countries, 'high');
    notes.push(`FluNet: matched ${flu.matched} countries, newest week ${flu.newestWeek}`);
    notes.push(`FluNet columns detected: ${JSON.stringify(flu.columns)}`);
  }catch(err){
    notes.push('FluNet fetch failed: ' + err.message
      + ' | test it yourself: https://xmart-api-public.who.int/FLUMART/VIW_FNT?$format=csv&$top=5'
      + ' | column list: https://xmart-api-public.who.int/FLUMART/VIW_FLU_METADATA?$format=csv');
  }

  try{
    const paho = await jobs.paho;
    mergeAll(countries, paho.countries, 'high');
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
    const acdc = await jobs.acdc;
    mergeAll(countries, acdc.countries, 'medium');
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
    const trav = await jobs.cdcTravel;
    mergeAll(countries, trav.countries, 'medium');
    notes.push(`CDC travel notices: read ${trav.notices} notices, matched ${trav.matched} countries `
      + `(${trav.records} country-disease records; ${trav.global} notices named no country). `
      + `By level: ${JSON.stringify(trav.levels)}`);
    if(trav.unresolved.length){
      notes.push(`CDC notice titles with no disease matched: ${trav.unresolved.join(' | ')}`);
    }
  }catch(err){
    notes.push('CDC travel notices fetch failed: ' + err.message
      + ' | test it yourself: https://wwwnc.cdc.gov/travel/rss/notices.xml');
  }

  try{
    const rw = await jobs.reliefweb;
    mergeAll(countries, rw.countries, 'low');
    notes.push(`ReliefWeb: scanned ${rw.reports} reports from the last ${RW_WINDOW_DAYS} days `
      + `(via ${rw.via}), matched ${rw.matched} countries from ${rw.records} reports; `
      + `${rw.noDisease} named no disease, ${rw.noCountry} no usable country`);
    if(rw.unresolved.length){
      notes.push(`ReliefWeb ISO codes with no Natural Earth equivalent: ${rw.unresolved.join(', ')}`);
    }
  }catch(err){
    notes.push('ReliefWeb fetch failed: ' + err.message
      + ' | test it yourself: https://api.reliefweb.int/v1/reports?appname=test&limit=3');
  }

  try{
    const st = await jobs.states;
    Object.assign(admin1, st.admin1);
    notes.push(`CDC states: matched ${st.matched} US states/jurisdictions, week ending ${st.newest}`);
    notes.push(`CDC state columns detected: ${JSON.stringify(st.columns)}`);
    if(st.unmatchedLevels.length){
      notes.push(`CDC activity levels not recognised: ${st.unmatchedLevels.join(', ')}`);
    }
  }catch(err){
    notes.push('CDC states fetch failed: ' + err.message
      + ' | test it yourself: https://data.cdc.gov/resource/f3zz-zga5.json?$limit=3');
  }

  try{
    const za = await jobs.nicd;
    Object.assign(admin1, za.admin1);
    notes.push(`NICD: matched ${za.matched} South African provinces (${za.disease}, `
      + `${za.used.scope}) from "${za.used.title.slice(0,60)}" dated ${za.used.date}`);
  }catch(err){
    notes.push('NICD fetch failed: ' + err.message
      + ' | test it yourself: https://www.nicd.ac.za/wp-json/wp/v2/posts?search=measles&per_page=3');
  }

  let baseline = {};
  try{
    const gho = await jobs.gho;
    baseline = gho.baseline;
    notes.push(`WHO GHO: ${gho.countries} countries carry an endemic baseline, `
      + `matched ${gho.used.length} indicators out of a catalogue of ${gho.catalogue}: `
      + gho.used.join('; '));
    if(gho.failed.length){
      notes.push(`GHO indicators that failed to load: ${gho.failed.join(', ')}`);
    }
    notes.push('GHO is ANNUAL data and never colours the map. It sits in `baseline` '
      + 'so a quiet country can say "nothing reported this week, and here is what '
      + 'WHO\'s last annual return said" instead of just looking safe.');
  }catch(err){
    notes.push('WHO GHO fetch failed: ' + err.message
      + ' | test it yourself: https://ghoapi.azureedge.net/api/Indicator');
  }

  notes.push(`All ten sources collected in ${((Date.now() - t0) / 1000).toFixed(1)}s (run in parallel)`);

  // merge the baseline in without overwriting anything live
  for(const [iso, rec] of Object.entries(BASELINE)){
    if(!countries[iso]) countries[iso] = rec;
  }

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
  const payload = { countries, admin1, cities: {}, baseline, official: WHO_OFFICIAL };

  notes.push(`TOTAL: ${Object.keys(countries).length} countries and `
    + `${Object.keys(admin1).length} subnational regions carry data`);
  notes.push(coverageNote(countries));
  const quietWithBaseline = Object.keys(baseline)
    .filter(iso => !countries[iso] || !countries[iso].diseases?.length).length;
  notes.push(`${quietWithBaseline} countries have no active report but do have a WHO `
    + `annual baseline, so the panel can say what is normally there rather than nothing.`);

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
