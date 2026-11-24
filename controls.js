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
