/* ===========================================================================
   _lib/text.js — pulling numbers and structure out of scraped text/HTML/CSV.
   =========================================================================== */

/* WHO writes "a cumulative total of 2 124 confirmed cases" — note the SPACES
   inside the number. That's why we strip whitespace before parsing. */
export function toNumber(s){
  const n = parseInt(String(s).replace(/[\s,  ]/g,''), 10);
  return Number.isFinite(n) ? n : null;
}

export function findCases(text){
  const m = text.match(
    /([0-9][0-9\s,  ]{0,12})\s+(?:confirmed\s+|suspected\s+|probable\s+|total\s+|reported\s+|new\s+)*cases/i
  );
  return m ? toNumber(m[1]) : null;
}

export function findDeaths(text){
  const m = text.match(
    /([0-9][0-9\s,  ]{0,12})\s+(?:associated\s+|reported\s+|related\s+)*deaths/i
  );
  return m ? toNumber(m[1]) : null;
}

/* WHO titles follow a strict convention:  "Disease name – Country name"
   The separator is an EN DASH (–), not a hyphen (-). Some older items use a
   hyphen, so we accept both. */
export function splitTitle(title){
  const parts = String(title).split(/\s+[–—-]\s+/);
  if(parts.length < 2) return null;
  return {
    disease: parts[0].trim(),
    country: parts[parts.length - 1].trim()
  };
}

export function stripTags(html){
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ');
}

export function parseCSV(text){
  const lines = text.trim().split('\n');
  const head  = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    head.forEach((h,i) => row[h] = (cells[i] || '').trim());
    return row;
  });
}

/* Proper CSV parsing — handles quoted fields containing commas, which
   country names like "Bolivia, Plurinational State of" will have. */
export function parseCSVSafe(text){
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
export function findColumn(row, candidates){
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

export function toInt(s){
  const n = parseInt(String(s).replace(/[,\s]/g,''), 10);
  return Number.isFinite(n) ? n : null;
}
