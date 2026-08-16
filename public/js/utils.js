/* ── UTILS ────────────────────────────────────────────────────────────────
   Generic helpers with no dependency on app state. Leaf module — everything
   else may import from here, this imports from nothing. */

export const $ = s => document.querySelector(s);
export const fmt = n => n==null ? '—' : n.toLocaleString('en-US');
export const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

export function trendArrow(g){
  if(g==null) return '';
  if(g > 5)  return `<span style="color:#DC2626">▲${Math.round(g)}%</span>`;
  if(g < -5) return `<span style="color:#16A34A">▼${Math.abs(Math.round(g))}%</span>`;
  return `<span style="color:#7B8798">▬</span>`;
}

/* Small toast at the top of the screen — "live data unavailable", "states
   data missing", etc. Self-contained: only touches its own DOM element. */
export function note(msg){
  const el = $('#stale');
  el.textContent = msg; el.style.display='block';
  clearTimeout(el._t); el._t = setTimeout(()=>el.style.display='none', 6000);
}
