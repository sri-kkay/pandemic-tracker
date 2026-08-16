/* ===========================================================================
   SOURCE: AFRICA CDC  (fills Africa)

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
   =========================================================================== */

import { fetchWithTimeout, USER_AGENT } from '../http.js';
import { toISO } from '../iso.js';
import { stripTags, toInt } from '../text.js';
import { severityFor } from '../severity.js';

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
  "([A-Z][A-Za-zÀ-ſ.'\\-]*(?:\\s+[A-Za-zÀ-ſ.'\\-]+){0,3})" +
  "\\s*(?:\\([A-Z]{2,6}\\)\\s*)?" +          // optional "(DRC)" between name and numbers
  "\\(\\s*([\\d][\\d,\\s]*?)\\s*(?:" + QUAL + "\\s+)*(?:cases?)?" +
  "\\s*;\\s*([\\d][\\d,\\s]*?)\\s*(?:" + QUAL + "\\s+)*(?:deaths?)?\\s*\\)",
  'g');

export async function fetchAfricaCDC(){
  const headers = { 'user-agent': USER_AGENT };
  let posts = [];
  let via = 'wp-json';

  // ---- Preferred path: the WordPress JSON API
  try{
    const r = await fetchWithTimeout(
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
    const r = await fetchWithTimeout(`${ACDC_BASE}/disease-outbreak/`, { headers });
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
        const p = await fetchWithTimeout(link, { headers });
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
