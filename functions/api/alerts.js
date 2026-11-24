// Official weather warnings: GET /api/alerts?lat=40.38&lng=-74.56 asks the National Weather Service which warnings,
// watches and advisories are in force at that point. NWS asks every app to name itself in the User-Agent header,
// which a web page cannot set, so the request is made here. Answers are kept 5 minutes at Cloudflare's edge per
// point (rounded to about 1 km). NWS covers the US only: elsewhere the list is simply empty.
// Any failure answers an empty list marked unavailable, so a missing line never breaks the clock.

const UA = '(salahhub.pages.dev, https://github.com/sshafiuddin-dev/salahhub)';
const KEEP_S = 300, OUTSIDE_S = 86400;
const RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
const clip = (s) => (typeof s === 'string' ? s.trim().slice(0, 2000) : ''); // NWS text is plain; capped so one odd alert cannot bloat the answer
const json = (body, status, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });

// NWS GeoJSON features → [{ event, severity, until, sender, text, todo }] (text and todo: NWS's description and instructions): real alerts that have not ended, most severe first,
// one entry per kind of event (NWS often lists the same advisory twice while an update replaces it).
export function pick(features, now = Date.now()) {
  const seen = new Set();
  return (Array.isArray(features) ? features : [])
    .map(f => f?.properties || {})
    .filter(p => p.status === 'Actual' && p.messageType !== 'Cancel' && typeof p.event === 'string')
    .map(p => ({ event: p.event, severity: p.severity in RANK ? p.severity : 'Unknown', until: p.ends || p.expires || null, sender: p.senderName || 'National Weather Service', text: clip(p.description), todo: clip(p.instruction) }))
    .filter(a => !a.until || Date.parse(a.until) > now)
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || (Date.parse(b.until) || 0) - (Date.parse(a.until) || 0))
    .filter(a => (seen.has(a.event) ? false : seen.add(a.event)))
    .slice(0, 3);
}

// cache: a Cache-like (match/put); get: fetch. Both are passed in so the self-check can run this without a network.
export async function handle(url, cache, get, now = Date.now()) {
  const q = new URL(url).searchParams, lat = Number(q.get('lat')), lng = Number(q.get('lng'));
  if (!q.has('lat') || !q.has('lng') || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: 'lat and lng are needed' }, 400, { 'cache-control': 'no-store' });
  }
  const point = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const key = new Request(new URL(`/api/alerts?point=${point}`, url));
  const hit = await cache.match(key);
  if (hit) return json(await hit.json(), 200, { 'cache-control': 'public, max-age=60' });
  const keep = async (body, s) => { await cache.put(key, json(body, 200, { 'cache-control': `max-age=${s}` })); return json(body, 200, { 'cache-control': 'public, max-age=60' }); };
  try {
    const r = await get(`https://api.weather.gov/alerts/active?point=${point}`, { headers: { 'user-agent': UA, accept: 'application/geo+json' } });
    if (r.status === 400 || r.status === 404) return keep({ alerts: [], outside: true }, OUTSIDE_S); // not a US point
    if (!r.ok) throw new Error(`api.weather.gov answered ${r.status}`);
    return keep({ alerts: pick((await r.json()).features, now) }, KEEP_S);
  } catch (e) {
    console.error('alerts:', e); // the detail goes to the Worker log, not to visitors
    return json({ alerts: [], unavailable: true }, 200, { 'cache-control': 'no-store' });
  }
}

export const onRequestGet = ({ request }) => handle(request.url, caches.default, fetch);
