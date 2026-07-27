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
  'central african republic':'CAF','chad':'TCD','comoros':'COM',
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
  'seychelles':'SYC','sierra leone':'SLE','somalia':'SOM','south africa':'ZAF',
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
  'saudi arabia':'SAU','singapore':'SGP','south korea':'KOR','republic of korea':'KOR',
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
  'united kingdom':'GBR','united kingdom of great britain and northern ireland':'GBR',

  // Americas
  'argentina':'ARG','bahamas':'BHS','barbados':'BRB','belize':'BLZ','bolivia':'BOL',
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
      'user-agent': 'PandemicTracker/1.0 (student project; contact: srikar.kay@gmail.com)'
    }
  });
  if(!r.ok) throw new Error('WHO returned ' + r.status);

  const body = await r.json();
  const items = Array.isArray(body) ? body : (body.value || []);

  const countries = {};
  const skipped = [];

  for(const item of items){
    const title = item.Title || '';
    const split = splitTitle(title);
    if(!split) continue;

    const iso = toISO(split.country);
    if(!iso){ skipped.push(split.country); continue; }

    const text   = (item.Summary || '') + ' ' + title;
    const cases  = findCases(text);
    const deaths = findDeaths(text);
    const date   = String(item.PublicationDateAndTime || item.PublicationDate || '').slice(0,10);

    const entry = {
      name: split.disease,
      cases,
      deaths,
      cfr: (cases && deaths && cases > 20) ? +(deaths/cases*100).toFixed(1) : null,
      per100k: null,
      growth7d: null,
      severity: severityFor(split.disease, cases, deaths),
      asOf: date || null,
      source: 'WHO Disease Outbreak News',
      url: item.ItemDefaultUrl
        ? 'https://www.who.int' + item.ItemDefaultUrl
        : 'https://www.who.int/emergencies/disease-outbreak-news',
      provisional: true
    };

    if(!countries[iso]) countries[iso] = { conf:'medium', diseases:[] };

    // keep only the newest bulletin per disease per country
    const existing = countries[iso].diseases.findIndex(d => d.name === entry.name);
    if(existing === -1) countries[iso].diseases.push(entry);
    else if((entry.asOf||'') > (countries[iso].diseases[existing].asOf||'')) {
      countries[iso].diseases[existing] = entry;
    }
  }

  return { countries, skipped, count: items.length };
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
    notes.push(`WHO: read ${who.count} bulletins, matched ${Object.keys(who.countries).length} countries`);
    if(who.skipped.length){
      notes.push(`Skipped (add to the ISO map): ${[...new Set(who.skipped)].join(', ')}`);
    }
  }catch(err){
    notes.push('WHO fetch failed: ' + err.message);
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
