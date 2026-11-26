import { animate, spring, done, fade, sheetIn, T } from './motion.js';

// Small pieces shared by app.js and quran.js for the form controls drawn in look.css (switches, ticks, radios, sliders).

// Sliders show their value in a small label above the thumb while it is dragged, or while it is moved with the keys; the
// label follows the thumb, and the track fills up to it (--p, 0 to 1). The text is the slider's aria-valuetext (as Dim or
// Large), or what text(value) returns. Wraps the slider in <span class="rng"> for the label to sit in.
export function bubble(input, cls = '', text = null) {
  const box = document.createElement('span'), tip = document.createElement('span');
  box.className = `rng ${cls}`.trim(); tip.className = 'rng-bub'; tip.setAttribute('aria-hidden', 'true');
  input.before(box); box.append(input, tip);
  const place = () => {
    const min = +input.min || 0, max = input.max === '' ? 100 : +input.max;
    box.style.setProperty('--p', String(max > min ? (input.value - min) / (max - min) : 0));
    tip.textContent = text ? text(input.value) : input.getAttribute('aria-valuetext') || input.value;
  };
  const show = (on) => { if (on) place(); box.classList.toggle('act', on); };
  input.addEventListener('input', place);
  input.addEventListener('change', place);
  input.addEventListener('pointerdown', () => show(true));
  for (const t of ['pointerup', 'pointercancel', 'blur']) input.addEventListener(t, () => show(false));
  input.addEventListener('keydown', (e) => { if (/^(Arrow|Page|Home$|End$)/.test(e.key)) show(true); });
  place();
  return place; // call after changing the value from a script, so the fill and label follow
}

// − and + round a number box (adhan offsets, alert minutes, iqama minutes after adhan). The number can still be typed.
// A tap moves it one step; holding repeats, after a short pause; Enter or Space on a button steps once. The number slides
// the way it moved, and gives a small shake at its limit (the box's min and max). Each step fires the box's own input and
// change events, so the code that saves it needs nothing new. The buttons follow the box: hidden with it, disabled with it.
export function stepper(input) {
  if (input.closest('.stp')) return;
  const box = document.createElement('span'), name = input.getAttribute('aria-label') || 'Value';
  box.className = 'stp';
  const mk = (d, sign) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'stp-btn'; b.textContent = sign; b.dataset.step = String(d);
    b.setAttribute('aria-label', `${name}: ${d < 0 ? 'one less' : 'one more'}`);
    return b;
  };
  const less = mk(-1, '−'), more = mk(1, '+');
  input.before(box); box.append(less, input, more);
  const step = (d) => {
    const min = input.min === '' ? -Infinity : +input.min, max = input.max === '' ? Infinity : +input.max;
    const now = Math.round(+input.value) || 0, next = Math.max(min, Math.min(max, now + d));
    if (next === now) { animate(input, { translate: ['0 0', '-3px 0', '3px 0', '0 0'] }, { duration: .3 }); return false; }
    input.value = String(next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    animate(input, { translate: [`0 ${d > 0 ? -6 : 6}px`, '0 0'], opacity: [.35, 1] }, { duration: .18 });
    return true;
  };
  let hold = 0;
  const stop = () => { clearTimeout(hold); hold = 0; };
  for (const b of [less, more]) {
    b.addEventListener('pointerdown', (e) => {
      if (e.button || b.disabled) return;
      e.preventDefault(); // the tap must not also count as a click, nor select text while held
      stop();
      if (!step(+b.dataset.step)) return;
      const again = (wait) => { hold = setTimeout(() => { if (step(+b.dataset.step)) again(90); }, wait); };
      again(450);
    });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, stop);
    b.addEventListener('click', (e) => { if (e.detail === 0) step(+b.dataset.step); }); // Enter or Space
  }
  const follow = () => { box.hidden = input.hidden; less.disabled = more.disabled = input.disabled; };
  new MutationObserver(follow).observe(input, { attributes: true, attributeFilter: ['hidden', 'disabled'] });
  follow();
}

// Search behind a round magnifier (the Quran and Adhkar tabs). A tap opens it into a field across its column and the
// magnifier turns into ×; × or Escape clears the search (firing the box's own input event, so its list refills) and
// folds it away. It opens by itself when the box already holds a search. Returns { fold(on), box, button }.
const SX_ICONS = '<svg class="sx-m" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/></svg>'
  + '<svg class="sx-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
export function searchBox(input) {
  const box = document.createElement('div'), button = document.createElement('button'), label = input.getAttribute('aria-label') || 'Search';
  box.className = 'sx';
  button.type = 'button'; button.className = 'sx-btn'; button.innerHTML = SX_ICONS;
  if (input.id) { button.id = `${input.id}-btn`; button.setAttribute('aria-controls', input.id); }
  input.before(box); box.append(input, button);
  const fold = (on) => {
    box.classList.toggle('open', on);
    button.setAttribute('aria-expanded', String(on));
    button.setAttribute('aria-label', on ? 'Close search' : label);
    input.tabIndex = on ? 0 : -1;
  };
  const close = () => {
    fold(false);
    if (input.value) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.palette === 'eink';
  button.addEventListener('click', () => {
    if (box.classList.contains('open')) return close();
    fold(true);
    setTimeout(() => input.focus(), still() ? 0 : 220);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); button.focus(); } });
  fold(!!input.value);
  return { fold, box, button };
}

// Back and breadcrumb (DESIGN.md › Components): a round Back button, then the way here, as "Home / November".
// `up` lists the screens above this one, the nearest last, each { label, href } (an address in the app) or { label, act }
// (a data-act the page's own click handler knows); `here` names this screen. Back goes to the nearest screen above.
const CRUMB_ESC = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CRUMB_LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
export function crumbs(up, here) {
  const link = (s, cls, inner, label) => s.href
    ? `<a class="${cls}" href="${CRUMB_ESC(s.href)}"${label ? ` aria-label="${CRUMB_ESC(label)}"` : ''}>${inner}</a>`
    : `<button class="${cls}" type="button" data-act="${CRUMB_ESC(s.act)}"${label ? ` aria-label="${CRUMB_ESC(label)}"` : ''}>${inner}</button>`;
  const near = up[up.length - 1];
  return link(near, 'crumb-back', CRUMB_LEFT, `Back to ${near.label}`)
    + `<ol>${up.map(s => `<li>${link(s, 'crumb-up', CRUMB_ESC(s.label))}</li>`).join('')}<li aria-current="page">${CRUMB_ESC(here)}</li></ol>`;
}

// Sheet (DESIGN.md › Components): a window (a <dialog>) that slides up from the bottom of a phone, with a grab handle on
// top; on tablets and TVs it stays a rounded card in the middle. It closes with a slide back down (a fade with Reduce
// motion, at once in E-ink) whether that is from its own buttons, a tap on the dimmed page, Escape or a TV remote's Back,
// a pull down by the handle (touch and pen), or the phone's back gesture: opening it adds one history step (history:
// false where the page keeps its own steps, as the Quran dialog does). `panel` is the part that shows, when the dialog
// itself is see-through. Returns { open, close, grab }; the dialog's own close event fires as before.
const PHONE = '(max-width: 48rem)';
export function sheet(dlg, { history: steps = true, panel = dlg } = {}) {
  dlg.classList.add('sheet');
  const grab = document.createElement('div');
  grab.className = 'sheet-grab'; grab.setAttribute('aria-hidden', 'true'); grab.innerHTML = '<span></span>';
  panel.prepend(grab);
  const phone = () => matchMedia(PHONE).matches;
  const id = dlg.id || 'sheet';
  let popping = false, leaving = false, openedAt = 0;
  const reset = () => { panel.style.translate = ''; panel.style.opacity = ''; };
  function open() {
    if (dlg.open) return;
    reset();
    openedAt = performance.now();
    dlg.showModal();
    if (steps) history.pushState({ ...(history.state || {}), sheet: id }, '');
    if (phone()) sheetIn(panel); else fade(panel);
  }
  async function close(from = 0) {
    if (!dlg.open || leaving) return;
    leaving = true;
    if (phone()) await done(animate(panel, { opacity: [1, 0], translate: [`0 ${from}px`, '0 100%'] }, { duration: T.dur.fast, ease: T.ease }));
    dlg.close(); reset(); leaving = false;
  }
  dlg.addEventListener('close', () => { if (steps && !popping && history.state?.sheet === id) history.back(); }); // its history step goes too
  if (steps) addEventListener('popstate', () => { if (dlg.open && history.state?.sheet !== id) { popping = true; dlg.close(); reset(); popping = false; } });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Escape, or a TV remote's Back
  // a tap on the dimmed page behind it. Not in the first moment: a sheet opened on pointerup (the board's prayer columns)
  // is followed by that same tap's click, which lands on the dimmed page now under the finger (iPhone)
  dlg.addEventListener('click', (e) => { if (e.target === dlg && performance.now() - openedAt > 500) close(); });
  // Pull it down by the handle row: past a third of the way, or a quick flick, and it closes; otherwise it settles back
  let y0 = null, t0 = 0, dy = 0;
  panel.addEventListener('pointerdown', (e) => {
    if (!phone() || !dlg.open || e.button > 0) return;
    const onGrab = !!e.target.closest('.sheet-grab'), nearTop = e.clientY - panel.getBoundingClientRect().top < 40;
    if (!onGrab && (e.pointerType === 'mouse' || !nearTop || e.target.closest('button, a, input, select, textarea, summary, label'))) return;
    y0 = e.clientY; t0 = e.timeStamp; dy = 0;
    try { panel.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: the move events still arrive while over it */ }
  });
  panel.addEventListener('pointermove', (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.translate = `0 ${dy}px`; });
  const end = (e) => {
    if (y0 == null) return;
    const fast = dy / Math.max(1, e.timeStamp - t0) > .6, far = dy > Math.min(160, panel.offsetHeight / 3);
    y0 = null;
    if (dy > 8 && (far || fast)) return close(dy);
    panel.style.translate = '';
    if (dy) animate(panel, { translate: [`0 ${dy}px`, '0 0'] }, spring('snappy'));
  };
  panel.addEventListener('pointerup', end);
  panel.addEventListener('pointercancel', end);
  return { open, close: () => close(), grab };
}

// A sideways swipe with one finger (touch only): fn(1) for a swipe to the left (the next one), fn(-1) to the right.
// Not when it starts on a control, inside a row that scrolls sideways, in an open window, or at the screen's edges
// (the system's own back gesture lives there); ok(target) can refuse it too. Up-and-down scrolling is left alone.
const scrollsX = (el) => { for (; el && el !== document.body; el = el.parentElement) { if (el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true; } return false; };
export function onSwipe(el, fn, ok = () => true) {
  let x0 = null, y0 = 0, t0 = 0, from = null;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    x0 = e.touches.length === 1 && t.clientX > 24 && t.clientX < innerWidth - 24 ? t.clientX : null;
    y0 = t.clientY; t0 = e.timeStamp; from = e.target;
    // the end also goes to where the touch began, even once that is gone from the page (Today's board is redrawn every
    // second, and then it never reaches el): listen there too; whichever hears it first handles it
    from.addEventListener('touchend', end, { passive: true, once: true });
    from.addEventListener('touchcancel', () => { x0 = null; }, { passive: true, once: true });
  }, { passive: true });
  el.addEventListener('touchend', end, { passive: true });
  function end(e) {
    if (x0 == null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 1.5 * Math.abs(dy) || e.timeStamp - t0 > 800) return;
    if (from.closest('input, select, textarea, button.stp-btn, .qp-tabs, .seg, dialog, [data-noswipe]') || document.querySelector('dialog[open]') || scrollsX(from) || !ok(from)) return;
    fn(dx < 0 ? 1 : -1);
  }
  el.addEventListener('touchcancel', () => { x0 = null; }, { passive: true });
}
// The view a swipe brought in slides in from that side (a fade with Reduce motion, nothing in E-ink: animate decides)
export const slideIn = (el, dir) => animate(el, { translate: [`${dir * 40}px 0`, '0 0'], opacity: [0, 1] }, { duration: T.dur.normal, ease: T.ease });
