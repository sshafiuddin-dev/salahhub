import { animate } from './motion.js';

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
