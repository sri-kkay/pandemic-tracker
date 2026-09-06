/* ===========================================================================
   _translate.js — puts the drawer into the language the interface is in.

   The curated library in _guidance.js is written in English and stays that
   way: it is the authoritative copy, and it is what a reviewer checks. This
   module produces the other six languages on demand.

   How it works, and what it is honest about:

     · Translation is MACHINE translation. Every translated entry comes back
       flagged `machine: true`, the drawer labels it, and the reader can flip
       back to the English original in one click. Nothing here should be read
       as a clinical translation reviewed by a clinician, and the interface
       does not pretend otherwise.

     · Two providers are tried in order. Neither needs an API key. If both
       fail, the field is returned in English and `partial: true` comes back
       with it, so the drawer can say so rather than showing a blank tab.

     · Everything is cached three times over: by string inside the lambda
       (guidance reuses phrases heavily), by entry inside the lambda, and by
       Vercel's CDN through the Cache-Control header the route sets. A warm
       function translates a repeat request zero times.

     · Inline markup survives. Text is split on tags, only the text between
       them is sent, and the tags are put back afterwards — so <strong> stays
       around the right clause and links keep their href.

   No API key, no account, no build step.
   =========================================================================== */

/* Languages the interface offers, minus English. Anything else is refused by
   the route rather than guessed at. */
export const SUPPORTED = new Set(['es', 'fr', 'pt', 'zh', 'hi', 'ar']);

/* Provider-specific language codes. */
const GOOGLE_CODE = { es:'es', fr:'fr', pt:'pt', zh:'zh-CN', hi:'hi', ar:'ar' };
const MM_CODE     = { es:'es-ES', fr:'fr-FR', pt:'pt-BR', zh:'zh-CN', hi:'hi-IN', ar:'ar-SA' };

const FIELDS = ['treatments', 'travel', 'avoid', 'prevention', 'symptoms', 'detection'];

/* Caches live in module scope, which on Vercel means they survive for the life
   of a warm function instance. */
const stringCache = new Map();    // `${lang}\u0000${text}` -> translated text
const entryCache  = new Map();    // `${lang}\u0000${key}`  -> { entry, partial }

const MAX_STRING_CACHE = 4000;

function cacheString(lang, text, value){
  if(stringCache.size > MAX_STRING_CACHE) stringCache.clear();
  stringCache.set(lang + '\u0000' + text, value);
}

/* --------------------------------------------------------------------------
   HTTP with a deadline. A translation that has not come back in six seconds
   is worth less than a fast response in English.
   -------------------------------------------------------------------------- */

async function getJSON(url, ms = 6000){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try{
    const r = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'PandemicTracker/2.0 (student project)' },
      signal: ctrl.signal
    });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------------
   PROVIDERS

   Both are free and keyless. Each returns a string, or null if it could not
   translate — never a partial or garbled answer.
   -------------------------------------------------------------------------- */

async function viaGoogle(text, lang){
  const code = GOOGLE_CODE[lang];
  if(!code) return null;
  const url = 'https://translate.googleapis.com/translate_a/single'
            + `?client=gtx&sl=en&tl=${code}&dt=t&q=${encodeURIComponent(text)}`;
  const j = await getJSON(url);
  if(!Array.isArray(j) || !Array.isArray(j[0])) return null;
  const out = j[0].map(seg => (Array.isArray(seg) ? seg[0] : '')).join('');
  return out.trim() ? out : null;
}

async function viaMyMemory(text, lang){
  const code = MM_CODE[lang];
  if(!code) return null;
  // MyMemory rejects anything much over 500 characters
  if(text.length > 480) return null;
  const url = 'https://api.mymemory.translated.net/get'
            + `?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent('en|' + code)}`;
  const j = await getJSON(url);
  const out = j?.responseData?.translatedText;
  if(!out || typeof out !== 'string') return null;
  // MyMemory answers with a shouted warning instead of an HTTP error when it
  // is out of quota, and echoes the input when it has no match
  if(/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(out)) return null;
  if(out.trim().toLowerCase() === text.trim().toLowerCase()) return null;
  return out;
}

const PROVIDERS = [
  { name: 'google',   fn: viaGoogle },
  { name: 'mymemory', fn: viaMyMemory }
];

/* --------------------------------------------------------------------------
   ONE STRING

   `state` carries the per-request deadline and a note of which providers have
   already failed, so a dead provider is not retried twenty times in a row.
   -------------------------------------------------------------------------- */

async function translateString(text, lang, state){
  const trimmed = String(text ?? '');
  if(!trimmed.trim()) return trimmed;

  const hit = stringCache.get(lang + '\u0000' + trimmed);
  if(hit != null) return hit;

  if(Date.now() > state.deadline){ state.partial = true; return trimmed; }

  for(const p of PROVIDERS){
    if(state.dead.has(p.name)) continue;
    try{
      const out = await p.fn(trimmed, lang);
      if(out){
        cacheString(lang, trimmed, out);
        state.ok++;
        return out;
      }
      state.miss[p.name] = (state.miss[p.name] || 0) + 1;
      if(state.miss[p.name] >= 3) state.dead.add(p.name);
    }catch(err){
      state.miss[p.name] = (state.miss[p.name] || 0) + 1;
      if(state.miss[p.name] >= 3) state.dead.add(p.name);
    }
  }

  state.partial = true;
  return trimmed;                 // English, rather than nothing
}

/* --------------------------------------------------------------------------
   MARKUP

   Guidance bullets carry <strong>, <em> and the occasional <a href>. Splitting
   on tags and translating only the text between them keeps the emphasis on the
   right clause and keeps hrefs intact.
   -------------------------------------------------------------------------- */

function splitTags(html){
  const parts = [];
  const re = /<[^>]+>/g;
  let last = 0, m;
  while((m = re.exec(html)) !== null){
    if(m.index > last) parts.push({ tag:false, text: html.slice(last, m.index) });
    parts.push({ tag:true, text: m[0] });
    last = m.index + m[0].length;
  }
  if(last < html.length) parts.push({ tag:false, text: html.slice(last) });
  return parts;
}

async function translateHTML(html, lang, state){
  const src = String(html ?? '');
  if(!src.includes('<')) return translateString(src, lang, state);

  const parts = splitTags(src);
  const out = [];
  for(const part of parts){
    if(part.tag || !part.text.trim()){ out.push(part.text); continue; }
    // keep the leading and trailing spaces, translate the middle
    const lead = part.text.match(/^\s*/)[0];
    const tail = part.text.match(/\s*$/)[0];
    out.push(lead + await translateString(part.text.trim(), lang, state) + tail);
  }
  return out.join('');
}

/* Run a list of jobs with a small amount of concurrency. Free endpoints do not
   love being hit forty times at once, and four at a time is fast enough. */
async function pool(items, limit, worker){
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while(true){
      const i = next++;
      if(i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

/* --------------------------------------------------------------------------
   ONE ENTRY
   -------------------------------------------------------------------------- */

/**
 * Translate a drawer entry.
 * @param {object} entry  a library or auto-compiled entry
 * @param {string} lang   one of SUPPORTED
 * @param {string} cacheKey  library key, so two diseases sharing an entry share a cache slot
 * @returns {{entry:object, machine:boolean, partial:boolean}}
 */
export async function translateEntry(entry, lang, cacheKey = ''){
  if(!SUPPORTED.has(lang)) return { entry, machine:false, partial:false };

  const ck = lang + '\u0000' + (cacheKey || JSON.stringify(entry).slice(0, 120));
  const cached = entryCache.get(ck);
  if(cached) return { entry: cached.entry, machine:true, partial: cached.partial };

  const state = {
    deadline: Date.now() + 14000,   // whole-entry budget
    dead: new Set(),
    miss: {},
    partial: false,
    ok: 0
  };

  const out = { ...entry };

  // flatten every bullet of every tab into one job list, then put them back
  const jobs = [];
  for(const field of FIELDS){
    const list = Array.isArray(entry[field]) ? entry[field] : [];
    list.forEach((line, i) => jobs.push({ field, i, line }));
  }

  const translated = await pool(jobs, 4, job => translateHTML(job.line, lang, state));

  for(const field of FIELDS) out[field] = Array.isArray(entry[field]) ? [...entry[field]] : entry[field];
  jobs.forEach((job, n) => { out[job.field][job.i] = translated[n]; });

  // The source line names an institution and a document. Translating "WHO —
  // Dengue and severe dengue fact sheet" makes it harder to find, not easier,
  // so it stays as published.
  out.source = entry.source;
  out.url = entry.url;
  out.machine = true;
  out.lang = lang;

  // Nothing came back at all: hand the English original over rather than a
  // half-translated entry, and let the caller say why.
  if(state.ok === 0){
    return { entry: { ...entry, lang:'en' }, machine:false, partial:true };
  }

  entryCache.set(ck, { entry: out, partial: state.partial });
  return { entry: out, machine:true, partial: state.partial };
}

/** Small helper for the route: translate a handful of loose strings. */
export async function translateLines(lines, lang){
  if(!SUPPORTED.has(lang)) return lines;
  const state = { deadline: Date.now() + 8000, dead:new Set(), miss:{}, partial:false, ok:0 };
  return pool(lines, 4, line => translateHTML(line, lang, state));
}
