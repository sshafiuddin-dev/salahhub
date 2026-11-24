// Approximate location: GET /api/where answers the city that Cloudflare places this request's internet address in, so a new
// device can start with times near it (the app shows it as approximate and asks to confirm). Nothing is logged or kept.
// Cloudflare's guess is city-level at best and can be far off (a VPN, some mobile networks); with no usable guess the answer is
// 404 and the app asks the visitor to set their location.

const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
const text = (v) => (typeof v === 'string' ? v.trim().slice(0, 60) : '');

// cf: the request's Cloudflare properties (request.cf), or undefined when run without Cloudflare
export function where(cf) {
  const lat = Number(cf?.latitude), lng = Number(cf?.longitude);
  if (!cf || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const city = text(cf.city), region = text(cf.region), country = text(cf.country);
  const name = [city, region || country].filter(Boolean).join(', ') || 'Your area';
  return { lat: +lat.toFixed(3), lng: +lng.toFixed(3), name, zone: text(cf.timezone) || null };
}

export const handle = (request) => { const w = where(request.cf); return w ? json(w, 200) : json({ error: 'Location not known' }, 404); };
export const onRequestGet = ({ request }) => handle(request);
