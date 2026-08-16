/* ===========================================================================
   _lib/http.js — shared fetch helpers for every adapter.

   Two things every adapter needs and none of them had:
     1. A real contact address in the User-Agent, so WHO/PAHO/CDC etc. can
        identify and reach us instead of just blocking an anonymous bot.
     2. A timeout. Without one, a single slow upstream host hangs the whole
        /api/outbreaks response until Vercel kills the function at 30s.
   =========================================================================== */

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'YOUR_EMAIL_HERE';

export const USER_AGENT = `PandemicTracker/1.0 (student project; contact: ${CONTACT_EMAIL})`;

const DEFAULT_TIMEOUT_MS = 10000;

/* fetch() with an AbortController-backed timeout. Rejects with a clear
   "timed out after Nms" error instead of hanging silently. */
export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try{
    return await fetch(url, { ...options, signal: controller.signal });
  }catch(err){
    if(err.name === 'AbortError') throw new Error(`timed out after ${timeoutMs}ms`);
    throw err;
  }finally{
    clearTimeout(timer);
  }
}
