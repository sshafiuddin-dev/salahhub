// Quran tab and player. Reciters, surahs and riwayat come from mp3quran.net when they are first needed; the audio streams
// from the reciter's server. Favorites, playlists and the place you stopped stay on this device (localStorage 'iqama-quran').
// The recitation has its own audio element, so an adhan or alert can pause it and hand it back afterwards.
import {
  trackId, trackInfo, buildCatalog, moshafOf, recitersFor, search, fmtTime, makeQueue, current, reshuffle, stepPos, afterEnd,
  cleanStore, hafsId, legacyTrack, retryWait, shouldRetry, nextRepeat, nextRate, toggle, cleanName, addList, renameList, removeList, addToList, removeFromList, moveInList, setListOrder,
} from './quran-logic.js';
import * as mo from './motion.js';
import { initOffline } from './quran-offline.js';
import { tileArt, starArt, paintedArt, paintingOf, arNames, isMakki, SURAH_AR } from './quran-art.js';
import { esc } from './logic.js';

const API = 'https://mp3quran.net/api/v3';
const $ = (id) => document.getElementById(id);
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/>${extra}</svg>`;
const num = (n) => `<text x="12" y="15.2" text-anchor="middle">${n}</text>`;
const IC = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true" class="qp-solid"><path d="M7.5 4.5v15l12-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true" class="qp-solid"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  prev: svg('M6 5v14M19 5.5v13L9 12z'), next: svg('M18 5v14M5 5.5v13L15 12z'),
  back: svg('M4.5 12a7.5 7.5 0 1 0 2.3-5.4M4.5 4v4h4', num(10)), fwd: svg('M19.5 12a7.5 7.5 0 1 1-2.3-5.4M19.5 4v4h-4', num(10)),
  repeat: svg('M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3'),
  repeat1: svg('M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3', '<text x="12" y="14.6" text-anchor="middle">1</text>'),
  shuffle: svg('M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5'),
  heart: svg('M12 20.5S4 15.5 4 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 6-8 11-8 11z'),
  add: svg('M4 6h11M4 11h11M4 16h7M18 13v7M14.5 16.5h7'),
  up: svg('M6 15l6-6 6 6'), down: svg('M6 9l6 6 6-6'), left: svg('M15 5l-7 7 7 7'), close: svg('M6 6l12 12M18 6L6 18'),
  grip: '<svg viewBox="0 0 24 24" aria-hidden="true" class="qp-dots"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>',
  vol: svg('M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7'),
  more: '<svg viewBox="0 0 24 24" aria-hidden="true" class="qp-dots"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg>',
  dl: svg('M12 4v11M7 10.5l5 5 5-5M5 19.5h14'), done: svg('M5 12.5l4.5 4.5L19 7.5'), stop: svg('M9 9h6v6H9z'),
};
const MB = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(.1, b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`);
const REPEAT_TEXT = { off: 'Repeat is off', all: 'Repeating the whole list', one: 'Repeating this surah' };
const btn = (q, icon, label, cls = '') => `<button class="qp-ic ${cls}" type="button" data-q="${q}" aria-label="${label}" title="${label}">${IC[icon]}</button>`;
// What is playing: a ring that fills as the surah plays (the current surah only), red while it plays and grey when paused.
// pathLength 100, so the dash offset is 100 minus the percentage played. The timeline carries the same news for screen readers.
const eq = '<span class="qp-eq" aria-hidden="true"><svg viewBox="0 0 22 22"><circle class="qp-ring-bg" cx="11" cy="11" r="9"/>'
  + '<circle class="qp-ring" cx="11" cy="11" r="9" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg></span>';
const timeline = () => `<div class="qp-time"><span class="qp-cur">0:00</span><div class="qp-track"><div class="qp-buf"></div><div class="qp-fill"></div>`
  + `<input class="qp-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Position in the surah" disabled></div><span class="qp-dur">0:00</span></div>`;
const transport = () => `${btn('shuffle', 'shuffle', 'Shuffle', 'qp-extra')}${btn('prev', 'prev', 'Previous surah')}${btn('back', 'back', 'Back 10 seconds', 'qp-extra')}`
  + `${btn('toggle', 'play', 'Play', 'qp-play')}${btn('fwd', 'fwd', 'Forward 10 seconds', 'qp-extra')}${btn('next', 'next', 'Next surah')}${btn('repeat', 'repeat', 'Repeat', 'qp-extra')}`;

export function initQuran({ say, stopOthers }) {
  let store = cleanStore(null);
  try { store = cleanStore(JSON.parse(localStorage.getItem('iqama-quran') || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem('iqama-quran', JSON.stringify(store)); } catch (e) {} };
  // Reciters' names in Arabic, for the letter on their tile: { at, names: { id: name } }, refreshed once a week
  let ar = { at: 0, names: {} };
  try { const a = JSON.parse(localStorage.getItem('iqama-quran-ar') || '{}'); if (a && typeof a.names === 'object') ar = { at: +a.at || 0, names: a.names }; } catch (e) {}

  let cat = null, catP = null, failed = false;
  const dlAllOn = new Set(); // recitations whose Download all is under way
  let view = store.favR.length || store.favT.length ? 'favorites' : 'reciters', query = '', detail = null; // start on Favorites once there are any // detail: { type: 'reciter', id, m } | { type: 'surah', n } | { type: 'list', id }
  let q = null, cur = store.last ? { id: store.last.id, label: store.last.title, sub: store.last.sub, url: store.last.url } : null;
  let startAt = 0, scrubbing = false, interrupted = false, lastSaved = 0, wasPlaying = false;
  // wanted: the listener means it to be playing (not paused by them, by an adhan, or finished).
  // rec: set while getting over a dropped connection: { t: where to pick up, attempt, timer }.
  let wanted = false, rec = null, stallTimer = 0;
  const off = initOffline(); // recitations kept on this device
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = store.vol;
  const isPlaying = () => !!audio.src && !audio.paused && !audio.ended;
  const active = () => isPlaying() || !!rec;

  // ---- Markup that lives outside the tab: the docked player, the now-playing screen and one dialog ----
  const tabEl = $('tab-quran'), listEl = $('qp-list'), detailEl = $('qp-detail');
  document.querySelector('.view').insertAdjacentHTML('beforeend',
    `<section class="qp-player" id="qp-player" aria-label="Quran player" hidden>${timeline()}<div class="qp-ctl">`
    + `<button class="qp-meta" type="button" data-q="open" aria-label="Open now playing"><span class="qp-thumb"><span class="qp-art" aria-hidden="true"></span>${eq}</span><span class="qp-txt"><b class="qp-label"></b><small class="qp-sub"></small></span></button>`
    + `<div class="qp-btns">${transport()}</div>`
    + `<div class="qp-side">${btn('fav', 'heart', 'Add this surah to favorites', 'qp-extra qp-heart')}${btn('add', 'add', 'Add this surah to a playlist', 'qp-extra')}${btn('open', 'up', 'Open now playing and the queue')}${btn('dismiss', 'close', 'Stop and close the player')}</div>`
    + '</div></section>');
  document.body.insertAdjacentHTML('beforeend',
    `<div class="qp-now" id="qp-now" role="dialog" aria-modal="true" aria-label="Now playing" hidden><div class="qp-now-in">`
    // Now playing is a card: the surah's picture with the timeline over its foot, then the surah, the three round
    // buttons, a row of quieter ones, and the rest (10 seconds back and on, speed, volume) behind ⋯
    + `<div class="qp-card"><div class="qp-cover"><div class="qp-art qp-art-lg" aria-hidden="true"></div>`
    + `<div class="qp-cover-top">${btn('close', 'down', 'Close now playing', 'qp-on-art')}${btn('dismiss', 'close', 'Stop and close the player', 'qp-on-art')}</div>${timeline()}</div>`
    + `<div class="qp-info"><p class="qp-style"></p><p class="qp-ar" lang="ar" dir="rtl"></p><h2 class="qp-label"></h2><p class="qp-reciter"></p></div>`
    + `<div class="qp-btns qp-round">${btn('prev', 'prev', 'Previous surah')}${btn('toggle', 'play', 'Play', 'qp-play')}${btn('next', 'next', 'Next surah')}</div>`
    + `<div class="qp-more">${btn('fav', 'heart', 'Add this surah to favorites', 'qp-heart')}${btn('shuffle', 'shuffle', 'Shuffle')}${btn('repeat', 'repeat', 'Repeat')}`
    + `${btn('add', 'add', 'Add this surah to a playlist')}<button class="qp-ic" type="button" data-q="extras" aria-expanded="false" aria-controls="qp-extras" aria-label="More controls" title="More controls">${IC.more}</button></div>`
    + `<div class="qp-extras" id="qp-extras" hidden>${btn('back', 'back', 'Back 10 seconds')}${btn('fwd', 'fwd', 'Forward 10 seconds')}`
    + `<button class="d-btn d-btn-sm d-btn-outline qp-rate" type="button" data-q="rate" aria-label="Playback speed">1×</button>`
    + `<label class="qp-vol">${IC.vol}<input type="range" min="0" max="100" step="1" id="qp-vol" aria-label="Volume"></label></div></div>`
    + `<h3 class="qp-h">Up next</h3><ol class="qp-rows qp-queue" id="qp-queue"></ol></div></div>`
    + '<dialog class="qp-dlg" id="qp-dlg" aria-labelledby="qp-dlg-h"><div class="qp-dlg-in" id="qp-dlg-in"></div></dialog>');
  const player = $('qp-player'), now = $('qp-now'), dlg = $('qp-dlg'), dlgIn = $('qp-dlg-in'), app = document.querySelector('.app');
  $('qp-vol').value = Math.round(store.vol * 100);

  // ---- Catalogue ----
  // The lists are kept too (in the 'quran-audio' cache, beside the recitations), so the tab and the queue work offline
  const get = (path) => fetch(`${API}/${path}`).then(r => {
    if (!r.ok) throw new Error(`mp3quran answered ${r.status}`);
    if ('caches' in window) { const copy = r.clone(); caches.open('quran-audio').then(c => c.put(`${API}/${path}`, copy)).catch(() => {}); }
    return r.json();
  }).catch(async (e) => {
    const hit = 'caches' in window && await caches.match(`${API}/${path}`).catch(() => null);
    if (hit) return hit.json();
    throw e;
  });
  function ensureCat() {
    if (cat) return Promise.resolve(cat);
    return catP ||= Promise.all([get('suwar?language=eng'), get('reciters?language=eng'), get('riwayat?language=eng')]).then(([s, r, w]) => {
      const c = buildCatalog(s, r, w);
      if (!c.reciters.length) throw new Error('no reciters');
      cat = c; failed = false;
      if (store.riwaya === 'hafs') { store.riwaya = hafsId(cat); save(); }
      if (store.riwaya !== 'all' && !cat.riwayat.some(x => x.id === store.riwaya)) store.riwaya = 'all';
      $('qp-riwaya').innerHTML = `<option value="all">All riwayat (${cat.moshaf.size} recitations)</option>` + cat.riwayat.map(x => `<option value="${x.id}">${esc(x.name)} (${x.count})</option>`).join('');
      $('qp-riwaya').value = store.riwaya;
      $('qp-riwaya').disabled = false;
      // the old player remembered a reciter and a surah: carry them over once, as the place to start from
      const old = legacyTrack(cat, store.legacy);
      delete store.legacy;
      if (old && !cur) setCurrent(trackInfo(cat, old), 0);
      restoreQueue();
      save();
      loadArabic();
      return cat;
    }).catch((e) => { catP = null; failed = true; console.warn('IqamaHub: Quran list failed', e); throw e; });
  }
  function loadArabic() {
    if (Date.now() - ar.at < 7 * 864e5 && Object.keys(ar.names).length) return;
    get('reciters?language=ar').then((j) => {
      const names = arNames(j);
      if (!Object.keys(names).length) return;
      ar = { at: Date.now(), names };
      try { localStorage.setItem('iqama-quran-ar', JSON.stringify(ar)); } catch (e) {}
      artKey = ''; paintArt();
      if (!tabEl.hidden) renderList();
    }).catch(() => {});
  }
  // The pictures for a track: the reciter's tile and the surah's card
  const reciterOf = (id) => cat?.moshaf.get(+String(id).split(':')[0])?.reciterId;
  const tileFor = (name, rid) => tileArt({ reciter: name, reciterAr: ar.names[rid] });
  let artKey = '';
  function paintArt() {
    const i = cur && info(cur.id), key = i ? `${cur.id}|${ar.names[reciterOf(cur.id)] || ''}` : '';
    if (key === artKey) return;
    artKey = key;
    player.querySelector('.qp-art').innerHTML = i ? tileFor(i.reciter, reciterOf(cur.id)) : '';
    const mk = i && cat?.surahs.get(i.n)?.makki;
    now.querySelector('.qp-art').innerHTML = i ? paintedArt({ n: i.n, makki: mk }) + starArt({ n: i.n, reciter: i.reciter, title: label(i), makki: mk, cover: true }) : '';
    now.querySelector('.qp-ar').textContent = i ? SURAH_AR[i.n - 1] || '' : '';
  }
  // What a track is: from mp3quran's lists, or, with none (offline), from what was kept with the recitation
  function savedInfo(id) {
    const hit = Object.entries(off.list()).find(([, e]) => e.id === id);
    if (!hit) return null;
    const [url, e] = hit, cut = e.sub.indexOf(' · ');
    return { id, n: +id.split(':')[1], title: e.title.replace(/^\d+\.\s*/, ''), reciter: cut < 0 ? e.sub : e.sub.slice(0, cut), style: cut < 0 ? '' : e.sub.slice(cut + 3), url };
  }
  const info = (id) => (cat && trackInfo(cat, id)) || savedInfo(id);
  const label = (i) => `${i.n}. ${i.title}`, sub = (i) => `${i.reciter} · ${i.style}`;
  function setCurrent(i, at) {
    cur = { id: i.id, label: label(i), sub: sub(i), url: i.url };
    store.last = { id: i.id, t: at, title: cur.label, sub: cur.sub, url: i.url, queue: (q ? q.ids : [i.id]).slice(0, 400) };
  }
  // After a reload only the saved track ids are known; this rebuilds the queue once the catalogue is in
  function restoreQueue() {
    if (q || !cur || !cat) return;
    let ids = (store.last?.queue || []).filter(id => info(id));
    if (ids.length < 2 || !ids.includes(cur.id)) { const m = cat.moshaf.get(+cur.id.split(':')[0]); ids = m ? m.surahs.map(s => trackId(m.id, s)) : [cur.id]; }
    if (!ids.includes(cur.id)) ids = [cur.id];
    q = makeQueue(ids, ids.indexOf(cur.id), store.shuffle);
  }

  // ---- Playback ----
  function start() {
    stopOthers();
    interrupted = false;
    wanted = true;
    audio.preload = 'auto'; // once playing, let the browser read well ahead, so a short drop is not heard at all
    // the last try failed (or the connection went while it was paused): load it again from the same place
    if (audio.error && cur && cur.url) { rec ||= { t: audio.currentTime || store.last?.t || 0, attempt: 0, timer: 0 }; return retry(); }
    audio.play().catch((err) => {
      if (err && err.name === 'AbortError') return;
      if (rec || audio.error) return paint(); // the 'error' event has it: either a retry is planned, or it already said why not
      say(err && err.name === 'NotAllowedError' ? 'Tap play to start the recitation.' : 'This recitation could not play. Check the connection.');
      paint();
    });
  }
  // ---- Getting over a dropped connection: keep the place, try again with longer and longer waits, and at once
  // when the device says it is back online; then carry on from the same second ----
  function stopRecover() {
    clearTimeout(stallTimer); stallTimer = 0;
    if (rec) { clearTimeout(rec.timer); rec = null; }
  }
  function retry() {
    if (!rec || !cur || !cur.url) return;
    clearTimeout(rec.timer); rec.timer = 0;
    if (navigator.onLine !== false) rec.attempt++; // tries made while offline do not count against the limit
    startAt = rec.t;
    audio.src = off.src(cur.url); // kept on the device by now? then it carries on with no connection at all
    audio.playbackRate = store.rate;
    audio.play().catch(() => {}); // a failure comes back as an 'error' event, which plans the next try
    paint();
  }
  // Returns false when it is not worth trying again (then the caller says so)
  function lost(code) {
    if (!wanted || !cur || !cur.url) return false;
    const online = navigator.onLine !== false;
    if (!shouldRetry(code, rec ? rec.attempt : 0, online)) { stopRecover(); wanted = false; return false; }
    if (!rec) {
      rec = { t: audio.currentTime || startAt || 0, attempt: 0, timer: 0 };
      say('The connection dropped. The recitation will carry on from here when it is back.');
    } else if (audio.currentTime > 0) rec.t = audio.currentTime;
    clearTimeout(rec.timer);
    // offline the 'online' event usually comes first; the slow timer is there for devices that never send it
    rec.timer = setTimeout(retry, (online ? retryWait(rec.attempt) : 30) * 1000);
    paint(); paintTime();
    return true;
  }
  // The user (or an adhan) paused: nothing to get back to
  function pause() { wanted = false; stopRecover(); audio.pause(); paint(); }
  addEventListener('online', () => { if (rec) retry(); });

  function load(id, at, autoplay) {
    const i = info(id);
    if (!i) return say('That recitation is no longer on mp3quran.net.');
    stopRecover();
    setCurrent(i, at);
    save();
    startAt = at;
    audio.src = off.src(i.url);
    audio.playbackRate = store.rate;
    showPlayer();
    paint(); paintTime(); mediaMeta();
    if (!now.hidden) renderQueue();
    if (autoplay) start();
  }
  function playQueue(ids, index) {
    q = makeQueue(ids, index, store.shuffle);
    load(current(q), 0, true);
  }
  function togglePlay() {
    if (!cur) return;
    if (active()) return pause(); // also stops waiting for a dropped connection
    if (!audio.src) { // first play after a reload: start from the saved place at once, and fetch the lists behind it
      const at = store.last?.t || 0;
      if (!cur.url) return void ensureCat().then(() => { restoreQueue(); load(cur.id, at, true); }).catch(() => say('Could not load the reciters. Check the connection.'));
      startAt = at;
      audio.src = off.src(cur.url);
      audio.playbackRate = store.rate;
      ensureCat().then(() => { restoreQueue(); if (!now.hidden) renderQueue(); }).catch(() => {});
      mediaMeta();
    }
    start();
  }
  // Offline, only what is kept on this device can play: the queue passes over the rest
  const offline = () => navigator.onLine === false;
  const playable = (id) => { const i = info(id); return !!i && (!offline() || off.has(i.url)); };
  function nextPos(dir) {
    let p = q.pos;
    for (let k = 0; k < q.ids.length; k++) {
      p = stepPos({ ...q, pos: p }, dir, store.repeat);
      if (p < 0 || playable(q.ids[q.order[p]])) return p;
    }
    return -1;
  }
  function step(dir) {
    const go = () => {
      restoreQueue();
      if (!q) return;
      if (dir < 0 && audio.currentTime > 3) { audio.currentTime = 0; return; }
      const p = nextPos(dir);
      if (p < 0) return say(offline() ? 'No other surah in this list is saved on this device.' : dir > 0 ? 'That was the last surah in this list.' : 'This is the first surah in this list.');
      q.pos = p;
      load(current(q), 0, true);
    };
    if (q) return go(); // the queue is already there: no need for the lists (they may not load offline)
    ensureCat().then(go).catch(() => say('Could not load the list. Check the connection.'));
  }
  const seekBy = (s) => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(Math.max(0, audio.currentTime + s), audio.duration - .25); };
  // Stop and close: the × on the bar or on the picture in Now playing, or a swipe. The bar leaves (a short fade and drop, or
  // the swipe's own slide), and Undo, for 8 seconds, brings back the same surah, queue and place, paused.
  function dismiss({ swiped = false } = {}) {
    const snap = cur ? { cur: { ...cur }, q: q && JSON.parse(JSON.stringify(q)), last: store.last && { ...store.last }, t: audio.currentTime || store.last?.t || 0 } : null;
    wanted = false; stopRecover();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    cur = null; q = null; store.last = null; interrupted = false;
    save();
    paint();
    const hide = () => { player.hidden = true; player.style.transform = ''; player.style.opacity = ''; player.style.transition = ''; };
    if (swiped) hide();
    else mo.done(mo.animate(player, { opacity: [1, 0], transform: ['none', 'translateY(12px)'] }, { duration: mo.T.dur.fast * .85, ease: 'easeOut' })).then(hide);
    if (snap) say('Player closed.', { label: 'Undo', fn: () => restore(snap) });
  }
  function restore(s) {
    if (cur) return; // something else started in the meantime
    q = s.q; cur = s.cur; store.last = s.last ? { ...s.last, t: s.t } : null;
    save();
    startAt = s.t;
    audio.src = off.src(cur.url);
    audio.playbackRate = store.rate;
    showPlayer(); paint(); paintTime(); mediaMeta();
  }
  audio.addEventListener('loadedmetadata', () => {
    if (startAt > 0 && startAt < audio.duration - 5) audio.currentTime = startAt;
    startAt = 0;
    paintTime();
  });
  audio.addEventListener('ended', () => {
    const r = q ? (store.repeat === 'one' ? 'again' : nextPos(1)) : -1;
    if (r === 'again') { audio.currentTime = 0; return start(); }
    if (r >= 0) { q.pos = r; return load(current(q), 0, true); }
    wanted = false;
    if (store.last) { store.last.t = 0; save(); }
    paint();
  });
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    if (!lost(audio.error ? audio.error.code : 0)) say('This recitation could not load. Check the connection, or try another reciter.');
    paint();
  });
  // Some browsers never raise an error when the connection goes mid-surah; they just wait. After 20 seconds of
  // waiting (3 when the device already knows it is offline), start again from the same place.
  const watchStall = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => { if (wanted && !audio.paused && audio.readyState < 3) lost(0); }, navigator.onLine === false ? 3000 : 20000);
  };
  audio.addEventListener('waiting', watchStall);
  audio.addEventListener('stalled', () => { if (wanted && !audio.paused && audio.readyState < 3) watchStall(); });
  // Keep what is played, and fetch the next surah in the queue ahead, so the list carries on if the connection goes
  function keepAhead() {
    if (!cur || !cur.url) return;
    const p = q && cat ? afterEnd(q, store.repeat) : -1;
    const next = p === 'again' || p < 0 ? null : info(q.ids[q.order[p]]);
    off.guard([cur.url, next && next.url]);
    off.keep(cur.url, { id: cur.id, title: cur.label, sub: cur.sub });
    if (next) off.keep(next.url, { id: next.id, title: label(next), sub: sub(next) });
  }
  audio.addEventListener('playing', () => {
    keepAhead();
    clearTimeout(stallTimer); stallTimer = 0;
    if (rec) { stopRecover(); say('Back online. Carrying on.'); }
  });
  for (const ev of ['play', 'playing', 'pause', 'waiting', 'canplay']) audio.addEventListener(ev, paint);
  for (const ev of ['timeupdate', 'durationchange', 'progress', 'seeked']) audio.addEventListener(ev, paintTime);
  audio.addEventListener('timeupdate', () => {
    if (rec || startAt) return; // reloading after a drop sends the clock to 0 for a moment: that is not the place to keep
    if (store.last && Math.abs(audio.currentTime - lastSaved) >= 5) { lastSaved = store.last.t = audio.currentTime; save(); }
  });
  const keepPlace = () => { if (store.last && audio.getAttribute('src') && !audio.ended && audio.currentTime > 0) { store.last.t = audio.currentTime; save(); } };
  audio.addEventListener('pause', keepPlace);
  addEventListener('pagehide', keepPlace);

  // Lock screen and headset buttons
  function mediaMeta() {
    if (!('mediaSession' in navigator) || !cur) return;
    const mk = cat?.surahs.get(+String(cur.id).split(':')[1])?.makki;
    const set = (artwork) => { try { navigator.mediaSession.metadata = new MediaMetadata({ title: cur.label, artist: cur.sub, album: `Quran · ${isMakki(+String(cur.id).split(':')[1], mk) ? 'Makki' : 'Madani'}`, artwork }); } catch (e) {} };
    const icon = [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }], i = info(cur.id), id = cur.id;
    set(icon);
    if (!i) return;
    // the surah's painting as the lock-screen picture, the app icon where it cannot be shown
    set([{ src: new URL(paintingOf(i.n, mk), location.href).href, sizes: '720x720', type: 'image/webp' }, ...icon]);
  }
  if ('mediaSession' in navigator) {
    const on = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch (e) {} };
    on('play', togglePlay); on('pause', pause);
    on('previoustrack', () => step(-1)); on('nexttrack', () => step(1));
    on('seekbackward', (d) => seekBy(-(d.seekOffset || 10))); on('seekforward', (d) => seekBy(d.seekOffset || 10));
    on('seekto', (d) => { if (Number.isFinite(d.seekTime)) audio.currentTime = d.seekTime; });
  }

  // ---- Painting the player (the docked bar and the now-playing screen share every control) ----
  const all = (sel) => document.querySelectorAll(`#qp-player ${sel}, #qp-now ${sel}`);
  function showPlayer() {
    if (!player.hidden) return;
    player.hidden = false;
    mo.rise(player, mo.T.dist.lg);
  }
  function paint() {
    const playing = active(), busy = !!rec || (playing && audio.readyState < 3);
    for (const el of [player, now]) el.dataset.state = busy ? 'loading' : playing ? 'playing' : 'paused';
    all('.qp-label').forEach(el => { el.textContent = cur ? cur.label : ''; });
    all('.qp-sub').forEach(el => { el.textContent = cur ? cur.sub : ''; });
    const cut = cur ? cur.sub.indexOf(' · ') : -1; // "Reciter · Riwayah · Style"
    now.querySelector('.qp-reciter').textContent = cur ? (cut < 0 ? cur.sub : cur.sub.slice(0, cut)) : '';
    now.querySelector('.qp-style').textContent = cur && cut >= 0 ? cur.sub.slice(cut + 3) : '';
    paintArt();
    all('[data-q="toggle"]').forEach(el => {
      if (playing !== wasPlaying || !el.firstElementChild) { el.innerHTML = playing ? IC.pause : IC.play; mo.swap(el.firstElementChild); }
      el.setAttribute('aria-label', playing ? 'Pause' : 'Play'); el.title = playing ? 'Pause' : 'Play';
    });
    wasPlaying = playing;
    all('[data-q="repeat"]').forEach(el => {
      el.innerHTML = store.repeat === 'one' ? IC.repeat1 : IC.repeat;
      el.setAttribute('aria-pressed', String(store.repeat !== 'off')); el.setAttribute('aria-label', `${REPEAT_TEXT[store.repeat]}. Change repeat`); el.title = REPEAT_TEXT[store.repeat];
    });
    all('[data-q="shuffle"]').forEach(el => { el.setAttribute('aria-pressed', String(store.shuffle)); el.title = store.shuffle ? 'Shuffle is on' : 'Shuffle is off'; });
    const fav = !!cur && store.favT.includes(cur.id);
    all('[data-q="fav"]').forEach(el => { el.setAttribute('aria-pressed', String(fav)); el.setAttribute('aria-label', fav ? 'Remove this surah from favorites' : 'Add this surah to favorites'); });
    all('[data-q="rate"]').forEach(el => { el.textContent = `${store.rate}×`; });
    markRows();
    if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {}
  }
  // The row of whatever is playing shows moving bars in place of its number
  function markRows() {
    const playing = isPlaying();
    document.querySelectorAll('li[data-track]').forEach(li => {
      const on = !!cur && li.dataset.track === cur.id;
      li.classList.toggle('is-cur', on);
      li.classList.toggle('is-playing', on && playing);
    });
  }
  function paintTime() {
    const d = audio.duration, has = Number.isFinite(d) && d > 0;
    const t = rec ? rec.t : audio.getAttribute('src') ? (startAt || audio.currentTime) : (store.last?.t || 0);
    let buf = 0;
    try { for (let i = 0; i < audio.buffered.length; i++) if (audio.buffered.start(i) <= t + 1) buf = Math.max(buf, audio.buffered.end(i)); } catch (e) {}
    all('.qp-fill').forEach(el => { if (!scrubbing) el.style.transform = `scaleX(${has ? Math.min(1, t / d) : 0})`; });
    all('.qp-buf').forEach(el => { el.style.transform = `scaleX(${has ? Math.min(1, buf / d) : 0})`; });
    all('.qp-cur').forEach(el => { if (!scrubbing) el.textContent = fmtTime(t); });
    all('.qp-dur').forEach(el => { el.textContent = has ? fmtTime(d) : '–:––'; });
    const ring = String(100 - (has ? Math.min(1, t / d) : 0) * 100); // the bar, Now playing and the current row in the list
    document.querySelectorAll('.qp-ring').forEach(el => { if (el.getAttribute('stroke-dashoffset') !== ring) el.setAttribute('stroke-dashoffset', ring); });
    all('.qp-seek').forEach(el => {
      el.disabled = !has;
      if (!scrubbing) el.value = has ? Math.round(t / d * 1000) : 0;
      el.setAttribute('aria-valuetext', has ? `${fmtTime(t)} of ${fmtTime(d)}` : 'Not loaded yet');
    });
  }
  // Scrubbing: the fill and the time follow the thumb; the audio jumps when the thumb is let go
  function onScrub(e) {
    if (!e.target.classList.contains('qp-seek') || !Number.isFinite(audio.duration)) return;
    const frac = e.target.value / 1000;
    if (e.type === 'input') {
      scrubbing = true;
      all('.qp-fill').forEach(el => { el.style.transform = `scaleX(${frac})`; });
      all('.qp-cur').forEach(el => { el.textContent = fmtTime(frac * audio.duration); });
    } else {
      scrubbing = false;
      audio.currentTime = frac * audio.duration;
    }
  }
  for (const el of [player, now]) { el.addEventListener('input', onScrub); el.addEventListener('change', onScrub); }
  $('qp-vol').addEventListener('input', (e) => { store.vol = audio.volume = e.target.value / 100; save(); });

  // ---- Now playing, with the queue ----
  function renderQueue() {
    const ol = $('qp-queue');
    if (!q) { ol.innerHTML = '<li class="qp-empty">The queue shows here once the lists have loaded.</li>'; return; }
    const upcoming = q.order.slice(q.pos + 1, q.pos + 51).map((ix, k) => ({ id: q.ids[ix], pos: q.pos + 1 + k }));
    ol.innerHTML = upcoming.length ? upcoming.map(({ id, pos }) => {
      const i = info(id);
      return i ? `<li class="qp-row"><button class="qp-main" type="button" data-q="jump" data-pos="${pos}"><span class="qp-no">${i.n}</span><span class="qp-txt"><b>${esc(i.title)}</b><small>${esc(sub(i))}</small></span></button></li>` : '';
    }).join('') : `<li class="qp-empty">${store.repeat === 'all' ? 'The list starts again after this surah.' : 'Nothing after this surah.'}</li>`;
  }
  let nowOpen = false; // set at once on close, while the sheet is still sliding away
  function openNow(fromHistory = false) {
    if (!cur || nowOpen) return;
    nowOpen = true;
    if (!fromHistory) pushStep({ qp: 'now', d: detail });
    renderQueue();
    now.hidden = false;
    app.inert = true;
    now.scrollTop = 0; // open at the top: the picture, the surah and the controls
    mo.sheetIn(now.firstElementChild);
    now.querySelector('[data-q="close"]').focus({ preventScroll: true }); // the sheet is still below the screen as it slides in: focusing must not scroll it
    ensureCat().then(() => { restoreQueue(); renderQueue(); }).catch(() => {});
  }
  function closeNow(fromHistory = false) {
    if (!nowOpen) return;
    nowOpen = false;
    if (!fromHistory && hState().qp === 'now') history.back(); // its history step goes too
    app.inert = false;
    mo.done(mo.sheetOut(now.firstElementChild)).then(() => { now.hidden = true; now.firstElementChild.style.cssText = ''; });
    player.querySelector('.qp-side [data-q="open"]').focus();
  }
  now.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeNow(); } });

  function onPlayerClick(e) {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const a = b.dataset.q;
    if (a === 'toggle') togglePlay();
    else if (a === 'prev') step(-1);
    else if (a === 'next') step(1);
    else if (a === 'back') seekBy(-10);
    else if (a === 'fwd') seekBy(10);
    else if (a === 'repeat') { store.repeat = nextRepeat(store.repeat); save(); paint(); say(`${REPEAT_TEXT[store.repeat]}.`); if (!now.hidden) renderQueue(); }
    else if (a === 'shuffle') { store.shuffle = !store.shuffle; if (q) q = reshuffle(q, store.shuffle); save(); paint(); say(store.shuffle ? 'Shuffle is on.' : 'Shuffle is off.'); if (!now.hidden) renderQueue(); }
    else if (a === 'fav') { if (cur) { favTrack(cur.id); mo.pop(b.firstElementChild); } }
    else if (a === 'add') { if (cur) openAdd(cur.id, cur.label); }
    else if (a === 'rate') { store.rate = audio.playbackRate = nextRate(store.rate); save(); paint(); }
    else if (a === 'extras') { const x = $('qp-extras'), open = x.hidden; x.hidden = !open; b.setAttribute('aria-expanded', String(open)); if (open) mo.fade(x); }
    else if (a === 'open') openNow();
    else if (a === 'close') closeNow();
    else if (a === 'dismiss') { if (nowOpen) closeNow(); dismiss(); }
    else if (a === 'jump' && q) { q.pos = +b.dataset.pos; load(current(q), 0, true); }
  }
  player.addEventListener('click', onPlayerClick);
  now.addEventListener('click', onPlayerClick);

  // ---- Swipe the bar (touch and pen), from the title or an empty part of it, never the buttons or the timeline:
  // - sideways: it follows the finger and fades; let go past half its width, or flick, and it slides off and closes
  //   (with Undo); let go sooner and it settles back. The × is the same action for mouse, keyboard and remote.
  // - up: it lifts a little with the finger; let go past 40px, or flick up, and Now playing opens (the ⌃ does the same). ----
  const quiet = () => mo.calm() || document.documentElement.dataset.palette === 'eink';
  let drag = null, dragged = false;
  player.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !cur || e.target.closest('.qp-btns, .qp-side, .qp-time, input')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, on: '', v: 0, lx: e.clientX, ly: e.clientY, lt: e.timeStamp };
  });
  player.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.on) {
      const up = dy < -10 && -dy > Math.abs(dx);
      if (!up && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // a pull down: not ours
      if (!up && Math.abs(dx) < 10) return;
      drag.on = up ? 'up' : 'side'; try { player.setPointerCapture(e.pointerId); } catch (err) {} player.style.transition = 'none';
    }
    const dt = Math.max(1, e.timeStamp - drag.lt);
    drag.v = (drag.on === 'up' ? e.clientY - drag.ly : e.clientX - drag.lx) / dt;
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = e.timeStamp; drag.dx = dx; drag.dy = dy;
    if (quiet()) return;
    if (drag.on === 'up') player.style.transform = `translateY(${Math.max(-48, Math.min(0, dy)) / 2}px)`;
    else {
      player.style.transform = `translateX(${dx}px)`;
      player.style.opacity = String(1 - Math.min(1, Math.abs(dx) / player.offsetWidth) * .6);
    }
  });
  const settle = () => {
    player.style.transition = quiet() ? 'none' : 'transform .3s cubic-bezier(.2, 0, 0, 1), opacity .3s cubic-bezier(.2, 0, 0, 1)'; // settles back, no bounce
    player.style.transform = ''; player.style.opacity = '';
    setTimeout(() => { player.style.transition = ''; }, 300);
  };
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.on) return;
    dragged = true; setTimeout(() => { dragged = false; }, 0); // the click that ends a drag opens nothing
    const kept = e.type !== 'pointercancel';
    if (d.on === 'up') { settle(); if (kept && (d.dy < -40 || d.v < -.4)) openNow(); return; }
    const w = player.offsetWidth, out = kept && (Math.abs(d.dx) > w / 2 || (Math.abs(d.v) > .5 && Math.sign(d.v) === Math.sign(d.dx)));
    if (out) {
      if (quiet()) return dismiss({ swiped: true });
      player.style.transition = 'transform .2s ease-out, opacity .2s ease-out';
      player.style.transform = `translateX(${Math.sign(d.dx || 1) * w}px)`; player.style.opacity = '0';
      setTimeout(() => dismiss({ swiped: true }), 200);
    } else settle();
  }
  player.addEventListener('pointerup', endDrag);
  player.addEventListener('pointercancel', endDrag);
  player.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); } }, true);

  // ---- Pull Now playing down to dock it (touch): a downward drag that starts on the card, away from its controls, while the
  // screen is scrolled to the top. The sheet follows the finger; let go past a quarter of the screen, or flick down, and it
  // closes into the bar (the music carries on); let go sooner and it settles back. Touch events, not pointer events, so the
  // drag can be told apart from scrolling and the page still scrolls up as usual. ----
  let pull = null;
  const sheet = () => now.firstElementChild;
  now.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    pull = e.touches.length === 1 && now.scrollTop <= 0 && e.target.closest('.qp-card') && !e.target.closest('button, input, label, .qp-time')
      ? { x: t.clientX, y: t.clientY, dy: 0, v: 0, ly: t.clientY, lt: e.timeStamp, on: false } : null;
  }, { passive: true });
  now.addEventListener('touchmove', (e) => {
    if (!pull) return;
    const t = e.touches[0], dy = t.clientY - pull.y, dx = t.clientX - pull.x;
    if (!pull.on) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { pull = null; return; } // sideways: not ours
      if (dy < -6) { pull = null; return; } // up: a scroll
      if (dy < 10) return;
      pull.on = true; sheet().style.transition = 'none';
    }
    e.preventDefault(); // the drag, not a scroll or the browser's pull-to-refresh
    const dt = Math.max(1, e.timeStamp - pull.lt);
    pull.v = (t.clientY - pull.ly) / dt; pull.ly = t.clientY; pull.lt = e.timeStamp; pull.dy = Math.max(0, dy);
    if (!quiet()) sheet().style.transform = `translateY(${pull.dy}px)`;
  }, { passive: false });
  function endPull(e) {
    const p = pull; pull = null;
    if (!p || !p.on) return;
    if (e.type !== 'touchcancel' && (p.dy > innerHeight / 4 || p.v > .5)) return closeNow(); // slides on down from where it is
    const el = sheet();
    el.style.transition = quiet() ? 'none' : 'transform .3s cubic-bezier(.2, 0, 0, 1)';
    el.style.transform = '';
    setTimeout(() => { el.style.transition = ''; }, 300);
  }
  now.addEventListener('touchend', endPull);
  now.addEventListener('touchcancel', endPull);

  // ---- Back, on every screen size: opening a reciter, a surah or a playlist, Now playing, and the Quran dialogs each add
  // one history step (the address stays #quran), so the phone's back gesture, the browser's Back and the ← in the page
  // all step back through them: back to the list, or to the reciter you came from. ----
  function hState() { return history.state || {}; }
  function pushStep(st) { history.pushState(st, ''); }
  addEventListener('popstate', (e) => {
    const st = e.state || {};
    if (st.qp !== 'dlg' && dlg.open) { dlgPopping = true; dlg.close(); dlgPopping = false; }
    if (st.qp !== 'now' && nowOpen) closeNow(true);
    if (location.hash !== '#quran') return;
    const d = st.d || null;
    if (JSON.stringify(d) === JSON.stringify(detail)) { setPane(d ? 'detail' : 'list'); return; }
    if (d) openDetail(d, true);
    else {
      detail = null; setPane('list'); renderList(); renderDetail();
      (listEl.querySelector('.is-open .qp-main') || listEl.querySelector('.qp-main'))?.focus({ preventScroll: true });
    }
  });

  // ---- Favorites and playlists ----
  function favTrack(id) {
    store.favT = toggle(store.favT, id); save();
    say(store.favT.includes(id) ? 'Added to your favorite surahs.' : 'Removed from your favorite surahs.');
    paint();
    document.querySelectorAll(`li[data-track="${id}"] [data-act="fav-t"]`).forEach(b => b.setAttribute('aria-pressed', String(store.favT.includes(id))));
    if (view === 'favorites' && !query) renderList();
  }
  function favReciter(id) {
    store.favR = toggle(store.favR, id); save();
    say(store.favR.includes(id) ? 'Added to your favorite reciters.' : 'Removed from your favorite reciters.');
    tabEl.querySelectorAll(`[data-act="fav-r"][data-id="${id}"]`).forEach(b => b.setAttribute('aria-pressed', String(store.favR.includes(id))));
    if (view === 'favorites' && !query) renderList();
  }
  const listById = (id) => store.lists.find(l => l.id === id);
  const count = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

  function showDlg(html, focusSel) {
    dlgIn.innerHTML = html;
    if (!dlg.open) { dlg.showModal(); pushStep({ qp: 'dlg', d: detail }); mo.sheetIn(dlgIn); }
    (focusSel && dlgIn.querySelector(focusSel) || dlgIn.querySelector('button')).focus();
  }
  const closeDlg = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDlg(); }); // a tap on the dimmed backdrop
  let dlgPopping = false;
  dlg.addEventListener('close', () => { if (!dlgPopping && hState().qp === 'dlg') history.back(); }); // closed by a button or Escape: its history step goes too
  function openAdd(track, name) {
    const rowsHtml = store.lists.map(l => {
      const has = l.tracks.includes(track);
      return `<li><button class="qp-pick" type="button" data-d="pick" data-id="${esc(l.id)}"${has ? ' disabled' : ''}><b>${esc(l.name)}</b><small>${has ? 'Already in this playlist' : count(l.tracks.length, 'surah')}</small></button></li>`;
    }).join('');
    showDlg(`<h3 id="qp-dlg-h">Add to a playlist</h3><p class="qp-dlg-sub">${esc(name)}</p>`
      + (rowsHtml ? `<ul class="qp-picks">${rowsHtml}</ul>` : '<p class="iq-note">You have no playlists yet. Name one below.</p>')
      + `<form class="qp-form" data-d="create-add"><input class="d-input" name="name" maxlength="40" placeholder="New playlist name" aria-label="New playlist name" autocomplete="off"><button class="d-btn d-btn-primary" type="submit">Create and add</button></form>`
      + '<div class="qp-dlg-foot"><button class="d-btn d-btn-ghost" type="button" data-d="cancel">Cancel</button></div>', store.lists.some(l => !l.tracks.includes(track)) ? '.qp-pick:not([disabled])' : 'input');
    dlg.dataset.track = track;
  }
  function openName(id) {
    const l = id && listById(id);
    showDlg(`<h3 id="qp-dlg-h">${l ? 'Rename playlist' : 'New playlist'}</h3>`
      + `<form class="qp-form" data-d="${l ? 'rename' : 'create'}" data-id="${l ? esc(l.id) : ''}"><input class="d-input" name="name" maxlength="40" value="${l ? esc(l.name) : ''}" placeholder="Playlist name" aria-label="Playlist name" autocomplete="off"><button class="d-btn d-btn-primary" type="submit">Save</button></form>`
      + '<div class="qp-dlg-foot"><button class="d-btn d-btn-ghost" type="button" data-d="cancel">Cancel</button></div>', 'input');
  }
  function openDelete(id) {
    const l = listById(id);
    if (!l) return;
    showDlg(`<h3 id="qp-dlg-h">Delete “${esc(l.name)}”?</h3><p class="qp-dlg-sub">This removes the playlist and its list of ${count(l.tracks.length, 'surah')} from this device. It cannot be undone.</p>`
      + `<div class="qp-dlg-foot"><button class="d-btn d-btn-ghost" type="button" data-d="cancel">Keep it</button><button class="d-btn d-btn-error" type="button" data-d="delete" data-id="${esc(l.id)}">Delete playlist</button></div>`, '[data-d="cancel"]');
  }
  // A saved surah: what it is, and the way to remove it
  function openSaved(i) {
    const e = off.entry(i.url);
    if (!e) return;
    showDlg(`<h3 id="qp-dlg-h">Saved on this device</h3><p class="qp-dlg-sub">${esc(label(i))} · ${esc(i.reciter)} · ${MB(e.bytes)}</p>`
      + `<p class="iq-note">${e.kind === 'download' ? 'You downloaded it, so it stays until you remove it.' : 'Saved when it was played. If the device runs short of space, the surahs played longest ago are removed first.'}</p>`
      + `<div class="qp-dlg-foot"><button class="d-btn d-btn-ghost" type="button" data-d="cancel">Close</button>`
      + (e.kind === 'download' ? '' : `<button class="d-btn d-btn-outline" type="button" data-d="pin" data-u="${esc(i.url)}">Keep it for good</button>`)
      + `<button class="d-btn d-btn-error" type="button" data-d="unsave" data-u="${esc(i.url)}">Remove from this device</button></div>`, '[data-d="cancel"]');
  }
  // Download a whole recitation: say how much it is first
  function openDlAll(m) {
    if (!m) return;
    if (offline()) return say('Connect to the internet to download.');
    const todo = m.surahs.map(s => info(trackId(m.id, s))).filter(i => i && !off.has(i.url));
    showDlg(`<h3 id="qp-dlg-h">Download ${count(todo.length, 'surah')}?</h3><p class="qp-dlg-sub">${esc(m.reciter)} · ${esc(m.style)}</p>`
      + '<p class="iq-note" id="qp-dl-size">Checking the size…</p>'
      + `<div class="qp-dlg-foot"><button class="d-btn d-btn-ghost" type="button" data-d="cancel">Cancel</button><button class="d-btn d-btn-primary" type="button" data-d="dl-go" data-m="${m.id}">Download</button></div>`, '[data-d="dl-go"]');
    const sizes = new Array(todo.length).fill(0);
    let next = 0;
    const worker = async () => { while (next < todo.length) { const k = next++; sizes[k] = await off.size(todo[k].url); } };
    Promise.all([Promise.all(Array.from({ length: 6 }, worker)), off.space()]).then(([, sp]) => {
      const el = $('qp-dl-size');
      if (!el || !dlg.open) return;
      const total = sizes.reduce((a, b) => a + b, 0), known = sizes.every(Boolean);
      el.textContent = (total ? `About ${MB(total)}${known ? '' : ' or more'}.` : 'The size is not known.')
        + (sp && sp.quota ? ` This device has ${MB(sp.free)} free.` : '')
        + (sp && sp.quota && total > sp.free - 300e6 ? ' That is not enough room for all of it.' : ' They download one at a time; you can keep using the app.');
    });
  }
  function openClear() {
    const n = Object.keys(off.list()).length;
    if (!n) return;
    showDlg(`<h3 id="qp-dlg-h">Remove all ${count(n, 'surah')} from this device?</h3><p class="qp-dlg-sub">They will need the internet to play again. Your favorites and playlists stay.</p>`
      + '<div class="qp-dlg-foot"><button class="d-btn d-btn-ghost" type="button" data-d="cancel">Keep them</button><button class="d-btn d-btn-error" type="button" data-d="clear">Remove all</button></div>', '[data-d="cancel"]');
  }
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (!b) return;
    const d = b.dataset.d;
    if (d === 'unsave') { off.remove(b.dataset.u); say('Removed from this device.'); closeDlg(); }
    else if (d === 'pin') { const en = off.entry(b.dataset.u); if (en) off.keep(b.dataset.u, en, 'download'); say('It stays on this device until you remove it.'); closeDlg(); }
    else if (d === 'dl-go') {
      const m = cat.moshaf.get(+b.dataset.m);
      dlAllOn.add(m.id);
      for (const s of m.surahs) { const i = info(trackId(m.id, s)); if (i) off.keep(i.url, { id: i.id, title: label(i), sub: sub(i) }, 'download'); }
      say('Downloading. You can keep using the app.');
      closeDlg();
      renderDetail();
    } else if (d === 'clear') {
      for (const url of Object.keys(off.list())) off.remove(url);
      say('Removed from this device.');
      closeDlg();
    }
  });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]');
    if (!b) return;
    const a = b.dataset.d;
    if (a === 'cancel') closeDlg();
    else if (a === 'pick') {
      store.lists = addToList(store.lists, b.dataset.id, dlg.dataset.track); save();
      say(`Added to ${listById(b.dataset.id).name}.`);
      closeDlg(); refreshLists(); if (detail?.type === 'list') renderDetail();
    } else if (a === 'delete') {
      store.lists = removeList(store.lists, b.dataset.id); save();
      if (detail?.type === 'list' && detail.id === b.dataset.id) { detail = null; setPane('list'); }
      say('Playlist deleted.');
      closeDlg(); refreshLists(); renderDetail();
    }
  });
  dlg.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, name = cleanName(f.elements.name.value), a = f.dataset.d;
    if (!name) { say('Give the playlist a name first.'); return f.elements.name.focus(); }
    closeDlg();
    if (a === 'rename') { store.lists = renameList(store.lists, f.dataset.id, name); say('Playlist renamed.'); }
    else {
      store.lists = addList(store.lists, name);
      const made = store.lists[store.lists.length - 1];
      if (a === 'create-add') { store.lists = addToList(store.lists, made.id, dlg.dataset.track); say(`Added to ${name}.`); }
      else { say(`Playlist “${name}” created.`); save(); view = 'playlists'; return openDetail({ type: 'list', id: made.id }); }
    }
    save();
    refreshLists(); if (detail?.type === 'list') renderDetail();
  });
  const refreshLists = () => { if (view === 'playlists' && !query) renderList(); };

  // ---- The tab: a list on the left (reciters, surahs, favorites, playlists or search results) and a detail on the right ----
  const heart = (act, on, text, attrs = '') => `<button class="qp-ic qp-heart" type="button" data-act="${act}" ${attrs} aria-pressed="${on}" aria-label="${esc(text)}" title="Favorite">${IC.heart}</button>`;
  const main = (act, attrs, no, title, small, lead = '') => `<button class="qp-main" type="button" data-act="${act}" ${attrs}>${lead}${no == null ? '' : `<span class="qp-no">${no}</span>`}${eq}<span class="qp-txt"><b>${esc(title)}</b>${small ? `<small>${esc(small)}</small>` : ''}</span></button>`;
  const recRow = (r) => {
    const ms = moshafOf(cat, r, store.riwaya), open = detail?.type === 'reciter' && detail.id === r.id;
    return `<li class="qp-row${open ? ' is-open' : ''}">${main('open-reciter', `data-id="${r.id}"`, null, r.name, ms.length === 1 ? ms[0].style : count(ms.length, 'recitation'), `<span class="qp-art qp-art-sm" aria-hidden="true">${tileFor(r.name, r.id)}</span>`)}${heart('fav-r', store.favR.includes(r.id), `Favorite reciter: ${r.name}`, `data-id="${r.id}"`)}</li>`;
  };
  const surahRow = (s) => `<li class="qp-row${detail?.type === 'surah' && detail.n === s.n ? ' is-open' : ''}">${main('open-surah', `data-n="${s.n}"`, s.n, s.name, s.makki ? 'Makki' : 'Madani')}</li>`;
  // The download button: an arrow (not on this device), a ring filling up (downloading) or a tick (saved here)
  const DL_TEXT = { none: 'Download for offline listening', busy: 'Downloading. Tap to cancel', kept: 'Saved on this device' };
  function dlBtn(i, title) {
    const st = (i && off.state(i.url)) || 'none';
    return `<button class="qp-ic qp-dl" type="button" data-act="dl" data-state="${st}" style="--p:${i ? off.progress(i.url) : 0}" aria-label="${esc(`${DL_TEXT[st]}: ${title}`)}" title="${DL_TEXT[st]}"${i && off.ok ? '' : ' disabled'}>${st === 'kept' ? IC.done : st === 'busy' ? IC.stop : IC.dl}</button>`;
  }
  const savedAttr = (id) => { const i = info(id); return i && off.has(i.url) ? ' data-saved' : ''; };
  const trackRow = (id, no, title, small) => `<li class="qp-row" data-track="${id}"${savedAttr(id)}>${main('play', '', no, title, small, `<span class="qp-go" aria-hidden="true">${IC.play}</span>`)}`
    + `${heart('fav-t', store.favT.includes(id), `Favorite: ${title}`)}<button class="qp-ic" type="button" data-act="add" aria-label="Add ${esc(title)} to a playlist" title="Add to a playlist">${IC.add}</button>${dlBtn(info(id), title)}</li>`;
  const empty = (text) => `<p class="qp-empty">${text}</p>`;

  function renderList(animateIn) {
    tabEl.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-selected', String(!query && b.dataset.view === view)));
    tabEl.toggleAttribute('data-offline', offline());
    const note = offline() ? `<p class="qp-offline">You are offline. Surahs saved on this device still play; the others are greyed out.</p>` : '';
    if (view === 'downloads' && !query) { listEl.innerHTML = note + downloadsHtml(); markRows(); fillSpace(); if (animateIn) { listEl.scrollTop = 0; mo.rows(listEl.querySelectorAll('.qp-row')); } return; }
    if (!cat) {
      listEl.innerHTML = failed ? `${empty('Could not load the reciters. Check the connection.')}<button class="d-btn d-btn-primary" type="button" data-act="retry">Try again</button>` : empty('Loading reciters and surahs…');
      return;
    }
    let html = '';
    if (query) {
      const r = search(cat, query, store.riwaya);
      html = ((r.reciters.length ? `<h3 class="qp-h">Reciters (${r.reciters.length})</h3><ul class="qp-rows">${r.reciters.map(recRow).join('')}</ul>` : '')
        + (r.surahs.length ? `<h3 class="qp-h">Surahs (${r.surahs.length})</h3><ul class="qp-rows">${r.surahs.map(surahRow).join('')}</ul>` : ''))
        || empty(`Nothing matches “${esc(query)}”${store.riwaya === 'all' ? '' : ' in this riwayah'}. Try part of a reciter’s name, a surah name or a surah number.`);
    } else if (view === 'reciters') {
      const groups = new Map();
      for (const r of recitersFor(cat, store.riwaya)) { if (!groups.has(r.letter)) groups.set(r.letter, []); groups.get(r.letter).push(r); }
      html = [...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([letter, rs]) => `<h3 class="qp-h qp-letter">${esc(letter)}</h3><ul class="qp-rows">${rs.map(recRow).join('')}</ul>`).join('');
    } else if (view === 'surahs') {
      html = `<ul class="qp-rows">${[...cat.surahs.values()].map(surahRow).join('')}</ul>`;
    } else if (view === 'favorites') {
      const rs = cat.reciters.filter(r => store.favR.includes(r.id)), ts = store.favT.map(info).filter(Boolean);
      html = `<h3 class="qp-h">Reciters</h3>${rs.length ? `<ul class="qp-rows">${rs.map(recRow).join('')}</ul>` : empty('Tap the heart beside a reciter to keep them here.')}`
        + `<h3 class="qp-h">Surahs</h3>${ts.length ? `<ul class="qp-rows">${ts.map(i => trackRow(i.id, i.n, i.title, sub(i))).join('')}</ul>` : empty('Tap the heart beside a surah, or in the player, to keep it here.')}`;
    } else {
      html = `<button class="d-btn d-btn-primary qp-new" type="button" data-act="new-list">New playlist</button>`
        + (store.lists.length ? `<ul class="qp-rows">${store.lists.map(l => `<li class="qp-row${detail?.type === 'list' && detail.id === l.id ? ' is-open' : ''}">${main('open-list', `data-id="${esc(l.id)}"`, null, l.name, count(l.tracks.length, 'surah'))}</li>`).join('')}</ul>`
          : empty('A playlist is your own list of surahs, from any reciters, in the order you choose.'));
    }
    listEl.innerHTML = note + html;
    markRows();
    if (animateIn) { listEl.scrollTop = 0; mo.rows(listEl.querySelectorAll('.qp-row')); }
  }

  // ---- Downloads: everything saved on this device, by recitation ----
  function downloadsHtml() {
    const entries = Object.entries(off.list());
    const waiting = off.pending().length;
    const total = entries.reduce((n, [, e]) => n + e.bytes, 0);
    let html = `<p class="qp-count" id="qp-space">${count(entries.length, 'surah')} saved · ${MB(total)}</p>`;
    if (waiting) html += `<div class="qp-chips"><span class="qp-busy">Downloading ${count(waiting, 'surah')}…</span><button class="d-btn d-btn-sm d-btn-outline" type="button" data-act="dl-stop">Cancel</button></div>`;
    if (!entries.length) return html + empty('Surahs you play are saved here on their own, so they play again with no connection. To save more, tap the arrow beside a surah, or “Download all” on a reciter.');
    const groups = new Map();
    for (const [url, e] of entries.sort((a, b) => a[1].sub.localeCompare(b[1].sub) || +a[1].id.split(':')[1] - +b[1].id.split(':')[1])) {
      if (!groups.has(e.sub)) groups.set(e.sub, []);
      groups.get(e.sub).push([url, e]);
    }
    html += [...groups].map(([sub2, rows]) => `<h3 class="qp-h">${esc(sub2 || 'Recitation')}</h3><ul class="qp-rows">${rows.map(([, e]) => {
      const t = e.title.replace(/^\d+\.\s*/, '');
      return `<li class="qp-row" data-track="${e.id}" data-saved>${main('play', '', e.id.split(':')[1], t, `${MB(e.bytes)} · ${e.kind === 'download' ? 'Downloaded' : 'Saved when played'}`)}`
        + `<button class="qp-ic" type="button" data-act="unsave" aria-label="${esc(`Remove ${t} from this device`)}" title="Remove from this device">${IC.close}</button></li>`;
    }).join('')}</ul>`).join('');
    return html + '<div class="qp-chips"><button class="d-btn d-btn-sm d-btn-outline" type="button" data-act="clear-saved">Remove all from this device</button></div>';
  }
  function fillSpace() {
    off.space().then(sp => {
      const el = $('qp-space');
      if (el && sp && sp.quota) el.textContent += ` · ${MB(sp.free)} free for more`;
    });
  }

  function renderDetail(animateIn) {
    const back = `<button class="qp-ic qp-back" type="button" data-act="back" aria-label="Back to the list">${IC.left}</button>`;
    let html = '';
    if (!cat || !detail) html = cat ? empty('Choose a reciter, a surah or a playlist to see what you can play.') : '';
    else if (detail.type === 'reciter') {
      const r = cat.reciters.find(x => x.id === detail.id), ms = r ? moshafOf(cat, r, store.riwaya) : [];
      if (!ms.length) html = `<div class="qp-head">${back}<h3>${r ? esc(r.name) : 'Reciter'}</h3></div>${empty('This reciter has no recitation in the chosen riwayah. Choose “All riwayat” above to see the others.')}`;
      else {
        const m = ms.find(x => x.id === detail.m) || ms[0];
        detail.m = m.id;
        html = `<div class="qp-head">${back}<h3>${esc(r.name)}</h3>${heart('fav-r', store.favR.includes(r.id), `Favorite reciter: ${r.name}`, `data-id="${r.id}"`)}</div>`
          + (ms.length > 1 ? `<div class="qp-chips" role="group" aria-label="Recitation">${ms.map(x => `<button class="d-btn d-btn-sm${x.id === m.id ? ' d-btn-primary' : ' d-btn-outline'}" type="button" data-act="moshaf" data-m="${x.id}" aria-pressed="${x.id === m.id}">${esc(x.style)}</button>`).join('')}</div>` : `<p class="qp-dlg-sub">${esc(m.style)}</p>`)
          + `<p class="qp-count">${count(m.surahs.length, 'surah')}</p>${dlAllBtn(m)}<ul class="qp-rows">${m.surahs.map(s => { const su = cat.surahs.get(s); return trackRow(trackId(m.id, s), s, su ? su.name : `Surah ${s}`, su ? (su.makki ? 'Makki' : 'Madani') : ''); }).join('')}</ul>`;
      }
    } else if (detail.type === 'surah') {
      const s = cat.surahs.get(detail.n);
      const ms = [...cat.moshaf.values()].filter(m => m.surahs.includes(detail.n) && (store.riwaya === 'all' || m.rewaya === store.riwaya)).sort((a, b) => a.reciter.localeCompare(b.reciter));
      html = `<div class="qp-head">${back}<h3>${detail.n}. ${esc(s ? s.name : 'Surah')}</h3></div><p class="qp-count">${count(ms.length, 'recitation')}</p>`
        + (ms.length ? `<ul class="qp-rows">${ms.map(m => trackRow(trackId(m.id, detail.n), null, m.reciter, m.style)).join('')}</ul>` : empty('No recitation of this surah in the chosen riwayah.'));
    } else {
      const l = listById(detail.id);
      if (!l) { detail = null; return renderDetail(); }
      const grip = (title) => `<button class="qp-ic qp-grip" type="button" aria-label="Move ${esc(title)}: drag, or press the up and down arrow keys" title="Drag to reorder">${IC.grip}</button>`;
      html = `<div class="qp-head">${back}<h3>${esc(l.name)}</h3></div><p class="qp-count">${count(l.tracks.length, 'surah')}</p>`
        + `<div class="qp-chips"><button class="d-btn d-btn-sm d-btn-primary" type="button" data-act="play-all"${l.tracks.some(id => info(id)) ? '' : ' disabled'}>Play all</button><button class="d-btn d-btn-sm d-btn-outline" type="button" data-act="rename">Rename</button><button class="d-btn d-btn-sm d-btn-outline" type="button" data-act="delete">Delete</button></div>`
        + (l.tracks.length ? `<ul class="qp-rows qp-sortable">${l.tracks.map((id, k) => {
          const i = info(id);
          return i ? `<li class="qp-row" data-track="${id}">${grip(i.title)}${main('play', '', k + 1, `${i.n}. ${i.title}`, sub(i))}<button class="qp-ic" type="button" data-act="remove" aria-label="Remove ${esc(i.title)} from this playlist" title="Remove">${IC.close}</button></li>`
            : `<li class="qp-row" data-track="${id}"><span class="qp-main"><span class="qp-txt"><b>No longer on mp3quran.net</b></span></span><button class="qp-ic" type="button" data-act="remove" aria-label="Remove from this playlist">${IC.close}</button></li>`;
        }).join('')}</ul>` : empty('Empty so far. Use the add button beside any surah, or in the player, to put it here.'));
    }
    detailEl.innerHTML = html;
    markRows();
    if (animateIn) { detailEl.scrollTop = 0; mo.fade(detailEl.querySelector('.qp-head')); mo.rows(detailEl.querySelectorAll('.qp-row')); }
  }
  // "Download all" for one recitation: how many are saved already, or a cancel while they come in. The progress shows only after
  // Download all was asked for (dlAllOn): a surah saved because it was played, and the next one fetched ahead, is not a download of all
  function dlAllBtn(m) {
    if (!off.ok) return '';
    const urls = m.surahs.map(s => info(trackId(m.id, s))).filter(Boolean).map(i => i.url);
    const kept = urls.filter(off.has).length, coming = urls.filter(u => off.state(u) === 'busy').length;
    if (!coming) dlAllOn.delete(m.id);
    if (coming && dlAllOn.has(m.id)) return `<div class="qp-chips" data-dlall="${m.id}"><span class="qp-busy">Downloading: ${kept} of ${urls.length} saved</span><button class="d-btn d-btn-sm d-btn-outline" type="button" data-act="dl-stop">Cancel</button></div>`;
    if (kept === urls.length) return `<div class="qp-chips" data-dlall="${m.id}"><span class="qp-busy">All ${urls.length} saved on this device</span></div>`;
    return `<div class="qp-chips" data-dlall="${m.id}"><button class="d-btn d-btn-sm d-btn-outline" type="button" data-act="dl-all" data-m="${m.id}">${IC.dl.replace('<svg', '<svg class="qp-btn-ic"')}Download all${kept ? ` (${kept} of ${urls.length} saved)` : ''}</button></div>`;
  }

  // On a narrow screen only one of the two panes shows at a time
  const setPane = (p) => { tabEl.dataset.pane = p; };
  function openDetail(d, fromHistory = false) {
    if (!fromHistory) pushStep({ qp: 'detail', d });
    detail = d;
    setPane('detail');
    renderList();
    renderDetail(true);
    if (getComputedStyle(listEl).display === 'none') detailEl.querySelector('.qp-back')?.focus();
  }
  const queueFrom = (li) => { const ids = [...li.parentElement.querySelectorAll(':scope > li[data-track]')].map(x => x.dataset.track).filter(playable); return [ids, ids.indexOf(li.dataset.track)]; };

  tabEl.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { view = v.dataset.view; query = $('qp-search').value = ''; setPane('list'); return renderList(true); }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act, li = b.closest('li[data-track]');
    if (a === 'retry') { failed = false; open(); }
    else if (li && a === 'dl') {
      const i = info(li.dataset.track);
      if (!i) return;
      const st = off.state(i.url);
      if (st === 'busy') { off.cancel(i.url); say('Download cancelled.'); }
      else if (st === 'kept') openSaved(i);
      else if (offline()) say('Connect to the internet to download this surah.');
      else { off.keep(i.url, { id: i.id, title: label(i), sub: sub(i) }, 'download'); say(`Downloading ${i.title}.`); }
    } else if (a === 'dl-all') openDlAll(cat.moshaf.get(+b.dataset.m));
    else if (a === 'dl-stop') { off.cancelAll(); say('Downloads cancelled. What came in is kept.'); }
    else if (li && a === 'unsave') { const i = info(li.dataset.track); if (i) { off.remove(i.url); say(`${i.title} removed from this device.`); } }
    else if (a === 'clear-saved') openClear();
    else if (a === 'open-reciter') openDetail({ type: 'reciter', id: +b.dataset.id });
    else if (a === 'open-surah') openDetail({ type: 'surah', n: +b.dataset.n });
    else if (a === 'open-list') openDetail({ type: 'list', id: b.dataset.id });
    else if (a === 'back') { // the same as the phone's back gesture, when the reciter added a step; else straight to the list
      if (hState().qp === 'detail') history.back();
      else { setPane('list'); (listEl.querySelector('.is-open .qp-main') || $('qp-search')).focus(); }
    }
    else if (a === 'moshaf') { detail.m = +b.dataset.m; renderDetail(true); }
    else if (a === 'fav-r') { favReciter(+b.dataset.id); mo.pop(b.firstElementChild); }
    else if (a === 'new-list') openName(null);
    else if (a === 'rename') openName(detail.id);
    else if (a === 'delete') openDelete(detail.id);
    else if (a === 'play-all') { const ids = listById(detail.id).tracks.filter(id => info(id)); if (ids.length) playQueue(ids, 0); }
    else if (li && a === 'play') {
      if (cur && cur.id === li.dataset.track && audio.getAttribute('src')) return togglePlay();
      if (!playable(li.dataset.track)) return say('This surah is not saved on this device. Connect to the internet to play it.');
      const [ids, i] = queueFrom(li);
      if (i >= 0) playQueue(ids, i);
    } else if (li && a === 'fav-t') { favTrack(li.dataset.track); mo.pop(b.firstElementChild); }
    else if (li && a === 'add') { const i = info(li.dataset.track); if (i) openAdd(i.id, `${label(i)} · ${i.reciter}`); }
    else if (li && a === 'remove') {
      const glide = mo.flip(li.parentElement.children);
      store.lists = removeFromList(store.lists, detail.id, li.dataset.track); save();
      li.remove(); glide();
      refreshLists();
      setTimeout(() => { if (detail?.type === 'list') renderDetail(); }, mo.T.spring.snappy.duration * 1000);
    }
  });

  // Reordering a playlist: drag the handle, or focus it and press the arrow keys
  detailEl.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.qp-grip');
    if (!h || detail?.type !== 'list') return;
    const li = h.closest('li'), ul = li.parentElement, listId = detail.id;
    let lastSwap = 0;
    e.preventDefault();
    h.focus();
    li.classList.add('is-drag');
    // The row being dragged stays where it is in the DOM and its neighbours hop over it, so the browser never loses track of the pointer
    const move = (ev) => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('li[data-track]');
      if (!over || over === li || over.parentElement !== ul || ev.timeStamp - lastSwap < 140) return; // the pause lets the rows finish gliding
      lastSwap = ev.timeStamp;
      const glide = mo.flip(ul.children);
      ul.insertBefore(over, li.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING ? li : li.nextSibling);
      glide();
    };
    const drop = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', drop);
      removeEventListener('pointercancel', drop);
      li.classList.remove('is-drag');
      store.lists = setListOrder(store.lists, listId, [...ul.children].map(x => x.dataset.track)); save();
      if (detail?.type === 'list' && detail.id === listId) { renderDetail(); detailEl.querySelector(`li[data-track="${li.dataset.track}"] .qp-grip`)?.focus(); }
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', drop);
    addEventListener('pointercancel', drop);
  });
  detailEl.addEventListener('keydown', (e) => {
    const h = e.target.closest('.qp-grip');
    if (!h || detail?.type !== 'list' || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const li = h.closest('li'), from = [...li.parentElement.children].indexOf(li), to = from + (e.key === 'ArrowUp' ? -1 : 1), id = li.dataset.track;
    if (to < 0 || to >= li.parentElement.children.length) return;
    const tops = new Map([...li.parentElement.children].map(x => [x.dataset.track, x.getBoundingClientRect().top]));
    store.lists = moveInList(store.lists, detail.id, from, to); save();
    renderDetail();
    for (const x of detailEl.querySelectorAll('li[data-track]')) {
      const dy = tops.get(x.dataset.track) - x.getBoundingClientRect().top;
      if (dy) mo.animate(x, { translate: [`0 ${dy}px`, '0 0'] }, mo.spring('snappy'));
    }
    detailEl.querySelector(`li[data-track="${id}"] .qp-grip`)?.focus();
    say(`Moved to place ${to + 1}.`);
  });

  // Downloads report back: update the buttons in place; redraw lists only when something starts, ends or goes
  let redraw = 0;
  off.on((url, id, what) => {
    if (what === 'full') return say('This device is out of room. Remove some saved surahs to download more.');
    if (what === 'failed') say('A download did not finish. Check the connection and try again.');
    if (id) {
      const i = info(id), st = (i && off.state(i.url)) || 'none';
      document.querySelectorAll(`li[data-track="${id}"]`).forEach(li => {
        li.toggleAttribute('data-saved', st === 'kept');
        const btn = li.querySelector('[data-act="dl"]');
        if (!btn) return;
        btn.style.setProperty('--p', i ? off.progress(i.url) : 0);
        if (btn.dataset.state !== st) {
          btn.dataset.state = st;
          btn.innerHTML = st === 'kept' ? IC.done : st === 'busy' ? IC.stop : IC.dl;
          btn.title = DL_TEXT[st];
          btn.setAttribute('aria-label', `${DL_TEXT[st]}: ${i ? i.title : ''}`);
          if (st === 'kept') mo.pop(btn.firstElementChild); else mo.swap(btn.firstElementChild);
        }
      });
    }
    if (what === 'progress') return;
    clearTimeout(redraw);
    redraw = setTimeout(() => {
      if (view === 'downloads' && !query) renderList();
      if (detail?.type === 'reciter') { const box = detailEl.querySelector('[data-dlall]'); const m = box && cat && cat.moshaf.get(+box.dataset.dlall); if (m) box.outerHTML = dlAllBtn(m); }
    }, 300);
  });
  for (const ev of ['online', 'offline']) addEventListener(ev, () => { if (!tabEl.hidden) { renderList(); renderDetail(); } });

  $('qp-search').addEventListener('input', (e) => { query = e.target.value.trim(); setPane('list'); renderList(); });
  $('qp-riwaya').addEventListener('change', (e) => {
    store.riwaya = e.target.value === 'all' ? 'all' : +e.target.value; save();
    renderList(true); renderDetail();
  });

  // Opening the tab loads the lists the first time
  function open() {
    renderList();
    if (cat) return;
    ensureCat().then(() => {
      if (!detail && cur) { const m = cat.moshaf.get(+cur.id.split(':')[0]); if (m) detail = { type: 'reciter', id: m.reciterId, m: m.id }; }
      if (cur) showPlayer();
      paint(); paintTime();
      renderList(true); renderDetail(true);
    }).catch(() => { if (offline() && Object.keys(off.list()).length) view = 'downloads'; renderList(); }); // offline with no lists: show what is saved
  }
  addEventListener('hashchange', () => { if (location.hash === '#quran') open(); });
  if (location.hash === '#quran') open();
  if (cur) player.hidden = false;
  paint(); paintTime();

  return {
    isPlaying: active, // waiting for a dropped connection counts, so the app does not reload itself in the middle

    // Another sound (an adhan, an alert, an adhkar recording) is about to play: step aside, and remember to come back
    // (a recitation waiting for a dropped connection counts as playing: it steps aside too, and comes back from its place)
    interrupt() {
      if (!active()) return;
      interrupted = true;
      if (rec) { const t = rec.t; stopRecover(); startAt = t; }
      wanted = false;
      audio.pause();
    },
    resume() { if (interrupted) { interrupted = false; if (audio.getAttribute('src')) start(); } },
    // A modal dialog would sit on top of the alert's Stop button, so it closes when an alert starts
    closeDialogs: closeDlg,
  };
}
