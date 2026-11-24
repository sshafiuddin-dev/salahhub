// Recitations kept on this device, so they play with no connection. The audio is in the 'quran-audio' cache (sw.js
// answers the player from it); the list of what is kept is in localStorage 'iqama-quran-saved', so the player knows at
// once, with no waiting, which address to give the audio element (a wait could cost the tap that allows sound).
// Every surah played is kept, and the next one in the queue is fetched ahead ('played'). Surahs the listener downloads
// are kept for good ('download'). When the device runs short of space the played ones heard longest ago go first.
import { cleanSaved, isSavedUrl, toEvict } from './quran-logic.js';

const KEY = 'iqama-quran-saved', CACHE = 'quran-audio';
const RESERVE = 300e6; // leave this much free on the device for everything else
const GUESS = 15e6; // room to make for a file whose size is not known until it is in

export function initOffline() {
  const ok = 'caches' in window && 'serviceWorker' in navigator;
  let saved = {};
  try { saved = cleanSaved(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };
  const jobs = [], busy = new Map(); // url -> job { url, meta, kind, got, total, ctrl }
  const subs = new Set();
  let running = false, protect = [], asked = false;
  // tell the page: (url, id, what) with what 'progress' | 'state' (started, finished, failed, removed)
  const emit = (url, id, what) => { for (const fn of subs) try { fn(url, id, what); } catch (e) {} };

  const has = (url) => !!saved[url];
  // The address to play: the kept copy when there is one and the worker is there to answer for it
  const src = (url) => (ok && has(url) && navigator.serviceWorker.controller ? `${url}?offline=1` : url);
  const state = (url) => (has(url) ? 'kept' : busy.has(url) ? 'busy' : null);
  const progress = (url) => { const j = busy.get(url); return j && j.total ? Math.min(1, j.got / j.total) : 0; };

  async function remove(url) {
    const id = saved[url] && saved[url].id;
    delete saved[url]; write();
    try { await (await caches.open(CACHE)).delete(url); } catch (e) {}
    emit(url, id, 'state');
  }
  async function makeRoom(need) {
    if (!navigator.storage || !navigator.storage.estimate) return;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return;
    for (const url of toEvict(saved, need, quota - usage, RESERVE, protect)) await remove(url);
  }
  async function fetchOne(job) {
    const { url, meta, kind } = job;
    job.ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', signal: job.ctrl && job.ctrl.signal });
    if (r.status !== 200) throw new Error(`answered ${r.status}`);
    job.total = Number(r.headers.get('Content-Length')) || 0;
    await makeRoom(job.total || GUESS);
    let body = r;
    if (r.body && r.body.getReader) { // read it here, so the page can show how far it has come
      const reader = r.body.getReader(), parts = [];
      let shown = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); job.got += value.length;
        if (Date.now() - shown > 250) { shown = Date.now(); emit(url, meta.id, 'progress'); }
      }
      const blob = new Blob(parts, { type: r.headers.get('Content-Type') || 'audio/mpeg' });
      if (job.total && blob.size !== job.total) throw new Error('cut short');
      body = new Response(blob, { headers: { 'Content-Type': blob.type, 'Content-Length': String(blob.size) } });
    }
    const c = await caches.open(CACHE);
    await c.put(url, body);
    const bytes = job.total || (await (await c.match(url)).blob()).size; // with no Content-Length, the size is only known now
    saved[url] = { ...meta, bytes, at: Date.now(), kind };
    write();
    if (!asked && navigator.storage && navigator.storage.persist) { asked = true; navigator.storage.persist().catch(() => {}); } // ask the browser not to clear it
  }
  async function run() {
    if (running) return;
    running = true;
    while (jobs.length) {
      const job = jobs.shift();
      let failed = null;
      try { await fetchOne(job); } catch (e) { failed = e; }
      busy.delete(job.url);
      if (failed && failed.name === 'QuotaExceededError') {
        for (const j of jobs.splice(0)) { busy.delete(j.url); emit(j.url, j.meta.id, 'state'); }
        emit(null, null, 'full');
      } else if (failed && failed.name !== 'AbortError') console.warn('IqamaHub: could not keep a recitation', job.url, failed);
      emit(job.url, job.meta.id, failed && failed.name !== 'AbortError' ? 'failed' : 'state');
    }
    running = false;
  }
  // Keep a recitation. Already kept: it counts as just played, and a download stays (or becomes) a download.
  function keep(url, meta, kind = 'played') {
    if (!ok || !isSavedUrl(url) || !meta) return;
    if (has(url)) {
      saved[url].at = Date.now();
      if (kind === 'download' && saved[url].kind !== 'download') { saved[url].kind = 'download'; write(); emit(url, meta.id, 'state'); }
      return write();
    }
    const j = busy.get(url);
    if (j) { if (kind === 'download') j.kind = 'download'; return; }
    const job = { url, meta: { id: meta.id, title: meta.title || '', sub: meta.sub || '' }, kind, got: 0, total: 0, ctrl: null };
    busy.set(url, job);
    jobs.push(job);
    emit(url, meta.id, 'state');
    run();
  }
  function cancel(url) {
    const j = busy.get(url);
    if (!j) return;
    const i = jobs.indexOf(j);
    if (i >= 0) { jobs.splice(i, 1); busy.delete(url); emit(url, j.meta.id, 'state'); } // not started yet
    else if (j.ctrl) j.ctrl.abort(); // running: run() tidies up
  }
  // Downloads the listener asked for that are still waiting or running
  const pending = () => [...busy.values()].filter(j => j.kind === 'download');
  const cancelAll = () => { for (const j of pending()) cancel(j.url); };
  // What is playing (and what plays next) must not be removed to make room
  const guard = (urls) => { protect = urls.filter(Boolean); };
  // How big a file is, before downloading it (0 when the server does not say)
  const size = (url) => (saved[url] ? Promise.resolve(saved[url].bytes)
    : fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit' }).then(r => Number(r.headers.get('Content-Length')) || 0).catch(() => 0));
  const space = () => (navigator.storage && navigator.storage.estimate ? navigator.storage.estimate().then(e => ({ free: Math.max(0, (e.quota || 0) - (e.usage || 0)), quota: e.quota || 0 })).catch(() => null) : Promise.resolve(null));

  // The list and the cache can drift apart (the browser cleared the cache, or a copy was cut short): make them agree.
  // The mp3quran lists the player keeps in the same cache are not recitations, and stay.
  if (ok) caches.open(CACHE).then(async c => {
    const inCache = new Set((await c.keys()).map(r => r.url));
    let changed = false;
    for (const url of Object.keys(saved)) if (!inCache.has(url) && !busy.has(url)) { delete saved[url]; changed = true; }
    for (const url of inCache) if (isSavedUrl(url) && !saved[url] && !busy.has(url)) c.delete(url);
    if (changed) { write(); emit(null, null, 'state'); }
  }).catch(() => {});

  return {
    ok, has, src, keep, remove, cancel, cancelAll, pending, guard, size, space, state, progress,
    list: () => ({ ...saved }), entry: (url) => saved[url] || null,
    on: (fn) => { subs.add(fn); },
  };
}
