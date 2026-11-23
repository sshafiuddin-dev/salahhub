// Recitations kept on this device, so they play with no connection. The audio is in the 'quran-audio' cache (sw.js
// answers the player from it); the list of what is kept is in localStorage 'iqama-quran-saved', so the player knows at
// once, with no waiting, which address to give the audio element (a wait could cost the tap that allows sound).
// Every surah played is kept, and the next one in the queue is fetched ahead. When the device runs short of space the
// ones played longest ago go first; downloads asked for (phase 3) are never removed on their own.
import { cleanSaved, isSavedUrl, toEvict } from './quran-logic.js';

const KEY = 'iqama-quran-saved', CACHE = 'quran-audio';
const RESERVE = 300e6; // leave this much free on the device for everything else
const GUESS = 15e6; // room to make for a file whose size is not known until it is in

export function initOffline() {
  const ok = 'caches' in window && 'serviceWorker' in navigator;
  let saved = {};
  try { saved = cleanSaved(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };
  const jobs = [], busy = new Set();
  let running = false, protect = [], asked = false;

  const has = (url) => !!saved[url];
  // The address to play: the kept copy when there is one and the worker is there to answer for it
  const src = (url) => (ok && has(url) && navigator.serviceWorker.controller ? `${url}?offline=1` : url);

  async function remove(url) {
    delete saved[url]; write();
    try { await (await caches.open(CACHE)).delete(url); } catch (e) {}
  }
  async function makeRoom(need) {
    if (!navigator.storage || !navigator.storage.estimate) return;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return;
    for (const url of toEvict(saved, need, quota - usage, RESERVE, protect)) await remove(url);
  }
  async function fetchOne({ url, meta, kind }) {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (r.status !== 200) throw new Error(`answered ${r.status}`);
    const size = Number(r.headers.get('Content-Length')) || 0;
    await makeRoom(size || GUESS);
    const c = await caches.open(CACHE);
    await c.put(url, r);
    const bytes = size || (await (await c.match(url)).blob()).size; // with no Content-Length, the size is only known now
    saved[url] = { ...meta, bytes, at: Date.now(), kind };
    write();
    if (!asked && navigator.storage && navigator.storage.persist) { asked = true; navigator.storage.persist().catch(() => {}); } // ask the browser not to clear it
  }
  async function run() {
    if (running) return;
    running = true;
    while (jobs.length) {
      const job = jobs.shift();
      try { await fetchOne(job); } catch (e) {
        if (e && e.name === 'QuotaExceededError') { jobs.length = 0; busy.clear(); console.warn('Iqama Times: no room to keep more recitations'); }
        else console.warn('Iqama Times: could not keep a recitation', job.url, e);
      }
      busy.delete(job.url);
    }
    running = false;
  }
  // Keep a recitation. Already kept: it counts as just played (and a download stays a download).
  function keep(url, meta, kind = 'played') {
    if (!ok || !isSavedUrl(url) || !meta) return;
    if (has(url)) {
      saved[url].at = Date.now();
      if (kind === 'download') saved[url].kind = 'download';
      return write();
    }
    if (busy.has(url)) return;
    busy.add(url);
    jobs.push({ url, meta: { id: meta.id, title: meta.title || '', sub: meta.sub || '' }, kind });
    run();
  }
  // What is playing (and what plays next) must not be removed to make room
  const guard = (urls) => { protect = urls.filter(Boolean); };

  // The list and the cache can drift apart (the browser cleared the cache, or a copy was cut short): make them agree
  if (ok) caches.open(CACHE).then(async c => {
    const inCache = new Set((await c.keys()).map(r => r.url));
    let changed = false;
    for (const url of Object.keys(saved)) if (!inCache.has(url) && !busy.has(url)) { delete saved[url]; changed = true; }
    for (const url of inCache) if (!saved[url] && !busy.has(url)) c.delete(url);
    if (changed) write();
  }).catch(() => {});

  return { has, src, keep, remove, guard, list: () => ({ ...saved }) };
}
