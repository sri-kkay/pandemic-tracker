/* ── THE DRAWER ────────────────────────────────────────────────────────────
   Every disease on the globe has an entry behind it. The server builds them
   (api/guidance.js) and hands them over keyed by the exact disease name, so
   the lookup here is normally a straight hit.

   The three fallbacks below exist for the cases where it isn't: running the
   page off the bundled snapshot with the scraper down, or a disease name the
   server's own resolver didn't recognise.
     1. exact key
     2. case-insensitive, then longest key contained in the name — this is what
        makes "Ebola (Bundibugyo virus)" find the "Ebola" entry
     3. ask the public reference API directly from the browser, cache it, and
        repaint when it lands
   ------------------------------------------------------------------------- */

import { esc, $, note } from './utils.js';
import { SEED, S, diseaseSeverity, tierOf } from './state.js';
import { currentEntity } from './ui.js';

const gCache = new Map();     // disease name -> entry, for client-side lookups
const gPending = new Set();   // in-flight lookups, so we don't fire twice

export function guidanceFor(name){
  if(!name) return null;
  const G = SEED.guidance || {};
  if(G[name]) return G[name];
  if(gCache.has(name)) return gCache.get(name);

  const keys = Object.keys(G).filter(k => !k.startsWith('_'));
  const lower = name.toLowerCase();

  const ci = keys.find(k => k.toLowerCase() === lower);
  if(ci) return G[ci];

  // longest key that appears inside the reported name
  let best = null;
  for(const k of keys){
    const kl = k.toLowerCase();
    if(lower.includes(kl) && (!best || kl.length > best.length)) best = kl;
  }
  if(best){
    const k = keys.find(x => x.toLowerCase() === best);
    return { ...G[k], appliedFrom: k };
  }
  return null;
}

/* Browser-side version of the server's auto-resolver. Only runs when the
   server didn't supply an entry — normally never. Same source, same shape.

   Every sentence pulled from the encyclopaedia extract is plain text, not
   HTML — unlike the curated library entries, which deliberately embed
   <strong>/<em> for emphasis. renderDrawer() and renderChipAnswer() inject
   all of this into innerHTML without further sanitisation, so anything that
   didn't come from us must be escaped here, at the point it enters an entry,
   rather than trusted downstream. */
async function autoGuidance(name){
  if(gCache.has(name) || gPending.has(name)) return;
  gPending.add(name);
  try{
    const api = 'https://en.wikipedia.org/w/api.php';
    const s = await (await fetch(`${api}?action=query&list=search&srsearch=`
      + encodeURIComponent(name + ' disease') + '&srlimit=1&format=json&origin=*')).json();
    const title = s?.query?.search?.[0]?.title;
    if(!title) throw new Error('no article');

    const p = await (await fetch(`${api}?action=query&prop=extracts&explaintext=1&redirects=1&titles=`
      + encodeURIComponent(title) + '&format=json&origin=*')).json();
    const extract = Object.values(p?.query?.pages || {})[0]?.extract;
    if(!extract) throw new Error('no extract');

    const sec = {}; let cur = 'intro'; sec[cur] = '';
    for(const line of extract.split('\n')){
      const h = line.match(/^\s*(={2,6})\s*(.+?)\s*\1\s*$/);
      if(h){ cur = h[2].toLowerCase().trim(); sec[cur] = ''; }
      else sec[cur] += ' ' + line;
    }
    const sent = t => String(t||'').replace(/\s+/g,' ').replace(/\[\d+\]/g,'')
      .split(/(?<=[.!?])\s+(?=[A-Z(])/).map(x=>x.trim())
      .filter(x => x.length > 40 && x.length < 320)
      .map(esc);
    const pick = (cands, n=3) => {
      for(const w of cands) for(const [h,b] of Object.entries(sec))
        if(h.includes(w)){ const v = sent(b); if(v.length) return v.slice(0,n); }
      return [];
    };

    const intro = sent(sec.intro).slice(0,2);
    const entry = {
      auto:true,
      treatments: pick(['treatment','management','therapy']).length ? pick(['treatment','management','therapy']) : intro,
      travel: ['No travel guidance is published for this disease yet — it is new to this pipeline.',
               `Check <a href="https://wwwnc.cdc.gov/travel/notices" target="_blank" rel="noopener">CDC travel notices</a> and the WHO advisory before travelling.`],
      avoid: pick(['transmission','cause','risk factor','spread'],2).map(x=>'Known route of spread: '+x),
      prevention: pick(['prevention','vaccine','vaccination','control']),
      symptoms: pick(['signs and symptoms','symptoms','presentation']).length ? pick(['signs and symptoms','symptoms','presentation']) : intro,
      detection: pick(['diagnosis','screening','testing']),
      source:'Auto-compiled from public reference sources — unverified',
      url:'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g,'_'))
    };
    for(const t of ['avoid','prevention','detection']) if(!entry[t].length) entry[t] = ['Not established by the automatic lookup. See the source bulletin.'];
    gCache.set(name, entry);
  }catch(e){
    // Cache the failure too, so the drawer stops saying "looking this one up"
    // and the lookup isn't retried on every repaint.
    gCache.set(name, { ...SEED.guidance._default, pending:true,
      treatments:['No guidance is loaded for this disease and the automatic lookup did not return one.',
                  'Use the source bulletin linked in the panel above — it is outbreak-specific and more reliable than general advice.'] });
  }finally{
    gPending.delete(name);
    if(S.disease === name) renderDrawer(currentEntity().rec?.diseases || []);
  }
}

const CHIPS = [
  { q:'symptoms',  label:'Symptoms',       field:'symptoms',  head:'What it looks like' },
  { q:'detection', label:'Early detection', field:'detection', head:'How it is confirmed' },
  { q:'places',    label:'Places to avoid', field:'avoid',     head:'What to stay away from' },
  { q:'other',     label:'Ask something else', field:null,     head:'Ask something else' }
];

export function renderDrawer(dis){
  const body = $('#tabbody'), sel = $('#dsel');

  if(!dis.length){
    sel.style.display = 'none';
    body.innerHTML = `<div style="color:var(--ink-dim);font-size:12px;line-height:1.5">
      Nothing reported here, so there is nothing to advise on. Select a country or
      an entry in the outbreak feed to see its treatments, travel notes and prevention.</div>`;
    return;
  }

  // Which disease is the drawer talking about? Keep the user's pick if it's
  // still present at this location, otherwise fall back to the most severe one.
  const names = [...new Set(dis.map(d => d.name))];
  if(!names.includes(S.disease)){
    S.disease = names.slice().sort((a,b)=>
      (diseaseSeverity(dis.find(d=>d.name===b)) ?? -1) -
      (diseaseSeverity(dis.find(d=>d.name===a)) ?? -1))[0];
  }
  const name = S.disease;

  // selector row — only worth showing when there's a choice to make
  if(names.length > 1){
    sel.style.display = 'flex';
    sel.innerHTML = names.map(n=>{
      const t = tierOf(diseaseSeverity(dis.find(d=>d.name===n)));
      return `<button class="${n===name?'on':''}" data-d="${esc(n)}">
        <i style="background:${t.hex}"></i>${esc(n)}</button>`;
    }).join('');
    sel.querySelectorAll('button').forEach(b=>{
      b.onclick = ()=>{ S.disease = b.dataset.d; S.chip = null; renderDrawer(dis); };
    });
  } else {
    sel.style.display = 'none';
  }

  let g = guidanceFor(name);
  if(!g){ autoGuidance(name); g = SEED.guidance._default; }

  const items = (g[S.tab] || []).filter(Boolean);
  const tabName = { treatments:'treatment', travel:'travel', avoid:'avoidance', prevention:'prevention' }[S.tab];

  const tag = g.auto
    ? `<span class="gtag" style="color:#CA8A04;border-color:#CA8A0466;background:#CA8A0414">auto-compiled · unverified</span>`
    : g.pending
      ? `<span class="gtag" style="color:#7B8798;border-color:#7B879866;background:#7B879814">lookup pending</span>`
      : '';

  const applied = g.appliedFrom && g.appliedFrom !== name
    ? `<div class="gapplied">Showing <strong style="color:var(--ink-mute)">${esc(g.appliedFrom)}</strong>
       guidance — this location reports it as “${esc(name)}”.</div>`
    : '';

  body.innerHTML = `
    ${tag}${applied}
    ${items.length
      ? `<ul>${items.map(i=>`<li>${i}</li>`).join('')}</ul>`
      : `<div style="color:var(--ink-dim);font-size:12px">No ${tabName} guidance for ${esc(name)} in this dataset.</div>`}
    <div class="gsrc">
      ${esc(g.source || 'Source pending')}
      ${g.url ? ` · <a href="${esc(g.url)}" target="_blank" rel="noopener">open source</a>` : ''}
      <br>${esc(SEED.guidance._disclaimer || '')}
    </div>
    <div class="chips">
      ${CHIPS.map(c=>`<button class="chip ${S.chip===c.q?'on':''}" data-q="${c.q}">${c.label}</button>`).join('')}
    </div>
    <div id="chipans"></div>`;

  body.querySelectorAll('.chip').forEach(b=>{
    b.onclick = ()=>{ S.chip = (S.chip === b.dataset.q) ? null : b.dataset.q; renderDrawer(dis); };
  });

  if(S.chip) renderChipAnswer(g, name);
}

/* The four FAQ chips from the spec, answered from the same entry the tabs use.
   No round trip, no API key, and it works with the scraper down. */
export function renderChipAnswer(g, name){
  const box = $('#chipans');
  const spec = CHIPS.find(c => c.q === S.chip);
  if(!spec) return;
  box.style.display = 'block';

  if(spec.field){
    const lines = (g[spec.field] || []).filter(Boolean);
    box.innerHTML = `<div class="qh">${esc(spec.head)} · ${esc(name)}</div>` +
      (lines.length ? `<ul>${lines.map(l=>`<li>${l}</li>`).join('')}</ul>`
                    : `<div style="color:var(--ink-dim)">Not loaded for this disease.</div>`);
    return;
  }

  const place = currentEntity().name;
  box.innerHTML = `
    <div class="qh">Ask something else · ${esc(name)}</div>
    <div style="color:var(--ink-dim);font-size:11.5px;line-height:1.45">
      Searches WHO and CDC for this disease. Answers come from them, not from this site.
    </div>
    <input id="askq" type="text" placeholder="e.g. is it safe to travel to ${esc(place)}?" autocomplete="off">
    <div class="chips">
      <button class="chip" data-go="who">Search WHO</button>
      <button class="chip" data-go="cdc">Search CDC</button>
    </div>`;

  const go = which=>{
    const q = ($('#askq').value || '').trim();
    const term = encodeURIComponent(`${name} ${place} ${q}`.trim());
    const url = which === 'who'
      ? 'https://www.who.int/home/search?indexCatalogue=genericsearchindex1&searchQuery=' + term
      : 'https://search.cdc.gov/search/?query=' + term;
    window.open(url, '_blank', 'noopener');
  };
  box.querySelectorAll('[data-go]').forEach(b => b.onclick = ()=> go(b.dataset.go));
  $('#askq').onkeydown = e => { if(e.key === 'Enter') go('who'); };
}

/* The bottom-right FAQ chips no longer need this — they answer from the same
   guidance entry the tabs use, which works offline and needs no key.
   Kept for the top-right chatbot panel, which is still to be built. Point it
   at your own /api/ask route; the browser cannot call an LLM provider directly
   without exposing the key. */
export function askAssistant(kind, disease, place){
  note(`Assistant not connected — wire askAssistant() to your /api/ask route. (${kind} · ${disease||'—'} · ${place})`);
}
