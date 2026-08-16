/* ===========================================================================
   SOURCE: NICD  (South Africa, province level)

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
   =========================================================================== */

import { fetchWithTimeout, USER_AGENT } from '../http.js';
import { stripTags, toInt } from '../text.js';
import { severityFor } from '../severity.js';

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

export async function fetchNICD(){
  const headers = { 'user-agent': USER_AGENT };

  const r = await fetchWithTimeout(
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
