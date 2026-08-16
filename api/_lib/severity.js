/* ===========================================================================
   _lib/severity.js — how serious is this disease, minimum?

   Fixes the calibration problem: a confirmed Ebola cluster must never rank
   below a big dengue season just because dengue has more cases.
   These are floors — the computed index can go higher, never lower.
   =========================================================================== */

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
export function severityFor(disease, cases, deaths){
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
