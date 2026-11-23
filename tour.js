// The first-run tour: a few short steps, each pointing at one thing on the real Today screen.
// app.js starts it once, after a new visitor answers "where are you?", and again from "Take the tour again".
// The board is redrawn every second and moves a few pixels for burn-in care, so each step finds its element again and
// re-measures it every half second. Steps whose element is not on screen (no Help button on a phone, no bells in other
// clock styles) are left out. Touch, mouse, keyboard and a TV remote all work: arrows move, Enter presses, Escape ends.
import { fade } from './motion.js';

const STEPS = [
  { at: ['#clock .sh-next', '#clock .ck-head', '#clock'], title: 'The next prayer',
    text: 'The countdown runs to the next adhan, then to its iqama. In the last 15 minutes it is marked so you can see it from across the room.' },
  { at: ['#clock .sh-tt', '#today'], title: 'Today’s times',
    text: 'Adhan on the top row, iqama underneath. The next prayer is the dark column, and times that have passed are greyed.' },
  // on a phone held upright the timetable is folded away: point at the button that opens it instead
  { at: ['#clock [data-fold]'], only: () => !document.querySelector('#clock .sh-tt') || !shown(document.querySelector('#clock .sh-tt')), title: 'Today’s times',
    text: 'Tap All prayer times to see the adhan and iqama times for every prayer. Your phone remembers whether you leave them open.' },
  { at: ['#clock [data-bell]'], title: 'Alerts',
    text: 'Tap a bell to choose what happens at that prayer: a message, a soft beep or the adhan.' },
  { at: ['#clock [data-swap]'], title: 'Bigger clock or countdown',
    text: 'Swap which number is large. Phones and small tablets start with the countdown.' },
  { at: ['#dim-btn'], title: 'Brightness',
    text: 'Tap to step through Bright, Soft, Dim and Darkest. At night the screen dims by itself; choose how dark under Settings, Display.' },
  { at: ['#fullscreen'], title: 'Full screen and Keep screen on',
    text: 'Full screen shows only the times. Keep screen on stops this device going to sleep, for a screen on the wall.' },
  { at: ['#help', '.dockbar a[href="#settings"]', '.tabbar a[href="#settings"]'], title: 'Help and Settings',
    text: 'The guide explains every screen. Settings holds your location, iqama times, alerts and display.' },
];

const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
const find = (step) => step.at.map(s => document.querySelector(s)).find(shown) || null;

let ui = null;

export function tourOpen() { return !!ui; }

export function startTour({ onEnd } = {}) {
  if (ui) return;
  const steps = STEPS.filter(s => find(s) && (!s.only || s.only()));
  if (!steps.length) { onEnd?.(); return; }
  const back = document.createElement('div');
  back.className = 'tour';
  back.innerHTML = '<div class="tour-veil"></div><div class="tour-spot" aria-hidden="true"></div>'
    + '<div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">'
    + '<p class="tour-count" id="tour-count"></p><h2 id="tour-title"></h2><p id="tour-text"></p>'
    + '<div class="tour-actions"><button class="link-btn tour-skip" type="button" data-t="skip">Skip tour</button>'
    + '<span class="tour-nav"><button class="d-btn d-btn-sm" type="button" data-t="back">Back</button>'
    + '<button class="d-btn d-btn-sm d-btn-primary" type="button" data-t="next">Next</button></span></div></div>';
  document.body.append(back);
  const card = back.querySelector('.tour-card'), spot = back.querySelector('.tour-spot');
  const before = document.activeElement;
  let i = 0;

  function place() {
    const el = find(steps[i]);
    if (!el) return;
    const r = el.getBoundingClientRect(), pad = 6, vw = innerWidth, vh = innerHeight;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // the card goes below the element when it fits, else above, else at the bottom of the screen; never off the edges
    const c = card.getBoundingClientRect(), gap = 12;
    let top = r.bottom + pad + gap;
    if (top + c.height > vh - 8) top = r.top - pad - gap - c.height;
    if (top < 8) top = vh - c.height - 8;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - c.width / 2), vw - c.width - 8);
    Object.assign(card.style, { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` });
  }
  function show(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    const s = steps[i];
    back.querySelector('#tour-count').textContent = `${i + 1} of ${steps.length}`;
    back.querySelector('#tour-title').textContent = s.title;
    back.querySelector('#tour-text').textContent = s.text;
    back.querySelector('[data-t="back"]').hidden = i === 0;
    back.querySelector('[data-t="next"]').textContent = i === steps.length - 1 ? 'Done' : 'Next';
    find(s)?.scrollIntoView({ block: 'nearest' });
    place();
    fade(card); // a short fade (none in the E-ink look; only the fade when the device reduces motion)
    back.querySelector('[data-t="next"]').focus({ preventScroll: true });
  }
  function end() {
    clearInterval(timer);
    removeEventListener('resize', place);
    removeEventListener('keydown', onKey, true);
    back.remove();
    ui = null;
    if (before && document.contains(before)) before.focus?.({ preventScroll: true });
    onEnd?.();
  }
  function onKey(e) {
    const k = e.key;
    if (k === 'Escape') end();
    else if (k === 'ArrowRight') { if (i === steps.length - 1) end(); else show(i + 1); }
    else if (k === 'ArrowLeft') show(i - 1);
    else if (k === 'Tab') { // focus stays in the card
      const items = [...card.querySelectorAll('button:not([hidden])')];
      const at = items.indexOf(document.activeElement);
      items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    } else return;
    e.preventDefault(); e.stopPropagation();
  }
  card.addEventListener('click', (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t;
    if (t === 'skip') end();
    else if (t === 'back') show(i - 1);
    else if (t === 'next') { if (i === steps.length - 1) end(); else show(i + 1); }
  });
  addEventListener('resize', place);
  addEventListener('keydown', onKey, true);
  const timer = setInterval(place, 500);
  ui = { end };
  show(0);
}
