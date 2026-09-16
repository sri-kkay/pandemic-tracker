/* ===========================================================================
   api/guidance.js — one drawer entry, in one language.

       GET /api/guidance?disease=Dengue&lang=es

   The browser already ships with the whole curated library in
   public/data/guidance.json, so it calls this route for exactly two reasons:

     1. the interface is not in English and it wants the entry translated;
     2. the disease is new and the library has never seen it, so it needs the
        automatic lookup that only the server can do.

   Everything is cached hard. The response is deterministic for a given
   (disease, lang) pair for as long as the library stands still, so the CDN
   keeps it for a week and revalidates in the background for a month.

   Response shape:
     {
       disease:  "Dengue",           the name that was asked for
       key:      "Dengue",           the library entry it resolved to
       lang:     "es",               the language actually returned
       machine:  true,               translated by machine, not by a person
       partial:  false,              some strings fell back to English
       auto:     false,              compiled automatically from a reference source
       pending:  false,              nothing was found; this is the fallback text
       appliedFrom: null,            entry borrowed from a broader disease
       entry:    { treatments, travel, avoid, prevention, symptoms, detection, source, url }
     }
   =========================================================================== */

import { entryFor, DISCLAIMER } from './_guidance.js';
import { translateEntry, SUPPORTED } from './_translate.js';

function param(req, name){
  if(req.query && req.query[name] != null) return String(req.query[name]);
  try{
    return new URL(req.url, 'http://localhost').searchParams.get(name) || '';
  }catch{
    return '';
  }
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');

  const disease = param(req, 'disease').trim().slice(0, 160);
  const langRaw = param(req, 'lang').trim().toLowerCase().slice(0, 5);
  const lang = langRaw.split('-')[0] || 'en';

  if(!disease){
    return res.status(400).json({ error: 'disease query parameter is required' });
  }

  let hit;
  try{
    hit = await entryFor(disease);
  }catch(err){
    return res.status(200).json({
      disease, key: disease, lang: 'en', machine: false, partial: true,
      auto: false, pending: true, appliedFrom: null,
      error: 'lookup failed: ' + err.message,
      disclaimer: DISCLAIMER,
      entry: null
    });
  }

  const base = {
    disease,
    key: hit.key,
    auto: hit.auto,
    pending: hit.pending,
    appliedFrom: hit.appliedFrom,
    disclaimer: DISCLAIMER
  };

  if(lang === 'en' || !SUPPORTED.has(lang)){
    return res.status(200).json({ ...base, lang: 'en', machine: false, partial: false, entry: hit.entry });
  }

  try{
    const { entry, machine, partial } = await translateEntry(hit.entry, lang, hit.key);
    return res.status(200).json({
      ...base,
      lang: machine ? lang : 'en',
      machine,
      partial,
      entry
    });
  }catch(err){
    // A translation failure must never cost the reader the entry itself.
    return res.status(200).json({
      ...base, lang: 'en', machine: false, partial: true,
      error: 'translation failed: ' + err.message,
      entry: hit.entry
    });
  }
}
