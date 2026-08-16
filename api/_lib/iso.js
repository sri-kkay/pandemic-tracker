/* ===========================================================================
   _lib/iso.js — country names → ISO codes.
   WHO writes "Democratic Republic of the Congo". The map needs "COD".
   Add a line here any time the log says a country was skipped.
   =========================================================================== */

export const ISO = {
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

export function toISO(name){
  if(!name) return null;
  const clean = String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')  // strip accents
    .replace(/[‘’]/g,"'")
    .replace(/\s+/g,' ')
    .trim();
  return ISO[clean] || null;
}

export function normalise(s){
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[‘’]/g,"'");
}

/* ---------------------------------------------------------------------------
   RESCUING THE "GLOBAL" AND "MULTI-COUNTRY" BULLETINS

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

export function scanForCountries(text){
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
