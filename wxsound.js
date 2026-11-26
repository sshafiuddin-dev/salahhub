// Weather sound: rain, wind, hail and thunder made on this device from noise (no sound files, nothing downloaded),
// following the live weather. Off unless chosen (Settings › Display › Weather sound), paused and played again with the
// Sound button at the top. app.js keeps it quiet while the adhan, an alert or the Quran plays, and it comes back after.
// Browsers only start sound after a tap on the page: until then wxBlocked() is true and app.js shows
// "Tap to allow weather sound"; the tap calls wxResume().
// Thunder follows the bolts the realistic sky throws (the 'sky:strike' event from skyfx.js), a moment later as in life;
// with no realistic sky on screen it keeps its own time.

const rnd = Math.random;
let a = null, n = null, want = false, vol = .5, scene = null, quiet = true, ticker = 0, lastStrike = 0, ownNext = 0;

const audible = (p) => !!p && ((p.rain || 0) > 0 || (p.hail || 0) > 0 || (p.snow || 0) > 0 || !!p.storm || Math.abs(p.wind || 0) > .45); // a light breeze stays silent
const strength = (p) => Math.min(1.2, (p.rain || 0) + (p.hail || 0) * .6);

function build() {
  const A = window.AudioContext || window.webkitAudioContext;
  if (!A) return false;
  try { a = new A(); } catch (e) { return false; }
  const len = a.sampleRate * 3, wb = a.createBuffer(1, len, a.sampleRate), pb = a.createBuffer(1, len, a.sampleRate);
  const w = wb.getChannelData(0), p = pb.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0; // pink noise: softer and deeper than white, the body of rain and wind
  for (let i = 0; i < len; i++) { const r = rnd() * 2 - 1; w[i] = r; b0 = .99765 * b0 + r * .099046; b1 = .963 * b1 + r * .2965164; b2 = .57 * b2 + r * 1.0526913; p[i] = (b0 + b1 + b2 + r * .1848) * .11; }
  const master = a.createGain(); master.gain.value = 0; master.connect(a.destination);
  const out = a.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 18000; out.connect(master); // through glass: muffled
  const loop = (buf, type, f, q, dest) => {
    const s = a.createBufferSource(); s.buffer = buf; s.loop = true;
    const fl = a.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = a.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(dest); s.start(0, rnd() * 2);
    return { g, fl };
  };
  n = { white: wb, pink: pb, master, out, hiss: loop(wb, 'bandpass', 2800, .45, out), body: loop(pb, 'lowpass', 900, .7, out), wind: loop(pb, 'bandpass', 450, 1.3, master) };
  const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = .12; lg.gain.value = 260; // gusts
  lfo.connect(lg); lg.connect(n.wind.fl.frequency); lfo.start();
  a.addEventListener && a.addEventListener('statechange', () => dispatchEvent(new Event('wxsound:state')));
  return true;
}

const live = () => !!(a && n && want && !quiet && !document.hidden && scene && a.state === 'running');

function burst(type, f, q, gain, dur, delay = 0) {
  const t = a.currentTime + delay, s = a.createBufferSource(); s.buffer = n.white;
  const fl = a.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = a.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(.01, dur * .2)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(n.out); s.start(t, rnd() * 2, dur + .05);
}
function thunder(delay, power) {
  if (!live()) return;
  if (delay < .8) burst('highpass', 1400, .5, .25 * power, .25, delay); // a near strike cracks first
  const t = a.currentTime + delay, dur = 3.5 + rnd() * 3, s = a.createBufferSource(); s.buffer = n.pink;
  const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 90 + power * 160; fl.frequency.setTargetAtTime(70, t + .5, 1.5);
  const g = a.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(1.1 * power, t + .08);
  g.gain.linearRampToValueAtTime(.85 * power, t + .4 + rnd() * .4); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(n.master); s.start(t, rnd() * 1.5, dur + .1);
}
addEventListener('sky:strike', (e) => {
  lastStrike = Date.now();
  const bolt = !!(e.detail && e.detail.bolt), delay = bolt ? .3 + rnd() * 1.8 : 1 + rnd() * 3;
  thunder(delay, Math.max(.35, Math.min(1, 1.2 - delay * .25)));
});

function ticks() { // hail on the roof, and drops tapping the window
  if (!live()) return;
  if (scene.hail > 0 && rnd() < scene.hail * 2.8) burst('highpass', 2500 + rnd() * 2500, 1, .12 * scene.hail, .03);
  if (scene.glass && scene.rain > 0 && rnd() < scene.rain * 1.6) burst('bandpass', 1800 + rnd() * 1600, 4, .1, .04);
}
function apply() {
  if (!a || !n) return;
  const t = a.currentTime, on = live();
  n.master.gain.setTargetAtTime(on ? vol * .8 : 0, t, on ? .6 : .15); // comes in gently, steps aside quickly
  if (!scene) return;
  const r = strength(scene), glass = !!(scene.glass && r > 0), w = Math.abs(scene.wind || 0), sn = scene.snow || 0;
  n.out.frequency.setTargetAtTime(glass ? 1600 : 18000, t, .3);
  n.hiss.g.gain.setTargetAtTime(Math.min(1, r) * .32, t, .5);
  n.body.g.gain.setTargetAtTime(r * (glass ? .45 : .25), t, .5);
  n.wind.g.gain.setTargetAtTime(Math.pow(Math.max(0, Math.min(1, w) - .3) / .7, 1.5) * .45 + (sn > 0 ? .06 : 0) + (sn > .7 ? .1 : 0), t, .6);
  const tick = on && ((scene.hail || 0) > 0 || glass);
  if (tick && !ticker) ticker = setInterval(ticks, 100); else if (!tick && ticker) { clearInterval(ticker); ticker = 0; }
  // no bolts on screen (printed sky, sky Off): thunder keeps its own time, every 8 to 20 seconds
  const now = Date.now();
  if (on && scene.storm && now - lastStrike > 20000 && now > ownNext) { if (ownNext) thunder(1 + rnd() * 3, .6); ownNext = now + 8000 + rnd() * 12000; }
}
document.addEventListener('visibilitychange', apply);

// on: the setting; volume: 0 to 1. Building the sound needs no tap; starting it may.
export function wxSet(on, volume) {
  want = !!on; vol = Math.max(0, Math.min(1, +volume || 0));
  if (want && !a) build();
  apply();
  if (a && !want && a.state === 'running') setTimeout(() => { if (!want && a.state === 'running') a.suspend().catch(() => {}); }, 500);
  if (a && want && a.state === 'suspended') a.resume().catch(() => {}); // allowed once the page has been tapped this visit
}
// Once a second from app.js: the sky's scene (with glass), and whether to keep quiet (paused, or another sound playing).
export function wxUpdate(p, keepQuiet) { scene = p; quiet = !!keepQuiet; apply(); }
// Whether this weather makes any sound at all.
export const wxAudible = () => audible(scene);
// True when the sound should be playing but the browser is waiting for a tap.
export const wxBlocked = () => want && audible(scene) && (!a || a.state !== 'running');
// From a tap or key press: start the sound the browser was holding back.
export function wxResume() {
  if (want && !a) build();
  if (!a || !want || a.state === 'running') return Promise.resolve();
  return a.resume().then(apply, () => {});
}
