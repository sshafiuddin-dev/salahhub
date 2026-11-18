// Feedback from the app: POST /api/feedback (multipart form) sends one email to the app's owner through Resend,
// with the screenshot attached. Fields: kind (problem | idea | other), message (required), contact (optional email,
// used as Reply-To), details (optional JSON the app shows the person before sending), screenshot (optional image),
// website (a hidden honeypot: people leave it empty, form-filling bots do not).
// Settings, in Cloudflare Pages › Settings › Variables and Secrets: RESEND_API_KEY (secret), FEEDBACK_TO (your email),
// FEEDBACK_FROM (optional; Resend's onboarding@resend.dev sender works without a domain, to your own address only).
// Until those are set, the app is told feedback is not set up, and nothing is sent anywhere.

const MAX_MESSAGE = 4000, MAX_CONTACT = 200, MAX_DETAILS = 4000, MAX_IMAGE = 3 * 1024 * 1024;
const PER_HOUR = 5;
const KINDS = { problem: 'Something isn’t working', idea: 'An idea', other: 'Something else' };
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMAIL = /^[^\s@<>",]{1,64}@[^\s@<>",]{1,180}\.[A-Za-z]{2,}$/;

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function sha(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...d.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// details: the app's own key/value list. Only short strings and numbers are kept, so nothing odd lands in the email.
function cleanDetails(raw) {
  if (!raw) return [];
  if (raw.length > MAX_DETAILS) return [['details', 'too long, left out']];
  let o;
  try { o = JSON.parse(raw); } catch (e) { return [['details', 'unreadable, left out']]; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return [];
  return Object.entries(o).slice(0, 30)
    .filter(([k, v]) => /^[\w .-]{1,40}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
    .map(([k, v]) => [k, String(v).slice(0, 300)]);
}

// Reads and checks the form. Returns { error } or { kind, message, contact, details, image }.
export async function readForm(form) {
  if (String(form.get('website') || '')) return { spam: true };
  const kind = String(form.get('kind') || 'other');
  const message = String(form.get('message') || '').replace(/\r\n?/g, '\n').trim(); // forms send line breaks as CRLF
  const contact = String(form.get('contact') || '').trim();
  if (!KINDS[kind]) return { error: 'Choose what the feedback is about.' };
  if (!message) return { error: 'Write a few words about it.' };
  if (message.length > MAX_MESSAGE) return { error: `Please keep it under ${MAX_MESSAGE} characters.` };
  if (contact && (contact.length > MAX_CONTACT || !EMAIL.test(contact))) return { error: 'That email address does not look right. Leave it empty if you do not want a reply.' };
  let image = null;
  const f = form.get('screenshot');
  if (f && typeof f === 'object' && f.size) {
    const ext = IMAGE_TYPES[f.type];
    if (!ext) return { error: 'The picture must be a PNG, JPEG or WebP image.' };
    if (f.size > MAX_IMAGE) return { error: 'The picture is too large. It must be under 3 MB.' };
    image = { filename: `screenshot.${ext}`, content: base64(new Uint8Array(await f.arrayBuffer())) };
  }
  return { kind, message, contact, details: cleanDetails(String(form.get('details') || '')), image };
}

export function emailFor(f, { to, from, country }) {
  const rows = f.details.map(([k, v]) => `<tr><th align="left" style="padding:2px 12px 2px 0;font-weight:600">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const html = `<p style="margin:0 0 4px;color:#7a6f60;font:600 12px sans-serif;letter-spacing:.08em;text-transform:uppercase">${esc(KINDS[f.kind])}</p>`
    + `<div style="white-space:pre-wrap;font:16px/1.5 Georgia,serif">${esc(f.message)}</div>`
    + `<p style="font:14px sans-serif">${f.contact ? `Reply to: ${esc(f.contact)}` : 'No reply address given.'}${f.image ? ' · Screenshot attached.' : ''}</p>`
    + (rows ? `<table style="font:13px sans-serif;border-top:1px solid #ccc;padding-top:6px">${rows}</table>` : '')
    + (country ? `<p style="font:12px sans-serif;color:#7a6f60">Sent from: ${esc(country)} (Cloudflare’s country guess)</p>` : '');
  const text = `${KINDS[f.kind]}\n\n${f.message}\n\n${f.contact ? `Reply to: ${f.contact}` : 'No reply address given.'}\n\n${f.details.map(([k, v]) => `${k}: ${v}`).join('\n')}`;
  const first = f.message.split('\n')[0].slice(0, 60);
  return {
    from, to: [to], subject: `Iqama Times feedback: ${first}${f.message.length > 60 ? '…' : ''}`, html, text,
    ...(f.contact ? { reply_to: f.contact } : {}), ...(f.image ? { attachments: [f.image] } : {}),
  };
}

// cache and send are passed in so the self-check can run this without a network.
export async function handle(request, env, cache, send) {
  if (!env.RESEND_API_KEY || !env.FEEDBACK_TO) return json({ error: 'Feedback is not set up on this site yet.', notSetUp: true }, 503);
  if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) return json({ error: 'Send the feedback form.' }, 400);
  let form;
  try { form = await request.formData(); } catch (e) { return json({ error: 'The form could not be read.' }, 400); }
  const f = await readForm(form);
  if (f.spam) return json({ ok: true }, 200); // look accepted, send nothing
  if (f.error) return json({ error: f.error }, 400);
  // a soft limit per sender and Cloudflare location, so a stuck button or a script cannot flood the inbox
  const who = await sha(request.headers.get('cf-connecting-ip') || 'unknown');
  const key = new Request(`https://feedback.limit/${who}`);
  const hit = await cache.match(key), count = hit ? Number(await hit.text()) || 0 : 0;
  if (count >= PER_HOUR) return json({ error: 'Thank you, that is a lot of feedback in one hour. Please try again later.' }, 429);
  await cache.put(key, new Response(String(count + 1), { headers: { 'cache-control': 'max-age=3600' } }));
  const mail = emailFor(f, { to: env.FEEDBACK_TO, from: env.FEEDBACK_FROM || 'Iqama Times <onboarding@resend.dev>', country: request.cf?.country });
  try {
    const r = await send('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(mail) });
    if (!r.ok) throw new Error(`Resend answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
  } catch (e) {
    console.error('feedback:', e); // the detail goes to the Worker log, not to visitors
    return json({ error: 'It could not be sent just now. Please try again in a few minutes.' }, 502);
  }
  return json({ ok: true }, 200);
}

export const onRequestPost = ({ request, env }) => handle(request, env, caches.default, fetch);
