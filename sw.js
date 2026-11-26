// Offline support for IqamaHub. Network first, so a new deploy or new iqama times show at once;
// the cached copy is used only when the network fails.
const CACHE = 'iqama-v104';
const SHELL = ['./', 'boot.js', 'fonts.css', 'fonts/newsreader-latin-opsz-normal.woff2', 'fonts/newsreader-latin-opsz-italic.woff2', 'fonts/ibm-plex-sans-latin-400-normal.woff2', 'fonts/ibm-plex-sans-latin-500-normal.woff2', 'fonts/ibm-plex-sans-latin-600-normal.woff2', 'fonts/amiri-arabic-400-normal.woff2', 'daisy.css', 'styles.css', 'look.css', 'app.js', 'logic.js', 'sky.js', 'skyfx.js', 'wxsound.js', 'clocks.js', 'weather.js', 'adhkar.js', 'hisn.js', 'quran.js', 'quran-logic.js', 'quran-offline.js', 'quran-art.js', 'art/kaaba.webp', 'art/nabawi.webp', 'motion.js', 'controls.js', 'remote.js', 'tour.js', 'feedback.js', 'counter.js', 'vendor/motion.min.js', 'lib/PrayTimes.js', 'lib/CalculationMethods.js', 'iqama.json', 'hisn-text.json', 'manifest.webmanifest', 'icon-192.png', 'icons/favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
  // the guide's pages (Cloudflare serves them without .html), so Help opens offline; its screenshots are cached as they are viewed
  'guide/', 'guide/guide.css', 'guide/guide.js', ...['setup', 'location', 'today', 'iqama', 'alerts', 'display', 'quran', 'adhkar', 'weather', 'help'].map(p => `guide/${p}`)];

// Sound lives in caches of its own that a new version does not clear, so it is not downloaded again with every update:
// AUDIO holds the adhan recordings in audio/ (all of them, so any alert can sound offline);
// QURAN holds recitations the Quran player keeps (quran-offline.js writes them, and keeps the list of what is there).
const AUDIO = 'iqama-audio', QURAN = 'quran-audio';
const ADHAN_FILES = ['makkah', 'egypt', 'aqsa', 'ottoman', 'afasy', 'fajr-zahrani', 'fajr-afasy', 'bismillah'];
const ADHAN_KEYS = ADHAN_FILES.map(f => new URL(`audio/${f}.mp3`, self.registration.scope).href);

// Fetch any adhan recording not kept yet. Cheap when all are there; a failure (offline) is tried again on the next visit.
let warming = null;
const warmAdhan = () => warming ||= caches.open(AUDIO).then(c => Promise.all(ADHAN_KEYS.map(k => c.match(k).then(hit => hit
  || fetch(k).then(r => (r.status === 200 ? c.put(k, r) : null)).catch(() => {}))))).finally(() => { warming = null; });

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => {
  // only old app versions are cleared; the sound caches stay
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('iqama-v') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()).then(() => warmAdhan()));
});

// Media players ask for a part of the file ("Range: bytes=…") so that they can start at once and seek. A kept file is
// answered from the cache in the same way: the asked-for part, as a 206.
async function ranged(hit, req) {
  const blob = await hit.blob(), size = blob.size, type = hit.headers.get('Content-Type') || 'audio/mpeg';
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get('Range') || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  let start, end;
  if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; } // the last N bytes
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' } });
}

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // A recitation the player knows it keeps is asked for as ".../001.mp3?offline=1". If the copy is gone (the browser
  // cleared it), send the player on to the real address, which this worker leaves to the network.
  if (url.searchParams.has('offline') && /(^|\.)mp3quran\.net$/i.test(url.hostname) && url.pathname.endsWith('.mp3')) {
    const key = url.origin + url.pathname;
    return e.respondWith(caches.open(QURAN).then(c => c.match(key)).then(hit => (hit ? ranged(hit, req) : Response.redirect(key, 302))));
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('.mp3')) { // an adhan recording: from the cache when kept, otherwise from the network (and keep it)
    const key = url.origin + url.pathname;
    return e.respondWith(caches.open(AUDIO).then(c => c.match(key)).then(hit => {
      if (hit) return ranged(hit, req);
      if (ADHAN_KEYS.includes(key)) e.waitUntil(warmAdhan());
      return fetch(req);
    }));
  }
  if (req.mode === 'navigate') e.waitUntil(warmAdhan()); // each visit online fills in any recording still missing
  // Every file is checked with the server (no-cache: a quick "not modified" when unchanged), never taken from the
  // browser's own cache unchecked, so a new page can never run with an old script after an update
  const net = req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' });
  e.respondWith(caches.open(CACHE).then(cache =>
    fetch(net).then(r => { if (r.status === 200) cache.put(req, r.clone()); return r; })
      .catch(() => cache.match(req, { ignoreSearch: true }).then(hit => hit || Response.error()))));
});
