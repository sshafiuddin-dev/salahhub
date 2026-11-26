// The dhikr counter (approved from the "Adhkar counter" mockup, November 2026). A dua the book says to repeat gets a
// small ring beside it, on the Adhkar screen and on Today's dua card: each tap counts one and the ring fills green
// (--on); at the count it closes with a tick and an "Again" link. Counts of 10 and more also get "Full view": a big
// ring with the dua above it, counted by a tap or by OK on a TV remote. Both places share one count per dua
// (the key is "chapter:entry" of Hisn al-Muslim), kept on this device until the next Fajr adhan (countDay, logic.js).
import { pop, fade } from './motion.js';

const $ = (id) => document.getElementById(id);
const STORE = 'iqama-counts';
export const FULL_FROM = 10;

let store = { day: '', c: {} };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || '{}');
  if (j && typeof j.c === 'object' && j.c) store = { day: String(j.day || ''), c: j.c };
} catch (e) {}
try { localStorage.removeItem('iqama-adhkar'); } catch (e) {} // the old Today-only counter, kept until midnight
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) {} };

let dayOf = () => '';
const groups = new Map(); // name -> [{ key, n, ar, tr, en, meta }], for the full view's Next dua
function counts() {
  const d = dayOf();
  if (d && store.day !== d) { // a new day since Fajr: every count starts again
    const had = Object.keys(store.c).length;
    store = { day: d, c: {} };
    save();
    if (had) queueMicrotask(paintAll);
  }
  return store.c;
}
export const countOf = (key) => counts()[key] || 0;

const left = (c, n) => (c >= n ? 'Done' : c === 0 ? 'Tap to count' : `${n - c} to go`);
const SVG = '<svg class="ct-svg" viewBox="0 0 60 60" aria-hidden="true"><circle class="ct-track" cx="30" cy="30" r="26"/>'
  + '<circle class="ct-fill" cx="30" cy="30" r="26" pathLength="100"/></svg>';
const TICK = '<svg class="ct-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const RING = `${SVG}<span class="ct-num"></span>${TICK}`;
const BIG = `${SVG}<span class="ct-nums"><span class="ct-num"></span><span class="ct-of"></span></span>${TICK}`;

// The controls for one dua: Full view (from 10), Again (once done), what is left, and the ring.
// group and index say where the dua sits, so the full view's Next dua can go on to the next one that repeats.
export function counterHtml(key, n, group, index) {
  return (n >= FULL_FROM ? `<button class="link-btn ct-open" type="button" data-ct-open="${key}" data-group="${group}" data-index="${index}">Full view</button>` : '')
    + `<span class="ct-gap"></span><button class="link-btn ct-again" type="button" data-ct-again="${key}" hidden>Again</button>`
    + `<span class="ct-left" data-ct-left="${key}"></span><button class="ct" type="button" data-ct="${key}" data-n="${n}">${RING}</button>`;
}
// The duas that repeat, in order, for one place (a chapter, or Today's set)
export function setGroup(name, items) { groups.set(name, items.filter(it => it.n > 1)); }
export const groupIndex = (name, key) => (groups.get(name) || []).findIndex(it => it.key === key);

// Shows the count of one dua everywhere it is on screen (the list, Today's card, the full view)
export function paint(key) {
  if (!key) return;
  const sel = CSS.escape(key), c = countOf(key);
  let n = 0;
  document.querySelectorAll(`.ct[data-ct="${sel}"]`).forEach(b => {
    n = Number(b.dataset.n) || 1;
    const k = Math.min(c, n), done = k >= n;
    b.style.setProperty('--p', String(Math.round((k / n) * 1000) / 10));
    b.querySelector('.ct-num').textContent = String(k);
    const of = b.querySelector('.ct-of'); if (of) of.textContent = `of ${n}`;
    b.classList.toggle('is-done', done);
    b.setAttribute('aria-label', done ? `Done, ${n} of ${n}` : `Count, ${k} of ${n}`);
  });
  document.querySelectorAll(`[data-ct-left="${sel}"]`).forEach(s => { s.textContent = n ? left(c, n) : ''; });
  document.querySelectorAll(`[data-ct-again="${sel}"]`).forEach(a => { a.hidden = !(n && c >= n); });
  if (full.key === key) paintFull();
}
export function paintAll() { new Set([...document.querySelectorAll('.ct[data-ct]')].map(b => b.dataset.ct)).forEach(paint); }

function count(key, n) {
  const c = countOf(key);
  if (c >= n) return;
  counts()[key] = c + 1;
  save();
  try { navigator.vibrate?.(c + 1 === n ? [30, 60, 30] : 12); } catch (e) {} // Android; iPhones do not let web apps vibrate
  paint(key);
  if (c + 1 === n) document.querySelectorAll(`.ct[data-ct="${CSS.escape(key)}"] .ct-tick`).forEach(t => pop(t));
}
function again(key) { delete counts()[key]; save(); paint(key); }

// ---- The full view ----
const full = { key: '', group: '', index: 0 };
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function paintFull() {
  const it = groups.get(full.group)?.[full.index];
  if (!it) return;
  const c = Math.min(countOf(it.key), it.n);
  $('ctf-hint').textContent = c >= it.n ? 'Done. Go on with Next dua, or Start again.'
    : `${coarse() ? 'Tap the circle' : 'Press OK, or click the circle,'} to count. ${it.n - c} to go.`;
}
function showFull(group, index) {
  const list = groups.get(group), it = list?.[index];
  if (!it) return;
  Object.assign(full, { key: it.key, group, index });
  $('ctf-meta').textContent = it.meta;
  $('ctf-ar').textContent = it.ar; $('ctf-ar').hidden = !it.ar;
  $('ctf-tr').textContent = it.tr; $('ctf-tr').hidden = !it.tr;
  $('ctf-en').textContent = it.en; $('ctf-en').hidden = !it.en;
  const ring = $('ctf-ring');
  ring.dataset.ct = it.key; ring.dataset.n = String(it.n);
  $('ctf-next').hidden = index >= list.length - 1;
  paint(it.key);
}
function openFull(group, index) {
  const dlg = $('ctf');
  showFull(group, index);
  if (!dlg.open) { dlg.showModal(); fade(dlg.firstElementChild); }
  $('ctf-ring').focus();
}

export function initCounter({ dayKey }) {
  dayOf = dayKey;
  $('ctf-ring').innerHTML = BIG;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.ct[data-ct]');
    if (b) return count(b.dataset.ct, Number(b.dataset.n) || 1);
    const a = e.target.closest('[data-ct-again]');
    if (a) { const k = a.dataset.ctAgain; again(k); document.querySelector(`.ct[data-ct="${CSS.escape(k)}"]`)?.focus(); return; }
    const o = e.target.closest('[data-ct-open]');
    if (o) openFull(o.dataset.group, Number(o.dataset.index) || 0);
  });
  $('ctf-close').addEventListener('click', () => $('ctf').close());
  $('ctf-again').addEventListener('click', () => { again(full.key); $('ctf-ring').focus(); });
  $('ctf-next').addEventListener('click', () => { showFull(full.group, full.index + 1); $('ctf-ring').focus(); });
  $('ctf').addEventListener('close', () => { // back to the dua's own ring, where the person was
    const k = full.key; full.key = '';
    if (k) document.querySelector(`.ct[data-ct="${CSS.escape(k)}"]:not(#ctf-ring)`)?.focus();
  });
}
