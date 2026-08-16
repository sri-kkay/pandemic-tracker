/* ── FRESHNESS ────────────────────────────────────────────────────────────
   Every number on this map is only as good as its date. Sources report at
   wildly different speeds — WHO posts a bulletin the week it happens, ECDC
   reports by ISO week, some national agencies run a month behind. So every
   figure carries its own age, shown everywhere it appears.

   Handles both "2026-07-15" and ISO week strings like "2026-W20".
   Leaf module — pure functions, no app-state dependency. */

export function parseAsOf(s){
  if(!s) return null;
  const wk = /^(\d{4})-W(\d{1,2})$/.exec(String(s));
  if(wk){
    const year = +wk[1], week = +wk[2];
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const mondayOffset = (jan4.getUTCDay() + 6) % 7;
    const week1Monday = jan4.getTime() - mondayOffset * 86400000;
    return new Date(week1Monday + (week * 7 - 1) * 86400000);  // end of that week
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function ageDays(asOf){
  const d = parseAsOf(asOf);
  if(!d) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

export function ago(d){
  if(d === 0) return 'today';
  if(d === 1) return 'yesterday';
  if(d < 14)  return d + 'd ago';
  if(d < 70)  return Math.round(d/7) + 'w ago';
  return Math.round(d/30) + 'mo ago';
}

/* Four bands. The thresholds match how often the sources actually publish:
   a weekly source is doing its job at 7 days, badly behind at 30. */
export function freshness(asOf){
  const d = ageDays(asOf);
  if(d == null) return { label:'no date', short:'—', hex:'#4E5967', rank:4 };
  if(d <= 8)    return { label:ago(d), short:ago(d), hex:'#16A34A', rank:0 };
  if(d <= 30)   return { label:ago(d), short:ago(d), hex:'#CA8A04', rank:1 };
  if(d <= 90)   return { label:ago(d), short:ago(d), hex:'#EA580C', rank:2 };
  return          { label:ago(d), short:ago(d), hex:'#DC2626', rank:3 };
}

/* The freshest figure anywhere in a record — what the headline badge shows. */
export function freshestAsOf(diseases){
  const dated = (diseases||[]).map(d=>d.asOf).filter(Boolean);
  if(!dated.length) return null;
  return dated.sort((a,b)=>(ageDays(a)??99999)-(ageDays(b)??99999))[0];
}

export function bestFreshness(rec){
  if(!rec || !rec.diseases || !rec.diseases.length) return freshness(null);
  return rec.diseases
    .map(d => freshness(d.asOf))
    .sort((a,b) => a.rank - b.rank)[0];
}

export function freshBadge(asOf, extra){
  const f = freshness(asOf);
  return `<span class="fresh" style="color:${f.hex};border-color:${f.hex}44;background:${f.hex}14">
    <span class="freshdot" style="background:${f.hex}"></span>${f.label}${extra?' · '+extra:''}</span>`;
}
