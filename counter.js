// The dhikr counter (approved from the "Adhkar counter" and "Adhkar categories" mockups, November 2026). A dua the
// book says to repeat gets a small ring beside it, on the Adhkar screen and on Today's dua card: each tap counts one
// and the ring fills green (--on); at the count it closes with a tick and an "Again" link. Every dua has "Full view":
// the dua on its own with a big ring, stepping through its chapter with Previous dua and Next dua. A dua said once
// has a ring that one tap ticks as read. Both places share one count per dua (the key is "chapter:entry" of
// Hisn al-Muslim), kept on this device until the next Fajr adhan (countDay, logic.js).
import { pop, fade } from './motion.js';

const $ = (id) => document.getElementById(id);
const STORE = 'iqama-counts';

let store = { day: '', c: {} };
try {
  const j = JSON.parse(localStorage.getItem(STORE) || '{}');
  if (j && typeof j.c === 'object' && j.c) store = { day: String(j.day || ''), c: j.c };
} catch (e) {}
try { localStorage.removeItem('iqama-adhkar'); } catch (e) {} // the old Today-only counter
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch (e) {} };

let dayOf = () => '';
let changed = () => {}; // told of each change (a key), or null when a new day cleared them all
const groups = new Map(); // name -> { title, items: [{ key, n, ar, tr, en }] }, for the full view
function counts() {
  const d = dayOf();
  if (d && store.day !== d) { // a new day since Fajr: every count starts again
    const had = Object.keys(store.c).length;
    store = { day: d, c: {} };
    save();
    if (had) queueMicrotask(() => { paintAll(); changed(null); });
  }
  return store.c;
}
export const countOf = (key) => counts()[key] || 0;
export const times = (n) => (n > 1 ? n : 1); // the book's count; a dua said once has none (0 or 1)
export const isDone = (key, n) => countOf(key) >= times(n);

const left = (c, n) => (c >= n ? 'Done' : c === 0 ? 'Tap to count' : `${n - c} to go`);
const SVG = '<svg class="ct-svg" viewBox="0 0 60 60" aria-hidden="true"><circle class="ct-track" cx="30" cy="30" r="26"/>'
  + '<circle class="ct-fill" cx="30" cy="30" r="26" pathLength="100"/></svg>';
const TICK = '<svg class="ct-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const RING = `${SVG}<span class="ct-num"></span>${TICK}`;
const BIG = `${SVG}<span class="ct-nums"><span class="ct-num"></span><span class="ct-of"></span></span>`
  + `<span class="ct-once"><svg class="ct-tick-faint" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span>Tap when read</span></span>`
  + `<span class="ct-done">${TICK}<span class="ct-done-text"></span></span>`;
const READ = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Read';

// The controls for one dua: Full view, then for a dua said more than once Again (once done), what is left and the
// ring; for a dua said once, a "Read" mark once it is ticked in the full view.
// group and index say where the dua sits (its chapter, or Today's set), so the full view can step through them.
export function counterHtml(key, n, group, index) {
  const open = `<button class="link-btn ct-open" type="button" data-ct-open="${key}" data-group="${group}" data-index="${index}">Full view</button><span class="ct-gap"></span>`;
  if (n <= 1) return `${open}<span class="ct-read" data-ct-read="${key}" hidden>${READ}</span>`;
  return `${open}<button class="link-btn ct-again" type="button" data-ct-again="${key}" hidden>Again</button>`
    + `<span class="ct-left" data-ct-left="${key}"></span><button class="ct" type="button" data-ct="${key}" data-n="${n}">${RING}</button>`;
}
// Every dua of one place (a chapter, or Today's set), in order
export function setGroup(name, title, items) { groups.set(name, { title, items: items.map(it => ({ ...it, n: times(it.n) })) }); }
export const groupDone = (name) => (groups.get(name)?.items || []).filter(it => isDone(it.key, it.n)).length;

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
    const dt = b.querySelector('.ct-done-text'); if (dt) dt.textContent = n === 1 ? 'Read' : `${n} of ${n}`;
    b.classList.toggle('is-done', done);
    b.classList.toggle('is-zero', k === 0);
    b.classList.toggle('is-once', n === 1);
    b.setAttribute('aria-label', n === 1 ? (done ? 'Read' : 'Mark as read') : done ? `Done, ${n} of ${n}` : `Count, ${k} of ${n}`);
  });
  document.querySelectorAll(`[data-ct-left="${sel}"]`).forEach(s => { s.textContent = n ? left(c, n) : ''; });
  document.querySelectorAll(`[data-ct-again="${sel}"]`).forEach(a => { a.hidden = !(n && c >= n); });
  document.querySelectorAll(`[data-ct-read="${sel}"]`).forEach(r => { r.hidden = c < 1; });
  if (full.key === key) paintFull();
}
export function paintAll() {
  const keys = new Set([...document.querySelectorAll('[data-ct], [data-ct-read]')].map(e => e.dataset.ct || e.dataset.ctRead));
  keys.forEach(paint);
}

function count(key, n) {
  const c = countOf(key);
  if (c >= n) return;
  counts()[key] = c + 1;
  save();
  try { navigator.vibrate?.(c + 1 === n ? [30, 60, 30] : 12); } catch (e) {} // Android; iPhones do not let web apps vibrate
  paint(key);
  if (c + 1 === n) document.querySelectorAll(`.ct[data-ct="${CSS.escape(key)}"] .ct-tick`).forEach(t => pop(t));
  changed(key);
}
function again(key) { delete counts()[key]; save(); paint(key); changed(key); }

// ---- The full view ----
const full = { key: '', group: '', index: 0 };
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function paintFull() {
  const g = groups.get(full.group), it = g?.items[full.index];
  if (!it) return;
  const c = Math.min(countOf(it.key), it.n), done = c >= it.n, once = it.n === 1;
  const how = coarse() ? 'Tap the circle' : 'Press OK, or click the circle,';
  $('ctf-hint').textContent = once ? (done ? 'Marked as read.' : `${how} once you have read it.`)
    : done ? 'Done.' : `${how} to count. ${it.n - c} to go.`;
  $('ctf-again').hidden = c === 0;
  $('ctf-again').textContent = once ? 'Undo' : 'Start again';
  const d = groupDone(full.group), total = g.items.length;
  $('ctf-bar').style.setProperty('--p', String(Math.round((d / total) * 1000) / 10));
  $('ctf-done').textContent = `${d} of ${total} ${total === 1 ? 'dua' : 'duas'} done`;
}
function showFull(group, index) {
  const g = groups.get(group), it = g?.items[index];
  if (!it) return;
  Object.assign(full, { key: it.key, group, index });
  $('ctf-meta').textContent = `${g.title} · Dua ${index + 1} of ${g.items.length} · ${it.n === 1 ? 'Said once' : `Read ${it.n} times`}`;
  $('ctf-ar').textContent = it.ar || ''; $('ctf-ar').hidden = !it.ar;
  $('ctf-tr').textContent = it.tr || ''; $('ctf-tr').hidden = !it.tr;
  $('ctf-en').textContent = it.en || ''; $('ctf-en').hidden = !it.en;
  const ring = $('ctf-ring');
  ring.dataset.ct = it.key; ring.dataset.n = String(it.n);
  // at either end the button stays where it is, so a TV remote's focus is not lost, but it does nothing
  $('ctf-prev').setAttribute('aria-disabled', String(index === 0));
  $('ctf-next').setAttribute('aria-disabled', String(index >= g.items.length - 1));
  paint(it.key);
}
function step(by) {
  const g = groups.get(full.group), i = full.index + by;
  if (!g || i < 0 || i >= g.items.length) return;
  showFull(full.group, i);
  $('ctf').querySelector('.ctf-text').scrollTop = 0;
}
function openFull(group, index) {
  const dlg = $('ctf');
  showFull(group, index);
  if (!dlg.open) { dlg.showModal(); fade(dlg.firstElementChild); }
  $('ctf-ring').focus();
}

export function initCounter({ dayKey, onChange }) {
  dayOf = dayKey;
  if (onChange) changed = onChange;
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
  $('ctf-prev').addEventListener('click', () => step(-1));
  $('ctf-next').addEventListener('click', () => step(1));
  $('ctf').addEventListener('close', () => { // back to where the person was: the dua they ended on, if it is on screen
    const k = full.key; full.key = '';
    if (!k) return;
    const sel = CSS.escape(k);
    (document.querySelector(`.ct[data-ct="${sel}"]:not(#ctf-ring)`) || document.querySelector(`[data-ct-open="${sel}"]`))?.focus();
  });
}
