import PrayTimes from './lib/PrayTimes.js';
import { CalculationMethods } from './lib/CalculationMethods.js';
import { parseAddress, addressOf, MASJIDS, NEAR_MILES, nearestMasjid, bellState, pastKeys, cleanKhutbahTimes, khutbahsBefore, wallMs, safeToReload, PRAYERS, NAMES, DIM_NAMES, isNight, dimLevel, hijriNow, cleanTune, parseHM, iqamaAt, fmt, nextEvent, fridayRows, km, alertsBetween, cleanStep, cardWindow, clock, burnShift, prayerWeather, shareDayText, untilText, skyParams, esc, beepWav, alertLogText, progressOf, prevEventAt, countDay } from './logic.js';
import { updateSky, mountSky, redrawSky } from './sky.js';
import { CLOCKS, renderClock, renderTimes, AR, AR_JUM } from './clocks.js';
import { animate, swap, fade, rows, fly } from './motion.js';
import { bubble, stepper, searchBox, crumbs, sheet } from './controls.js';
import { startTour, tourOpen } from './tour.js';
import { initRemote } from './remote.js';
import { initCounter, counterHtml, setGroup, isDone as isDoneKey, paint as paintCount } from './counter.js';
import { fetchWeather, fetchAlerts, weatherHtml } from './weather.js';
import { SETS, AUDIO, pickSet, fillSets } from './adhkar.js';
import { HISN, HISN_CATS, hisnUrl } from './hisn.js';
import { initQuran } from './quran.js';
import { initFeedback } from './feedback.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const validZone = (z) => { if (typeof z !== 'string') return false; try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } };
const DEVICE_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
// Where devices set up before the app asked for a location have always been (they keep it); a brand-new device starts
// at its approximate location instead (approxPlace, below) and only uses this to compute while it has none
const START = { lat: MASJIDS[0].lat, lng: MASJIDS[0].lng, zone: MASJIDS[0].zone, name: MASJIDS[0].town };
const ADHANS = { makkah: 'Makkah (3:44)', egypt: 'Egyptian style (3:25)', aqsa: 'Masjid Al-Aqsa (4:07)', ottoman: 'Ottoman style, Shaykh Nazim (2:38)', afasy: 'Mishary Al-Afasy (4:17)' };
const FAJR_ADHANS = { 'fajr-zahrani': 'Mansoor Az-Zahrani (3:26)', 'fajr-afasy': 'Mishary Al-Afasy (3:24)' };
// What an alert can do: show a message only, play a short sound, or play an adhan recording (the default one from the pickers above, or a named one)
const SOUNDS = { message: 'Message only', beep: 'Soft beep', bismillah: 'Bismillah, spoken', adhan: 'Adhan, your default recording' };
const RECORDINGS = { ...ADHANS, ...FAJR_ADHANS };
// The beep is made in the page. audio/bismillah.mp3 is hisnmuslim.com's recording of Hisn al-Muslim ch. 8 (before wudu), kept here so it plays offline;
// the recording says more, so only 5.5 to 6.6 s plays, where "Bismillah" is said on its own (the browser stops at the end of the range)
const SOUND_SRC = { beep: URL.createObjectURL(new Blob([beepWav()], { type: 'audio/wav' })), bismillah: 'audio/bismillah.mp3#t=5.5,6.6' };
const SOUND_KEYS = [...Object.keys(SOUNDS), ...Object.keys(RECORDINGS)];
const soundName = (t) => t === 'adhan' ? 'Adhan recording' : SOUNDS[t] ? SOUNDS[t].split(',')[0] : `${RECORDINGS[t].replace(/ \(.*/, '')} adhan`;
const ALERT_KEYS = [...PRAYERS, 'jumuah'];
const LOOKS = { paper: 'Printed timetable', eink: 'E-ink', hand: 'Handwritten', contrast: 'High contrast' };
const AUTO_DIM = ['isha', 'maghrib', 'off'];
const DEFAULTS = {
  method: 'ISNA', asr: 'Standard', place: null, asked: false, iqama: {}, adhan: 'makkah', fajrAdhan: 'fajr-zahrani', muted: false, alerts: null,
  tune: {}, hijriShift: 0, hijriMaghrib: false, clock: 'board', look: 'paper', autoDim: 'isha', nightStart: 'isha', nightLevel: 3, level: 0, seconds: true, wxSky: 'real', wxMove: true, units: /-US$/i.test(navigator.language || '') ? 'F' : 'C',
  defIqama: null, tableOpen: false, big: 'auto', adhkar: true, adhkarCat: 'all', translit: true, arSize: 'm', awake: false, dxLayout: 'auto', dxCard: 'rest',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Settings stay on this device; anything malformed falls back to the defaults
let settings = { ...DEFAULTS };
let firstRun = false; // nothing saved yet: a brand-new device
try { firstRun = localStorage.getItem('iqama-settings') === null; } catch (e) {}
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('iqama-settings') || '{}') }; } catch (e) {}
if (!CalculationMethods[settings.method]) settings.method = DEFAULTS.method;
if (!settings.iqama || typeof settings.iqama !== 'object') settings.iqama = {};
const p = settings.place;
settings.place = p && typeof p === 'object' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  ? { lat: p.lat, lng: p.lng, zone: validZone(p.zone) ? p.zone : DEVICE_ZONE, name: typeof p.name === 'string' && p.name ? p.name.slice(0, 80) : 'Your location', ...(p.approx === true ? { approx: true } : {}) }
  : null;
if (settings.place && !settings.place.approx) settings.asked = true; // an approximate place still waits to be confirmed
if (!settings.place && !firstRun) settings.place = { ...START }; // existing devices keep the place they have always shown
// A brand-new device starts where its internet connection roughly is: this site's own server reads Cloudflare's guess
// of the city and passes it on, keeping nothing. Shown as approximate until confirmed; null when it cannot be told.
async function approxPlace(ms = 4000) {
  try {
    const r = await fetch('/api/where', { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lng)) return null;
    return { lat: +j.lat.toFixed(3), lng: +j.lng.toFixed(3), zone: validZone(j.zone) ? j.zone : DEVICE_ZONE, name: (typeof j.name === 'string' && j.name ? j.name : 'Your area').slice(0, 80), approx: true };
  } catch (e) { return null; }
}
if (firstRun) settings.place = await approxPlace();
if (!ADHANS[settings.adhan]) settings.adhan = DEFAULTS.adhan;
if (!FAJR_ADHANS[settings.fajrAdhan]) settings.fajrAdhan = DEFAULTS.fajrAdhan;
if (!CLOCKS[settings.clock]) settings.clock = DEFAULTS.clock;
// Saves from before the timetable look: High contrast stays, the always-dark Night theme or a fixed dark mode become a fixed dim level
if (settings.palette !== undefined && settings.look === DEFAULTS.look) {
  if (settings.palette === 'contrast') settings.look = 'contrast';
  if (settings.palette === 'night') Object.assign(settings, { autoDim: 'off', level: 3 });
  else if (settings.mode === 'dark') Object.assign(settings, { autoDim: 'off', level: 2 });
}
for (const k of ['palette', 'mode', 'dxNight', 'dxAuto']) delete settings[k];
if (!LOOKS[settings.look]) settings.look = DEFAULTS.look;
settings.tune = cleanTune(settings.tune);
if (![-2, -1, 0, 1, 2].includes(settings.hijriShift)) settings.hijriShift = 0;
// Default iqama for a prayer with no time from the masjid or the visitor: off (null), or minutes after adhan, shown labelled "default"
if (!(Number.isInteger(settings.defIqama) && settings.defIqama >= 0 && settings.defIqama <= 60)) settings.defIqama = null;
settings.hijriMaghrib = settings.hijriMaghrib === true;
if (!AUTO_DIM.includes(settings.autoDim)) settings.autoDim = DEFAULTS.autoDim;
if (![1, 2, 3, 4].includes(settings.nightLevel)) settings.nightLevel = DEFAULTS.nightLevel; // 4: Black (no light)
if (![0, 1, 2, 3].includes(settings.level)) settings.level = DEFAULTS.level;
if (settings.units !== 'F' && settings.units !== 'C') settings.units = DEFAULTS.units;
settings.muted = settings.muted === true;
settings.adhkar = settings.adhkar !== false;
// Display settings, second version: the five-way weather background becomes a picture choice and a Movement switch; the By day level
// counts by day; and night brightness comes only from At night (the realistic sky no longer forces Darkest after Maghrib).
// Converted once, so each screen keeps showing what it showed: nights that the sky made Darkest stay Darkest.
if (settings.dispV !== 2 && settings.dispV !== 3) {
  const wx = settings.wxBack === false ? 'off' : settings.wxBack ?? 'auto';
  settings.wxSky = wx === 'off' ? 'off' : wx === 'print' || wx === 'still' ? 'print' : 'real';
  settings.wxMove = wx !== 'still';
  if (settings.autoDim !== 'off') {
    settings.nightStart = settings.autoDim;
    if ((wx === 'auto' || wx === 'real') && settings.look === 'paper') settings.nightLevel = 3;
    settings.level = 0; // with Auto on, days were always Bright
  }
  settings.dispV = 3;
}
// Third version: the realistic sky (the sun on its path by day, the moon at the Hijri date's phase at night) is the default
// picture again, by day too. Screens on the second version had a plain on/off switch: on becomes the realistic sky.
if (settings.dispV === 2) { settings.wxSky = settings.wxPic === false ? 'off' : 'real'; settings.dispV = 3; }
for (const k of ['wxBack', 'wxBackV', 'wxPic']) delete settings[k];
if (!['real', 'print', 'off'].includes(settings.wxSky)) settings.wxSky = DEFAULTS.wxSky;
settings.wxMove = settings.wxMove !== false;
settings.seconds = settings.seconds !== false;
if (!['isha', 'maghrib'].includes(settings.nightStart)) settings.nightStart = settings.autoDim === 'maghrib' ? 'maghrib' : 'isha';
settings.translit = settings.translit !== false;
if (!['s', 'm', 'l'].includes(settings.arSize)) settings.arSize = DEFAULTS.arSize;
settings.awake = settings.awake === true;
if (!['rest', 'duas'].includes(settings.dxCard)) settings.dxCard = DEFAULTS.dxCard;
if (!['auto', 'times', 'full'].includes(settings.dxLayout)) settings.dxLayout = DEFAULTS.dxLayout;

// Alerts for each prayer and for Jumu'ah
const blankAlert = (key) => key === 'jumuah'
  ? { on: false, before: { on: true, type: 'message', min: 15 }, times: [] }
  : { on: true, adhan: { on: true, type: 'message' }, before: { on: false, type: 'beep', min: 10 }, iqama: { on: false, type: 'beep', min: 5 } };
function cleanAlert(key, a) {
  const d = blankAlert(key);
  if (!a || typeof a !== 'object') return d;
  const step = (part, withMin = true) => cleanStep(a[part], d[part], SOUND_KEYS, withMin);
  if (key === 'jumuah') return { on: a.on === true, before: step('before'), times: cleanKhutbahTimes(Array.isArray(a.times) ? a.times : [a.time]) }; // a.time: the single time saved before there could be several
  return { on: a.on !== false, adhan: step('adhan', false), before: step('before'), iqama: step('iqama') };
}
const savedAlerts = settings.alerts && typeof settings.alerts === 'object' ? settings.alerts : {};
settings.alerts = Object.fromEntries(ALERT_KEYS.map(k => [k, cleanAlert(k, savedAlerts[k])]));
const save = () => { try { localStorage.setItem('iqama-settings', JSON.stringify(settings)); } catch (e) {} };
// The first-run tour (tour.js): flagged on a brand-new visitor's first load, shown once they have answered "where are you?"
// and are on Today; existing devices never get it by surprise. "Take the tour again" (About, the guide's #tour link) runs it any time.
const TOUR_KEY = 'iqama-tour';
let tourPending = false;
try { if (!settings.asked && !localStorage.getItem(TOUR_KEY)) localStorage.setItem(TOUR_KEY, 'pending'); tourPending = localStorage.getItem(TOUR_KEY) === 'pending'; } catch (e) {}
function runTour() {
  if (tourOpen()) return;
  tourPending = false;
  wake();
  startTour({ onEnd: () => { try { localStorage.setItem(TOUR_KEY, 'done'); } catch (e) {} } });
}

// Look, brightness and clock style. Brightness follows the prayer times once they are known; until then, the last level shown.
// A level picked by hand (the brightness button or slider) holds until day turns to night or back, then Auto takes over again.
let dimOverride = null, shownDim = null, timesKnown = false;
try { const d = +localStorage.getItem('iqama-dim'); if ([0, 1, 2, 3, 4].includes(d)) shownDim = d; } catch (e) {}
const nightNow = () => timesKnown && isNight(nowMinute, day.rows, day.sunrise, settings.autoDim);
// With the realistic sky, nights (Maghrib to sunrise) use the dark look, since the sky is dark then; a level picked by hand
// still holds, and the sky then switches to its printed form. Auto off keeps the level the person set.
const night = () => timesKnown && (nowMinute >= day.rows[3].adhan || nowMinute < day.sunrise);
// Weather background: the realistic sky (the default: the sun on its real path by day, stars and the moon at the Hijri
// date's phase at night), the printed sky, or off; each moving or still. sky.js draws the realistic sky only where the page
// matches it (light by day, Darkest at night) and the printed one otherwise. dim is the level on show (Black shows as Darkest).
// The Weather tab always shows the weather it describes: its picture follows the setting, and is the realistic sky even when
// the setting is Off (Off is about Today). Only the Printed timetable look has a sky, on every screen.
const onWeather = () => root.dataset.tab === 'weather'; // the tab on show (set by route; safe before the tabs are set up)
const skyStyle = () => (onWeather() && settings.wxSky === 'off' ? 'real' : settings.wxSky);
const skyBack = (dim = Number(root.dataset.dim) || 0) => (skyStyle() === 'off' ? 'off'
  : skyStyle() === 'real' ? (settings.wxMove ? 'real' : 'real-still') : settings.wxMove ? 'print' : 'still');
// The level asked for: 0 Bright to 3 Darkest, or 4 Black (no light)
const currentDim = () => (timesKnown || settings.autoDim === 'off' ? dimLevel(settings, nightNow(), dimOverride) : shownDim ?? 0);
// Black (no light): the page is covered in black after 30 s with no touch or key press, and drawn at Darkest underneath.
// A tap or key on the cover brings the times back for 30 s (that tap does nothing else); so do an alert and its sound.
const WAKE_MS = 30e3;
let wakeUntil = Date.now() + WAKE_MS; // the times show for 30 s when the app opens
const soundNow = () => { try { return playing(); } catch (e) { return false; } }; // playing() is set up further down; nothing plays before then
const blackNow = () => currentDim() === 4 && Date.now() >= wakeUntil && !soundNow();
function wake() { wakeUntil = Date.now() + WAKE_MS; if (root.dataset.black === '1') applyLook(); }
function setDim(level) {
  if (settings.autoDim === 'off') { settings.level = level; save(); dimOverride = null; }
  else dimOverride = { level, night: nightNow() };
  applyLook();
}
function applyLook() {
  const lvl = currentDim(), dim = Math.min(lvl, 3);
  root.dataset.palette = settings.look;
  root.dataset.dim = String(dim);
  root.dataset.black = blackNow() ? '1' : '0';
  root.dataset.nightsky = skyStyle() === 'real' && dim === 3 && night() ? '1' : '0'; // the realistic night sky is on show
  root.dataset.theme = dim === 3 || (dim === 2 && settings.look === 'contrast') ? 'dark' : 'light'; // Dim is a warm light page, except in High contrast
  root.dataset.clock = settings.clock;
  if (lvl !== shownDim) { shownDim = lvl; try { localStorage.setItem('iqama-dim', String(lvl)); } catch (e) {} }
  syncDim();
  redrawSky();
  syncThemeColor();
}
// The browser's top bar takes the page's colour: the paper, except on Today while the live sky shows, where the sky runs up under
// the status bar and the bar should be the sky's colour too, not a pale strip above it.
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const cs = getComputedStyle(root);
  let color = cs.getPropertyValue('--paper').trim() || '#0B2A33';
  if (root.dataset.tab === 'today' && root.dataset.skymode === 'real') {
    const probe = document.createElement('i'); // --sky can be a colour-mix(): let the browser turn it into a plain rgb()
    probe.style.cssText = 'position:absolute;width:0;height:0;background:var(--sky)';
    document.body.append(probe);
    const sky = getComputedStyle(probe).backgroundColor;
    probe.remove();
    try { // a plain #rrggbb, which every browser takes for its top bar (the computed value can be a newer color(srgb …))
      const g = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d');
      g.fillStyle = '#010203'; g.fillStyle = sky; // a colour the canvas refuses leaves the marker colour in place
      if (g.fillStyle === '#010203') throw new Error('colour not understood');
      g.fillRect(0, 0, 1, 1);
      const [r, gr, b, al] = g.getImageData(0, 0, 1, 1).data;
      if (al === 255) color = `#${[r, gr, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
    } catch (e) { /* keep the paper colour */ }
  }
  if (meta.content !== color) meta.content = color;
}
// the sky mode and the tab change on their own (sky.js, the address): keep the bar in step
new MutationObserver(syncThemeColor).observe(root, { attributes: true, attributeFilter: ['data-skymode', 'data-tab', 'data-night', 'data-sky', 'data-theme'] });
let nowMinute = 0;
applyLook();

let masjid = { id: '', iqama: {}, sunday: {}, jumuah: [], updated: '', checked: 0, stale: false, failed: false };
const placeKnown = () => !!settings.place;
const place = () => settings.place || START;
// The masjid whose iqama times apply here: the nearest on the list within NEAR_MILES, else none (the visitor sets their own)
const nearMasjid = () => (placeKnown() ? nearestMasjid(place()) : null);
const near = () => !!nearMasjid();
// the loaded timetable belongs to the masjid that applies here (it may be another one's after a move)
const masjidTimes = () => near() && masjid.id === nearMasjid().id;
const masjidName = () => nearMasjid()?.name || 'the masjid';
// Messages show as a toast above the tab bar and fade after a few seconds, or at once when tapped (or on Back / Escape)
let toastTimer = 0;
// Motion leaves its last frame on the element as inline styles (opacity: 1, scale: 1), which would beat the stylesheet
// and keep a hidden toast on screen. So any running settle is stopped and those styles are cleared whenever it hides.
const clearToastMotion = (el) => {
  el.getAnimations?.().forEach(a => a.cancel());
  el.style.removeProperty('opacity'); el.style.removeProperty('scale');
};
const hideToast = () => {
  const el = $('status');
  clearTimeout(toastTimer);
  clearToastMotion(el);
  el.classList.remove('show');
};
$('status').addEventListener('click', (e) => { if (!e.target.closest('.toast-act')) hideToast(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('status').classList.contains('show')) hideToast(); });
// A short message at the bottom. action = { label, fn } adds one button to it (as Undo after closing the Quran player),
// and keeps the message up for 8 seconds instead of 5. ok = true starts it with a tick, for a message that confirms something worked.
// A new message that replaces one still showing gives a quick settle, so it reads as new.
const say = (text, action, ok = false) => {
  const el = $('status'), showing = el.classList.contains('show');
  if (!text) return hideToast();
  clearToastMotion(el);
  el.textContent = text;
  if (text && ok) el.insertAdjacentHTML('afterbegin', '<svg class="toast-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>');
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.addEventListener('click', () => { hideToast(); action.fn(); });
    el.append(' ', b);
  }
  el.classList.add('show');
  el.classList.toggle('has-act', !!action);
  if (showing) { const a = swap(el); if (a?.finished) Promise.resolve(a.finished).then(() => clearToastMotion(el), () => {}); }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 8000 : 5000);
};

// A short record under Settings, Adhan and alerts, so a missed alert can be explained: the last alert and what became of its message and sound,
// the times this page's clock stopped (a sleeping or frozen tab skips alerts), and when the page started. Kept on this device.
let alertLog = { last: null, gaps: [] }, tickedAt = 0;
try { const j = JSON.parse(localStorage.getItem('iqama-alertlog') || '{}'); if (j && typeof j === 'object') alertLog = { last: j.last || null, gaps: Array.isArray(j.gaps) ? j.gaps : [] }; } catch (e) {}
const stamp = (ms = Date.now()) => { const c = clock(new Date(ms), place().zone); return `${MONTHS[c.m - 1]} ${c.d}, ${fmt(c.sec / 60)}`; };
const startedAt = stamp();
const showAlertLog = () => { $('alert-log').textContent = alertLogText(alertLog, startedAt); };
function logAlert(patch) {
  alertLog = { ...alertLog, ...patch };
  try { localStorage.setItem('iqama-alertlog', JSON.stringify(alertLog)); } catch (e) {}
  showAlertLog();
}

// Back link only for visitors who came from the portfolio, never in the installed app
try {
  const ref = new URL(document.referrer);
  $('back').hidden = !(ref.origin === 'https://sshafiuddin.pages.dev' && !matchMedia('(display-mode: standalone)').matches);
} catch (e) {}

function dayTimes(y, m, d) {
  const { lat, lng, zone } = place(), useMasjid = masjidTimes();
  const pt = PrayTimes(settings.method);
  pt.setMethod(settings.method);
  pt.adjust({ asr: settings.asr === 'Hanafi' ? 'Hanafi' : 'Standard' });
  // shortcut: one UTC offset per day (taken at midday), so times before 2 AM on a clock-change day are an hour off
  const t = pt.getTimes([y, m, d], [lat, lng], clock(new Date(Date.UTC(y, m - 1, d, 17)), zone).offset, 0, 'Float');
  const min = (k) => Math.round(t[k] * 60) + (settings.tune[k] || 0); // the visitor's own adjustment, Settings, Location
  const sunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0; // the masjid's Sunday times (at ISCJ, Dhuhr is later) replace its weekday ones
  return {
    sunrise: min('sunrise'),
    rows: PRAYERS.map(key => {
      const adhan = min(key), own = settings.iqama[key] != null;
      const iqama = iqamaAt(own ? settings.iqama[key] : useMasjid ? (sunday && masjid.sunday[key]) || masjid.iqama[key] : null, adhan);
      // no time known: the visitor's default offset, if they turned one on, marked so every view labels it "default"
      return iqama == null && settings.defIqama != null ? { key, adhan, own, iqama: adhan + settings.defIqama, def: true } : { key, adhan, own, iqama };
    }),
  };
}

// Hijri date for the top bar, the clock and full screen; with the Maghrib setting on it turns over at the Maghrib adhan
function setHijri(nowMin) {
  const h = hijriNow(today.y, today.m, today.d, settings.hijriShift, settings.hijriMaghrib, nowMin, day.rows[3].adhan);
  if (h === today.hijri) return false;
  today.hijri = h;
  today.full = h ? `${today.long} · ${h}` : today.long;
  return true;
}
function showHijri() {
  $('dx-date').textContent = today.full;
  $('hijri').textContent = today.hijri;
  $('hijri').hidden = !today.hijri;
}

let today = null, day = null, tomorrow = null, lastSec = null, weather = null;
let wxLoading = true; // the first weather has not come in yet: the Weather tab shows grey placeholders, not "not available"
// After the Isha iqama (or an hour after the Isha adhan when no iqama is set) the timetables show tomorrow's day
let ahead = false;
const isAhead = (nowMin) => nowMin >= (day.rows[4].iqama ?? day.rows[4].adhan + 60);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let alerts = []; // National Weather Service warnings in force here: [{ event, severity, until, sender }]

function loadDay(c) {
  today = c;
  day = dayTimes(c.y, c.m, c.d);
  timesKnown = true;
  const n = new Date(Date.UTC(c.y, c.m - 1, c.d + 1));
  tomorrow = dayTimes(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
  Object.assign(tomorrow, { y: n.getUTCFullYear(), m: n.getUTCMonth() + 1, d: n.getUTCDate(), weekday: WEEKDAYS[n.getUTCDay()] });
  ahead = isAhead(c.sec / 60);
  today.long = new Intl.DateTimeFormat('en-US', { timeZone: place().zone, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  setHijri(c.sec / 60);
  renderDay();
  renderWeather();
}

const jumuahMins = () => (masjidTimes() ? [...new Set(masjid.jumuah.map(parseHM).filter(v => v != null))].sort((a, b) => a - b) : []);
// Khutbah times to show: the visitor's own khutbah times (set under Jumu'ah alerts), else the nearby masjid's, else none
const ownKhutbahs = () => settings.alerts.jumuah.times.map(parseHM).filter(v => v != null);
const shownJumuah = () => { const own = ownKhutbahs(); return own.length ? own : jumuahMins(); };
const jumuah = () => shownJumuah().map(fmt).join(', ');
// Rows the clocks show: on a Friday with khutbah times, Dhuhr is shown as Jumu'ah
const shownRows = () => fridayRows(day.rows, today.weekday, shownJumuah());

function renderDay() {
  const sheet = ahead ? tomorrow : today, v = ahead ? tomorrow : day;
  // the header date always turns at midnight (the Hijri date beside it follows its own setting); only the table moves on after Isha
  $('date').textContent = `${today.weekday}, ${MONTHS[today.m - 1]} ${today.d}`;
  $('today').tHead.rows[0].cells[0].textContent = ahead ? 'Tomorrow' : 'Prayer';
  $('place').textContent = placeKnown() ? place().name : 'Location not set';
  $('place-name').textContent = placeKnown() ? place().name : 'Location not set';

  let body = '';
  for (const r of v.rows) {
    body += `<tr data-k="${r.key}"><th scope="row">${NAMES[r.key]}</th><td>${fmt(r.adhan)}</td><td>${r.iqama == null ? 'Not set' : `${fmt(r.iqama)}${r.def ? ' <small class="iq-def">default</small>' : ''}`}</td></tr>`;
    if (r.key === 'fajr') body += `<tr class="minor" data-k="sunrise"><th scope="row">Sunrise</th><td>${fmt(v.sunrise)}</td><td></td></tr>`;
  }
  if (jumuah()) body += `<tr class="minor${sheet.weekday === 'Fri' ? ' friday' : ''}"><th scope="row">Jumu&rsquo;ah khutbah</th><td colspan="2">${jumuah()}</td></tr>`;
  $('today').tBodies[0].innerHTML = body;

  const own = day.rows.filter(r => r.own).map(r => NAMES[r.key]), mine = own.length ? ` ${own.join(', ')} set by you.` : '';
  const [uy, um, ud] = masjid.updated.split('-');
  $('source').textContent =
    own.length === 5 ? 'All iqama times set by you.'
      : !near() ? (own.length ? `${mine.trim()} Set the rest under Set your own iqama times.` : `No masjid timetable within ${NEAR_MILES} miles of here. Set your masjid’s times under Set your own iqama times.`)
      : masjid.failed ? `Could not load ${masjidName()} iqama times. Set your own below.${mine}`
      : `Iqama times from ${masjidName()}${masjid.checked ? `, checked ${new Date(masjid.checked).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${masjid.stale ? ` (${masjidName()} did not answer, so this is the last copy)` : ''}` : uy ? `, last changed ${MONTHS[um - 1]} ${+ud}, ${uy}` : ''}.${mine}`;

  jumuahNote();
  showHijri();
  $('dx-place').textContent = placeKnown() ? place().name : 'Location not set';
  if (tab === 'month') { renderMonth(); $('tab-title').textContent = monthTitle(); }
  tick();
}

// Fridays: one row per khutbah for the Jumu'ah alert (the visitor's own times, else the nearby masjid's), numbered when there are several
const alertRows = () => {
  const list = today.weekday === 'Fri' ? khutbahsBefore([...shownJumuah()].sort((a, b) => a - b), day.rows.find(r => r.key === 'asr')?.adhan) : [];
  return list.length ? [...day.rows, ...list.map((m, i) => ({ key: 'jumuah', adhan: m, iqama: null, ...(list.length > 1 ? { n: i + 1, of: list.length } : {}) }))] : day.rows;
};

// One line for the wall display: where iqama comes from and how fresh it is. Turns "late" after a day without a check.
const freshNote = () => {
  if (!near() || masjid.failed) return null;
  if (!masjid.checked) return { text: `Iqama from ${masjidName()}`, late: false };
  const t = new Date(masjid.checked).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const old = Date.now() - masjid.checked > 24 * 3600e3;
  return { text: old ? `Iqama not checked since ${t}, ${new Date(masjid.checked).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : `Iqama from ${masjidName()}, checked ${t}`, late: old || masjid.stale };
};

function tick() {
  const c = clock(new Date(), place().zone), nowMs = Date.now();
  // over 100 s since the last tick (alerts skip anything over 90 s late): the page was asleep, frozen or discarded
  if (tickedAt && nowMs - tickedAt > 100e3) logAlert({ gaps: [{ from: stamp(tickedAt), to: stamp(nowMs) }, ...alertLog.gaps].slice(0, 3) });
  tickedAt = nowMs;
  if (!today || c.d !== today.d) { const later = !!today; loadDay(c); if (later) sync(false, true); return; }
  const nowMin = c.sec / 60, rows = shownRows(), ev = nextEvent(rows, tomorrow.rows[0].adhan, nowMin, day.sunrise);
  if (isAhead(nowMin) !== ahead) { ahead = !ahead; renderDay(); return; } // renderDay ticks again with the new sheet
  const aheadDay = ahead ? { rows: fridayRows(tomorrow.rows, tomorrow.weekday, shownJumuah()), sunrise: tomorrow.sunrise } : null;
  const left = (wallMs(today.y, today.m, today.d, ev.at, place().zone) - nowMs) / 1e3; // real seconds to it, the same clock as the time shown
  $('now').textContent = fmt(Math.floor(nowMin));
  const at = wxAt(ev, rows);
  const big = bigNow();
  for (const id of BIG_HOSTS) $(id).dataset.big = big;
  const html = renderClock(settings.clock, { noSec: !settings.seconds, bells: bellsNow(), big, fold: !!settings.tableOpen, sec: c.sec, left, ahead: aheadDay, month: monthName(), now: nowMin, rows, sunrise: day.sunrise, next: ev, jumuah: shownJumuah(), date: today.full, tomorrowFajr: tomorrow.rows[0], wxAt: at, wxNow: wxNow(), wxLink: true, warn: warnLine(), fresh: freshNote() });
  redraw($('clock'), html);
  paintMark(progressOf(nowMin, prevEventAt(rows, ev, day.sunrise), ev.at), ev, left, rows);
  nowMinute = nowMin;
  if (setHijri(nowMin)) showHijri();
  if (currentDim() !== shownDim || (root.dataset.black === '1') !== blackNow()) applyLook();
  if (displayOpen) {
    if (timesLayout()) redraw($('dx-small'), renderTimes({ noSec: !settings.seconds, big, sec: c.sec, left, ahead: aheadDay, month: monthName(), now: nowMin, rows, sunrise: day.sunrise, next: ev, jumuah: shownJumuah(), date: today.full, tomorrowFajr: tomorrow.rows[0], wxNow: wxNow(), wxAt: at, warn: warnLine(), fresh: freshNote(), card: dxCardFor(nowMin) }));
    else {
      redraw($('dx-clock'), html);
      if (c.sec % 10 === 0) fitDisplay(); // re-fit after late font loads or a change in what the clock shows
    }
  }
  renderAdhkar(nowMin);
  if (tourPending && settings.asked && tab === 'today' && !displayOpen && !document.querySelector('dialog[open]')) { tourPending = false; setTimeout(runTour, 800); }
  const past = pastKeys(ev, ahead);
  for (const tr of $('today').tBodies[0].rows) { tr.classList.toggle('next', tr.dataset.k === ev.key); tr.classList.toggle('past', past.has(tr.dataset.k)); }
  const sky = skyParams(weather, { now: nowMin, sunrise: day.sunrise, maghrib: day.rows[3].adhan }, parseInt(today.hijri, 10) || 15);
  const dim = Math.min(currentDim(), 3);
  // no sky in the Handwritten and High contrast looks, nor at Dim; at Darkest only the realistic night sky
  // the Weather tab: by day at Bright, Soft and Dim; at night at Soft and Dim (the printed sky) and at Darkest (the moon and stars)
  wxBand();
  const skyOk = settings.look === 'paper' && (onWeather() ? dim < 3 || (skyStyle() === 'real' && sky.night)
    : dim < 2 || (skyStyle() === 'real' && (dim === 3 || !sky.night)));
  updateSky(sky, skyBack(dim), skyOk && root.dataset.black !== '1', root.dataset.theme === 'dark'); // nothing is drawn under the black cover

  // Alerts: only for moments crossed while the page is open
  if (placeKnown() && lastSec != null && c.sec > lastSec) for (const a of alertsBetween(alertRows(), settings.alerts, lastSec, c.sec)) fire(a);
  lastSec = c.sec;
}

// Month table: adhan times only
function monthRows() {
  const n = new Date(Date.UTC(today.y, today.m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => {
    const t = dayTimes(today.y, today.m, i + 1);
    return { d: i + 1, hijri: hijriNow(today.y, today.m, i + 1, settings.hijriShift, false, 0, 0), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(today.y, today.m - 1, i + 1)).getUTCDay()], times: [t.rows[0].adhan, t.sunrise, ...t.rows.slice(1).map(r => r.adhan)] };
  });
}
function renderMonth() {
  // Hijri column: the day number, with the month's name on the first row and wherever a new Hijri month begins
  $('month').tBodies[0].innerHTML = monthRows().map((r, i) => {
    const [hd, ...rest] = r.hijri.split(' '), hm = rest.slice(0, -1).join(' ');
    const h = !r.hijri ? '' : i === 0 || hd === '1' ? `${hd} <span class="mo-hm">${hm}</span>` : hd;
    const cls = [r.d === today.d ? 'today' : '', r.weekday === 'Fri' ? 'friday' : ''].filter(Boolean).join(' ');
    return `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${r.weekday} ${r.d}</th><td class="mo-hijri">${h}</td>${r.times.map(t => `<td>${fmt(t).replace(/ ([AP]M)$/, '<span class="mo-ap"> $1</span>')}</td>`).join('')}</tr>`;
  }).join('');
}
const monthName = () => (today ? new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(Date.UTC(today.y, today.m - 1, 15))) : '');
const monthTitle = () => (today ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(today.y, today.m - 1, 15))) : 'This month');

// Tabs: one screen each, chosen by the address (#weather), so the back button moves between them
const TAB_IDS = ['today', 'weather', 'adhkar', 'quran', 'month', 'settings'];
const MORE_TABS = ['adhkar', 'quran', 'month'];
const TITLES = { today: 'Today', weather: 'Weather', adhkar: 'Adhkar audio', quran: 'Quran', settings: 'Settings' };
let tab = 'today', sub = 'location', shownSub = sub, shownHub = false, lastAddr = '', cameFrom = ''; // cameFrom: the screen before this one (its address)
let feedback = null; // the feedback form, once set up
function go(t, s) {
  if (s) sub = s;
  const to = addressOf(t, t === 'settings' ? sub : null);
  if (location.hash.slice(1) === to) route(); else location.hash = to;
}
// The Help button opens the guide's chapter for the screen in view (guide/, built by scripts/guide/build.mjs)
const HELP_TAB = { today: 'today', weather: 'weather', adhkar: 'adhkar', quran: 'quran', month: 'adhkar' };
const PHONE_Q = '(max-width: 48rem)';
const SUB_NAMES = { location: 'Location', iqama: 'Iqama times', alerts: 'Adhan and alerts', display: 'Display', about: 'About' };
// The list of sections (phones): each row with what is set there now
function fillHub() {
  const on = PRAYERS.filter(k => settings.alerts[k].on).length;
  const vals = {
    location: placeKnown() ? place().name : 'Not set yet',
    iqama: masjidTimes() && !masjid.failed ? `From ${masjidName()}` : 'Your own times',
    alerts: settings.muted ? 'Off' : on === PRAYERS.length ? 'On for all five prayers' : on ? `On for ${on} of 5 prayers` : 'Off for every prayer',
    display: `${CLOCKS[settings.clock] || ''} · ${LOOKS[settings.look] || ''}`,
    about: 'What the app does, privacy and feedback',
  };
  for (const [k, v] of Object.entries(vals)) $(`hub-${k}`).textContent = v;
}
const HELP_SUB = { location: 'location', iqama: 'iqama', alerts: 'alerts', display: 'display', about: '' };
function route() {
  const a = parseAddress(location.hash);
  let h = a.tab;
  if (a.sub) sub = a.sub;
  if (h === 'tour') { history.replaceState(null, '', '#today'); h = 'today'; setTimeout(runTour, 400); } // the guide links here
  if (h === 'feedback') { history.replaceState(null, '', `#${tab}`); h = tab; setTimeout(() => feedback?.open(), 0); } // the guide links here
  tab = TAB_IDS.includes(h) ? h : 'today';
  // Phones: plain #settings (the tab bar's link) is a list of the sections. Wider screens keep the row of section tabs,
  // and plain #settings records which section shows, so Back returns to it
  const hub = tab === 'settings' && !a.sub && matchMedia(PHONE_Q).matches;
  if (tab === 'settings' && !a.sub && !hub) history.replaceState(history.state, '', `#settings/${sub}`);
  if (!placeKnown() && (tab === 'month' || tab === 'weather')) tab = 'today'; // both need a place: Today asks for one
  const moved = root.dataset.tab !== tab || (tab === 'settings' && (sub !== shownSub || hub !== shownHub));
  if (root.dataset.tab !== tab) setTimeout(() => { applyLook(); tick(); }, 0); // the Weather tab has its own sky rules
  root.dataset.tab = tab; // the stylesheet lays out Today as one sheet
  for (const id of TAB_IDS) $(`tab-${id}`).hidden = id !== tab;
  // a tab (or a Settings section) always opens at its top, not where it was last left; Month then moves to today below
  if (moved) { $(`tab-${tab}`).scrollTop = 0; scrollTo(0, 0); }
  shownSub = sub; shownHub = hub;
  document.querySelectorAll('.tabbar a:not(.brand-link), .dockbar a').forEach(a => { // the mark links to Today too, but is not a tab
    const on = a.getAttribute('href') === `#${tab}`;
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    a.classList.toggle('d-menu-active', on && !!a.closest('.tabbar'));
    a.classList.toggle('d-dock-active', on && !!a.closest('.dockbar'));
  });
  // More holds Adhkar, Quran and Month: it lights up while one of them is open, and closes once a choice is made
  document.querySelectorAll('.more').forEach(m => {
    const inside = MORE_TABS.includes(tab);
    m.classList.toggle('is-on', inside);
    m.querySelector('summary').classList.toggle('d-menu-active', inside && !!m.closest('.tabbar'));
    m.querySelector('summary').classList.toggle('d-dock-active', inside && !!m.closest('.dockbar'));
    const d = m.matches('details') ? m : m.querySelector('details');
    if (d) d.open = false;
  });
  // a section of Settings on a phone sits under the list of sections: its own title, with Back and the way here
  const inSub = tab === 'settings' && !hub && matchMedia(PHONE_Q).matches;
  $('tab-title').textContent = tab === 'month' ? monthTitle() : inSub ? SUB_NAMES[sub] : TITLES[tab];
  $('tab-title').classList.toggle('is-long', $('tab-title').textContent.length > 12); // a phone sets a long title smaller, beside the buttons
  // Back and the way here, above the title, on a screen that sits under another one: Month under Today, a section under Settings
  const way = $('crumbs'), up = tab === 'month' ? [{ label: 'Today', href: '#today' }] : inSub ? [{ label: 'Settings', href: '#settings' }] : null;
  way.hidden = !up;
  root.dataset.way = up ? 'on' : 'off'; // a phone gives the way here a row of its own, above the title
  way.innerHTML = up ? crumbs(up, tab === 'month' ? monthName() : SUB_NAMES[sub]) : '';
  const was = lastAddr, addr = hub ? 'settings' : addressOf(tab, tab === 'settings' ? sub : null);
  if (addr !== lastAddr) { cameFrom = lastAddr; lastAddr = addr; } // route() also runs to redraw the same screen
  const helpAt = `guide/${tab === 'settings' ? (hub ? '' : HELP_SUB[sub]) : HELP_TAB[tab]}`;
  for (const a of [$('help'), ...document.querySelectorAll('[data-help]')]) a.href = helpAt; // the top Help button, and Help in the phone's More menu
  document.querySelectorAll('[data-sub]').forEach(b => b.setAttribute('aria-selected', b.dataset.sub === sub));
  { const seg = document.querySelector('.seg'), on = seg?.querySelector('[aria-selected="true"]'); if (seg && on) seg.scrollLeft = on.offsetLeft - (seg.clientWidth - on.offsetWidth) / 2; } // a phone's tab row scrolls: keep the open section in view
  document.querySelectorAll('.sub-pane').forEach(p => { p.hidden = hub || p.id !== `sub-${sub}`; });
  $('set-hub').hidden = !hub;
  if (hub && was !== 'settings') {
    fillHub();
    rows($('set-hub').querySelectorAll('.hub-tile'));
    $('set-hub').querySelector(`[href="#${was}"]`)?.focus({ preventScroll: true }); // back from a section: on its row again
  }
  if (tab === 'month' && today) { renderMonth(); requestAnimationFrame(() => document.querySelector('#month tr.today')?.scrollIntoView({ block: 'center' })); } // open at today, not the 1st
}
addEventListener('hashchange', route);
matchMedia(PHONE_Q).addEventListener('change', route); // turning a tablet or resizing a window across the phone width
// Back, or a screen in the way here: when that is the screen just before this one, step back in the history (as the
// phone's back gesture would), so Back and the gesture never pile up steps; otherwise go to it.
$('crumbs').addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  const to = a.getAttribute('href').slice(1);
  if (to === cameFrom) history.back(); else location.hash = to;
  if (e.detail === 0) setTimeout(() => document.querySelector(`.tabbar a[href="#${to}"], .dockbar a[href="#${to}"]`)?.focus({ preventScroll: true }), 0); // OK on a remote: the focus lands on the screen's own tab
});
// A TV remote's Back (Escape) on a screen with a Back button, when nothing is open on top of it, presses that Back button.
// Read before anything else hears the key (capture), so a menu or window that Escape closes first is still seen as open.
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || tourOpen()) return;
  if (document.querySelector('dialog[open], #qp-now:not([hidden]), details[open]')) return;
  if (e.target.closest?.('input, textarea, select, .sx')) return; // Escape there clears the field
  const back = [...document.querySelectorAll('.crumb-back')].find(b => b.offsetParent !== null && !b.closest('[hidden]'));
  if (back) { e.preventDefault(); back.click(); }
}, true);
initRemote({ busy: tourOpen }); // TV remote: the arrows move between controls (remote.js); the tour keeps them while it is open
// Dhikr counts belong to the day from one Fajr adhan to the next (counter.js); none until today's times are worked out
initCounter({ dayKey: () => (today && day ? countDay(today.y, today.m, today.d, clock(new Date(), place().zone).sec / 60, day.rows[0].adhan) : ''),
  onChange: (key) => { if (key) chapterDone(key.split(':')[0]); else HISN.forEach(([id]) => chapterDone(id)); } });
// a tap anywhere else, a choice in it, or Escape closes the More menu. Outside taps are read on pointerdown: the clock is
// drawn again every second and can swallow the click that would otherwise close it.
const moreMenus = () => document.querySelectorAll('.more details, details.more, details.share');
// Opening it: its entries rise in one after another, Quran (next to More) first
moreMenus().forEach(d => d.addEventListener('toggle', () => { if (d.open) rows(d.querySelectorAll('.more-menu a')); }));
document.addEventListener('pointerdown', (e) => moreMenus().forEach(d => { if (!d.contains(e.target) || e.target === d) d.open = false; })); // e.target === d: the dimmed page behind it
document.addEventListener('click', (e) => moreMenus().forEach(d => {
  if (!d.contains(e.target) || e.target === d || e.target.closest('.more-menu a, .share-pills button')) d.open = false;
  if (e.detail === 0 && d.contains(e.target) && e.target.closest('.more-menu a, .share-pills button')) d.querySelector('summary').focus(); // OK on a remote: the focus goes back to More, not lost
}));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') moreMenus().forEach(d => { if (d.open) { d.open = false; d.querySelector('summary').focus(); } }); });
document.querySelectorAll('[data-sub]').forEach(b => b.addEventListener('click', () => go('settings', b.dataset.sub))); // each section has its own address

// Sharing: the system share sheet where there is one, otherwise the clipboard
const appUrl = location.href.split(/[?#]/)[0];
async function share(title, text) {
  try {
    if (navigator.share) return await navigator.share({ title, text, url: appUrl });
    await navigator.clipboard.writeText(`${text}\n${appUrl}`);
    say('Copied. Paste it into a message to share.', null, true);
  } catch (e) {
    if (e.name !== 'AbortError') say('Sharing is blocked in this browser. Copy the page address instead.');
  }
}
// The weather for a prayer's time, for the shared message (none when it has not loaded)
const wxFor = (m) => (weather?.hours?.length ? prayerWeather([...(weather.dayHours || []), ...weather.hours], m) : null);
$('share-day').addEventListener('click', () => share('IqamaHub', shareDayText({
  date: `${today.weekday}, ${MONTHS[today.m - 1]} ${today.d}`, place: place().name,
  iqamaFrom: masjidTimes() && !masjid.failed && day.rows.some(r => r.iqama != null && !r.own) ? masjidName() : '',
  rows: day.rows.map(r => ({ name: NAMES[r.key], adhan: r.adhan, iqama: r.iqama })), khutbah: jumuah(), units: settings.units, wx: wxFor,
})));
$('share-month').addEventListener('click', () => share('IqamaHub', [
  `Prayer times for ${MONTHS[today.m - 1]} ${today.y} (${place().name})`,
  'Day: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha',
  ...monthRows().map(r => `${r.weekday} ${r.d}: ${r.times.map(fmt).join(', ')}`),
].join('\n')));
$('share-app').addEventListener('click', () => share('IqamaHub', 'Your salah companion: adhan and iqama times on any screen.'));
$('share-dua').addEventListener('click', () => $('dk-share').click());
// Opening the share menu: the dua pill only when a dua is showing, the pills rise in, and the plane flies out of its button and back
$('share-menu').addEventListener('toggle', () => {
  const menu = $('share-menu');
  if (!menu.open) return;
  $('share-dua').hidden = $('adhkar').hidden;
  rows(menu.querySelectorAll('.share-pills button:not([hidden])'));
  fly(menu.querySelector('.sh-plane'));
});
// On phones the Share button opens a sheet with the same four choices as rows; wider screens keep the pills
const shsSheet = sheet($('shs'));
$('shs').querySelector('.prs-in').prepend(shsSheet.grab);
$('share-menu').querySelector('summary').addEventListener('click', (e) => {
  if (!matchMedia('(max-width: 48rem)').matches) return;
  e.preventDefault();
  $('shs').querySelector('[data-share="share-dua"]').hidden = $('adhkar').hidden;
  shsSheet.open();
  $('shs').querySelector('[data-share]').focus({ preventScroll: true });
});
$('shs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-share]');
  if (b) $(b.dataset.share).click(); // first, while the tap still counts as one: the system share sheet needs it
  if (b || e.target.closest('[data-close]')) shsSheet.close();
});

// Sound: one shared player for the adhan, alert sounds and previews.
// Browsers only allow sound after the page has been touched in this visit. The first touch unlocks it; until then an
// alert that could not sound shows a "Tap to enable sound" button on the display, and plays when it is tapped.
const audio = new Audio();
audio.preload = 'auto';
let soundLocked = false, pending = null, alertNow = null; // alertNow names the alert that is sounding, for the Stop button
const playing = () => !!audio.src && !audio.paused && !audio.ended;
function syncSound() {
  $('alerts-label').textContent = `Alerts: ${settings.muted ? 'off' : 'on'}`; // only ever on/off; a playing sound has its own Stop button
  $('alerts-toggle').checked = !settings.muted;
  $('dx-sound').hidden = !soundLocked;
  $('sound-lock').hidden = !soundLocked;
  if (!playing() && !pending) alertNow = null;
  const stop = !!alertNow && playing();
  for (const id of ['alert-stop', 'dx-stop']) { $(id).hidden = !stop; if (stop) $(id).querySelector('span').textContent = `Stop ${alertNow}`; }
  document.querySelectorAll('.au-play').forEach(b => { const on = playing() && audio.src === b.dataset.src; b.textContent = on ? 'Stop' : (b.dataset.label || 'Play'); b.classList.toggle('is-on', on); }); // look.css draws ▶ or ■ before the word
}
// The Quran player has its own audio element. It steps aside for any sound played here and comes back when that sound is over.
const quran = initQuran({ say, stopOthers: () => { pending = null; if (playing() && !audio.muted) audio.pause(); } }); // a muted sound is the silent unlock, which must finish
const soundOver = () => { syncSound(); if (!playing()) quran.resume(); };
audio.addEventListener('ended', soundOver);
audio.addEventListener('pause', soundOver);
// shortcut: on touch screens only the end of a tap counts as a user gesture (pointerdown does not), so listen for all of these
const GESTURES = ['pointerup', 'touchend', 'mousedown', 'keydown'];
function markUnlocked() {
  soundLocked = false;
  GESTURES.forEach(g => removeEventListener(g, unlockSound, true));
  syncSound();
}
function unlockSound(e) {
  const late = pending && Date.now() - pending.at < 120000 ? pending : null; // a stale alert is not played late
  const file = late && late.file;
  pending = null;
  const tapped = (sel) => !!(e && e.target.closest && e.target.closest(sel));
  // a tap on a button that starts its own sound unlocks through that sound, so a missed alert does not replay over it
  if (tapped('#dk-listen, .au-play, [data-try]')) return;
  // a Quran button plays on the Quran's own element: the missed alert is dropped, but this element still needs the silent unlock
  if (file && !tapped('[data-q="toggle"], [data-q="prev"], [data-q="next"], [data-q="jump"], [data-act="play"], [data-act="play-all"]')) return play(file, late.label);
  if (playing()) return;
  audio.muted = true; // a silent start that lets later alerts play on their own
  audio.src = SOUND_SRC.beep;
  audio.play().then(() => { if (audio.muted) { audio.pause(); audio.muted = false; } markUnlocked(); }, () => {});
}
GESTURES.forEach(g => addEventListener(g, unlockSound, true));
function play(file, label) {
  audio.pause();
  quran.interrupt();
  if (label) quran.closeDialogs();
  alertNow = label || null;
  audio.muted = false;
  audio.src = SOUND_SRC[file] || (/^https:/.test(file) ? file : `audio/${file}.mp3`);
  audio.addEventListener('playing', syncSound, { once: true });
  const outcome = (r) => { if (label) logAlert({ last: { ...alertLog.last, result: `message shown, ${r}` } }); };
  audio.play().then(() => { markUnlocked(); outcome('sound played'); }, (err) => {
    if (err && err.name === 'AbortError') return; // another sound took over
    if (err && err.name === 'NotAllowedError') {
      soundLocked = true;
      pending = { file, label, at: Date.now() };
      say('Sound is blocked until you tap the page. Tap anywhere to turn it on.');
      outcome('sound blocked until the page is tapped');
      soundOver();
    } else {
      console.warn('IqamaHub: the sound could not play', err);
      say('The sound could not play.');
      outcome('sound could not play');
      soundOver();
    }
  });
}
// Adhkar audio: Hisn al-Muslim records one chapter per set, so this plays the whole chapter, not just the line shown
$('dk-listen').addEventListener('click', () => {
  if (playing()) return audio.pause();
  if (AUDIO[dk.key]) play(AUDIO[dk.key]);
});

// Adhkar tab: every Hisn al-Muslim chapter with its recording, under its category (HISN_CATS, hisn.js). A pill shows
// one category; what is typed in the search box looks through every one. The words count duas, not the book's chapters.
let hisnText = null; // the Hisn al-Muslim text, once loadHisnText has read it
const HISN_BY = new Map(HISN.map(h => [h[0], h]));
if (!['all', ...HISN_CATS.map(c => c[0])].includes(settings.adhkarCat)) settings.adhkarCat = 'all';
$('adhkar-audio').innerHTML = HISN_CATS.map(([key, , heading, chs]) => `<li class="au-cat" data-cat="${key}"><h3>${esc(heading)}<span class="au-cat-n" data-cat-n="${key}"></span></h3></li>`
  + chs.map(id => { const [, title, num] = HISN_BY.get(id); return `<li data-id="${id}" data-cat="${key}" data-t="${title.toLowerCase()} ${id}"><div class="au-row"><button class="au-toggle" type="button" aria-expanded="false" aria-controls="au-body-${id}"><span class="au-no">${id}</span><span class="au-title">${title}<span class="au-done" data-done-for="${id}" hidden></span></span></button><button class="d-btn d-btn-sm d-btn-soft d-btn-primary au-play" type="button" data-src="${hisnUrl(num)}" data-label="Listen" aria-label="Listen to all the duas: ${title}">Listen</button></div><div class="au-body" id="au-body-${id}" hidden></div></li>`; }).join('')).join('');
$('au-cats').innerHTML = [['all', 'All'], ...HISN_CATS.map(c => [c[0], c[1]])].map(([k, label]) => `<button class="d-btn d-btn-sm" type="button" role="tab" data-cat="${k}" aria-controls="adhkar-audio">${esc(label)}</button>`).join('');
const duaCount = (id) => hisnText?.[id]?.items?.length || 0; // known once the text has loaded
const duas = (n) => `${n} ${n === 1 ? 'dua' : 'duas'}`;
function filterAdhkar() {
  const q = $('au-search').value.trim().toLowerCase(), cat = settings.adhkarCat;
  for (const b of $('au-cats').children) b.setAttribute('aria-selected', String(b.dataset.cat === cat));
  let n = 0, rows = 0;
  const shownIn = new Set();
  for (const li of $('adhkar-audio').children) {
    if (li.classList.contains('au-cat')) continue;
    const on = q ? li.dataset.t.includes(q) : cat === 'all' || li.dataset.cat === cat;
    li.hidden = !on;
    if (on) { rows++; n += duaCount(li.dataset.id); shownIn.add(li.dataset.cat); }
  }
  for (const h of $('adhkar-audio').querySelectorAll('.au-cat')) h.hidden = !shownIn.has(h.dataset.cat);
  for (const c of HISN_CATS) { const el = $('adhkar-audio').querySelector(`[data-cat-n="${c[0]}"]`); el.textContent = hisnText ? duas(c[3].reduce((t, id) => t + duaCount(id), 0)) : ''; }
  const c = HISN_CATS.find(x => x[0] === cat);
  $('au-count').textContent = !rows ? 'No duas match.' : !hisnText ? '' : q ? `${duas(n)} match`
    : c ? `${c[2]} · ${duas(n)}` : `All ${duas(n)}, in ${HISN_CATS.length} categories`;
}
// How many of a chapter's duas are done today, beside its title once any are
function chapterDone(id) {
  const el = $('adhkar-audio').querySelector(`[data-done-for="${id}"]`), items = hisnText?.[id]?.items;
  if (!el || !items?.length) return;
  const d = items.filter((it, i) => isDoneKey(`${id}:${i}`, it.n)).length;
  el.hidden = !d;
  el.textContent = d ? `${d} of ${duas(items.length)} done` : '';
}
$('au-cats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  settings.adhkarCat = b.dataset.cat; save();
  if ($('au-search').value) { $('au-search').value = ''; $('au-search').dispatchEvent(new Event('input')); }
  filterAdhkar();
  b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
$('au-search').addEventListener('input', filterAdhkar);
searchBox($('au-search')); // controls.js: behind a round magnifier, like the Quran tab's
filterAdhkar();
// The text is copied from hisnmuslim.com into hisn-text.json by scripts/fetch-hisn.mjs, so it loads from this site
// Light editorial pass on the copied text: no ((double brackets)) around the Arabic, "PBUH" spelled out
// Drops the doubled brackets, expands PBUH, and removes any bracket that never found its partner (the source text has some)
const unpair = (t) => { const open = []; const drop = new Set(); [...t].forEach((c, i) => { if (c === '(') open.push(i); else if (c === ')') { if (open.length) open.pop(); else drop.add(i); } }); open.forEach(i => drop.add(i)); return [...t].filter((_, i) => !drop.has(i)).join(''); };
const unwrap = (t) => { t = t.trim(); if (t[0] !== '(') return t; let depth = 0; for (let i = 0; i < t.length; i++) { if (t[i] === '(') depth++; else if (t[i] === ')' && --depth === 0) { const rest = t.slice(i + 1).trim(); return /^[.!?,;:]*$/.test(rest) ? t.slice(1, i).trim() + rest : rest ? `${t.slice(1, i).trim()} (${rest.replace(/[.\s]+$/, '')})` : t.slice(1, i).trim(); } } return t; }; // "(All praise is for Allah ...)" -> the text without its outer brackets
const tidy = (t) => unwrap(unpair(t.replace(/([.!?])['’]?(?=[a-z][a-z'’-]*(?: [a-z]+){0,2}: )/gi, '$1\n').replace(/\(\(\s*/g, '').replace(/\s*\)\)/g, '').replace(/\bPBUH\b/g, 'peace be upon him')).replace(/([.!?:,])\(/g, '$1 (').replace(/\s{2,}/g, ' ').trim());
async function loadHisnText() {
  if (hisnText) return hisnText;
  const r = await fetch('hisn-text.json');
  if (!r.ok) throw new Error(`hisn-text.json answered ${r.status}`);
  hisnText = (await r.json()).chapters || {};
  for (const c of Object.values(hisnText)) for (const it of c.items || []) for (const k of ['ar', 'en', 'tr']) if (typeof it[k] === 'string') it[k] = tidy(it[k]);
  // the source writes the letter ʿayn as "AA" in its transliteration ("AAafwa"); show the proper mark ("ʿafwa")
  for (const c of Object.values(hisnText)) for (const it of c.items || []) if (typeof it.tr === 'string') it.tr = it.tr.replace(/AA/g, 'ʿ');
  filterAdhkar(); // the counts are in duas, known now
  HISN.forEach(([id]) => chapterDone(id));
  return hisnText;
}
// Every dua gets Full view (counter.js); one that repeats also gets the ring beside its Play button. The chapter is
// the full view's group, for Previous dua and Next dua.
const hisnItems = (items, ch, title) => {
  setGroup(`ch${ch}`, title, items.map((it, i) => ({ key: `${ch}:${i}`, n: it.n || 0, ar: it.ar, tr: it.tr, en: it.en })));
  return items.map((it, i) => `<article class="au-dua"><div class="au-meta"><span>Dua ${i + 1} of ${items.length}</span>${it.n ? `<span>Read ${it.n} ${it.n === 1 ? 'time' : 'times'}</span>` : ''}</div>`
  + `${it.ar ? `<p class="au-ar" lang="ar" dir="rtl">${esc(it.ar)}</p>` : ''}${it.tr ? `<p class="au-tr">${esc(it.tr)}</p>` : ''}${it.en ? `<p class="au-en">${esc(it.en)}</p>` : ''}`
  + `<div class="au-acts">${it.audio ? `<button class="d-btn d-btn-sm d-btn-soft d-btn-primary au-play" type="button" data-src="${esc(it.audio)}" aria-label="Play dua ${i + 1}">Play</button>` : ''}`
  + `${counterHtml(`${ch}:${i}`, it.n || 0, `ch${ch}`, i)}</div></article>`).join('');
};
function openChapter(li, btn) {
  const body = li.querySelector('.au-body'), open = btn.getAttribute('aria-expanded') !== 'true';
  btn.setAttribute('aria-expanded', String(open));
  body.hidden = !open;
  if (!open || body.dataset.done) return;
  body.innerHTML = '<p class="iq-note">Loading…</p>';
  loadHisnText().then(all => {
    const items = all[li.dataset.id]?.items || [];
    body.innerHTML = items.length ? hisnItems(items, li.dataset.id, HISN_BY.get(Number(li.dataset.id))?.[1] || '') : '<p class="iq-note">There are no duas here yet.</p>';
    body.dataset.done = '1';
    items.forEach((it, i) => paintCount(`${li.dataset.id}:${i}`));
    chapterDone(li.dataset.id);
  }).catch((e) => {
    console.warn('IqamaHub: adhkar text failed', e);
    body.innerHTML = '<p class="iq-note">The text is not available yet. The recording still plays.</p>';
  });
}
$('adhkar-audio').addEventListener('click', (e) => {
  const t = e.target.closest('.au-toggle');
  if (t) return openChapter(t.closest('li'), t);
  const b = e.target.closest('.au-play');
  if (!b) return;
  if (playing() && audio.src === b.dataset.src) return audio.pause();
  play(b.dataset.src);
});

for (const id of ['alert-stop', 'dx-stop']) $(id).addEventListener('click', () => { const sample = / sample$/.test(alertNow || ''); audio.pause(); say(sample ? 'Sample stopped.' : 'Alert stopped. Your alert settings are unchanged.'); });
$('alerts-toggle').addEventListener('click', () => {
  settings.muted = !settings.muted;
  save();
  syncSound();
  say(settings.muted ? 'All alerts are off. Your settings for each prayer are kept.' : 'Alerts are on. Set them for each prayer under Settings, Adhan and alerts.');
});

const fillSelect = (id, map, value) => { $(id).innerHTML = Object.entries(map).map(([k, v]) => `<option value="${k}">${v}</option>`).join(''); $(id).value = value; };
fillSelect('adhan', ADHANS, settings.adhan);
fillSelect('fajr-adhan', FAJR_ADHANS, settings.fajrAdhan);
$('adhan').addEventListener('change', () => { settings.adhan = $('adhan').value; save(); });
$('fajr-adhan').addEventListener('change', () => { settings.fajrAdhan = $('fajr-adhan').value; save(); });
document.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => {
  if (playing()) return audio.pause();
  const t = b.dataset.try;
  play(t === 'adhan' ? settings.adhan : t === 'fajr-adhan' ? settings.fajrAdhan : t);
  alertNow = `${b.textContent.trim()} sample`; // shows the same Stop button an alert gets (not passed to play(), which would log it as an alert)
}));

// Alert cards, one per prayer plus Jumu'ah
const soundOptions = (sel) => {
  const opts = (map) => Object.keys(map).map(t => `<option value="${t}"${t === sel ? ' selected' : ''}>${map === SOUNDS ? SOUNDS[t] : RECORDINGS[t]}</option>`).join('');
  return `${opts(SOUNDS)}<optgroup label="A named adhan recording">${opts(RECORDINGS)}</optgroup>`;
};
// Khutbah times typed in under Jumu'ah alerts: one time input per khutbah (a blank one when none is set yet)
const khutbahRows = (times) => (times.length ? times : ['']).map((t, i) => `<span class="al-time"><input class="d-input d-input-sm" type="time" id="al-jumuah-time-${i}" data-k="jumuah" data-jt aria-label="Khutbah ${i + 1} time" value="${t ? t.padStart(5, '0') : ''}">`
  + `<button class="d-btn d-btn-sm d-btn-ghost" type="button" data-rm-khutbah aria-label="Remove khutbah ${i + 1}">Remove</button></span>`).join('');
function alertCard(k) {
  const a = settings.alerts[k], id = (part) => `al-${k}-${part}`, name = k === 'jumuah' ? 'Jumu’ah' : NAMES[k];
  // each step has its own switch and its own sound; the two "before" steps also have minutes
  const step = (part, label) => `<div class="al-row" data-part="${part}"><input class="tick" type="checkbox" id="${id(`${part}-on`)}" data-k="${k}" aria-label="${name}, ${label.toLowerCase()} alert"${a[part].on ? ' checked' : ''}>`
    + `<label for="${id(`${part}-type`)}">${label}</label><select class="d-select d-select-sm" id="${id(`${part}-type`)}" data-k="${k}" aria-label="${name}, ${label.toLowerCase()}, sound">${soundOptions(a[part].type)}</select>`
    + (part === 'adhan' ? '' : `<span class="al-min"><input class="d-input d-input-sm" type="number" id="${id(`${part}-min`)}" data-k="${k}" min="1" max="60" step="1" inputmode="numeric" value="${a[part].min}" aria-label="${name}, ${label.toLowerCase()}, minutes"><span>min</span></span>`)
    + '</div>';
  const body = k === 'jumuah'
    ? `${step('before', 'Before khutbah')}<div class="al-row al-times"><label for="al-jumuah-time-0">Khutbah times</label><span class="al-time-list" id="al-jumuah-times">${khutbahRows(a.times)}</span></div>`
      + `<div class="al-row"><button class="d-btn d-btn-sm d-btn-ghost" type="button" data-add-khutbah>Add another khutbah</button></div><p class="al-note" id="al-jumuah-note"></p>`
    : `${step('adhan', 'At adhan')}${step('before', 'Before adhan')}${step('iqama', 'Before iqama')}<button class="d-btn d-btn-sm d-btn-ghost al-copy" type="button" data-copy="${k}">Use for all prayers</button>`;
  return `<div class="al-card d-collapse d-collapse-arrow" id="${id('card')}"><input type="checkbox" class="al-open" aria-label="Show ${name} settings">`
    + `<div class="d-collapse-title al-title"><input class="d-toggle d-toggle-success d-toggle-sm" type="checkbox" role="switch" id="${id('on')}" data-k="${k}" aria-label="${name} alerts"${a.on ? ' checked' : ''}><span class="al-name">${name}</span><span class="al-sum" id="${id('sum')}">${alertSummary(k, a)}</span></div>`
    + `<div class="d-collapse-content al-body">${body}</div></div>`;
}
// A short line that sums up a card, so it is readable while folded
function alertSummary(k, a) {
  if (!a.on) return 'Off';
  const parts = k !== 'jumuah' && a.adhan.on ? [soundName(a.adhan.type)] : [];
  if (a.before.on) parts.push(`${a.before.min} min before ${k === 'jumuah' ? 'khutbah' : 'adhan'}`);
  if (k !== 'jumuah' && a.iqama.on) parts.push(`${a.iqama.min} min before iqama`);
  return parts.join(', ') || 'No alerts';
}
function syncCard(k) {
  const a = settings.alerts[k], card = $(`al-${k}-card`);
  card.classList.toggle('is-off', !a.on);
  card.querySelectorAll('.al-body select, .al-body input, .al-body button').forEach(el => {
    const part = el.closest('[data-part]')?.dataset.part; // a step that is switched off keeps its switch live and greys the rest of its row
    el.disabled = !a.on || (!!part && !a[part].on && el.type !== 'checkbox');
  });
  $(`al-${k}-sum`).textContent = alertSummary(k, a);
}
function buildAlerts() { $('alert-cards').innerHTML = ALERT_KEYS.map(alertCard).join(''); $('alert-cards').querySelectorAll('input[type="number"]').forEach(stepper); ALERT_KEYS.forEach(syncCard); jumuahNote(); }
function jumuahNote() {
  const el = $('al-jumuah-note');
  if (!el) return;
  const own = ownKhutbahs(), iscj = jumuahMins(), list = (m) => (m.length > 1 ? `${m.slice(0, -1).map(fmt).join(', ')} and ${fmt(m[m.length - 1])}` : fmt(m[0]));
  el.textContent = own.length > 1 ? `Fridays, before each khutbah: ${list(own)}.`
    : own.length ? `Fridays, before your khutbah time of ${fmt(own[0])}.`
    : iscj.length ? `Uses ${masjidName()}’s khutbahs, ${list(iscj)}, unless you set your own times.` : 'Set your khutbah times to get this alert.';
}
$('alert-cards').addEventListener('change', (e) => {
  const k = e.target.dataset.k;
  if (!k) return;
  const v = (part) => $(`al-${k}-${part}`), a = settings.alerts[k];
  const mins = (part, old) => { const n = Math.round(+v(part).value); if (n >= 1 && n <= 60) return n; say('Alert minutes must be between 1 and 60.'); v(part).value = old; return old; };
  a.on = v('on').checked;
  const step = (part) => ({ on: v(`${part}-on`).checked, type: v(`${part}-type`).value, ...(part === 'adhan' ? {} : { min: mins(`${part}-min`, a[part].min) }) });
  a.before = step('before');
  if (k === 'jumuah') a.times = [...$('al-jumuah-times').querySelectorAll('[data-jt]')].map(i => i.value);
  else { a.adhan = step('adhan'); a.iqama = step('iqama'); }
  settings.alerts[k] = cleanAlert(k, a);
  save();
  syncCard(k);
  jumuahNote();
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (err) {}
});
// Adding shows a blank time to fill in (nothing is saved until it has a time); removing saves at once
function showKhutbahRows(times) { $('al-jumuah-times').innerHTML = khutbahRows(times); syncCard('jumuah'); }
$('alert-cards').addEventListener('click', (e) => {
  const a = settings.alerts.jumuah;
  if (e.target.closest('[data-add-khutbah]')) {
    const have = [...$('al-jumuah-times').querySelectorAll('[data-jt]')].map(i => i.value);
    if (have.length >= 6) return say('Up to six khutbahs.');
    showKhutbahRows([...have.filter(Boolean), '']);
    $('al-jumuah-times').querySelector('.al-time:last-child input').focus();
    return;
  }
  if (e.target.closest('[data-rm-khutbah]')) {
    const row = e.target.closest('.al-time'), inputs = [...$('al-jumuah-times').querySelectorAll('[data-jt]')];
    row.querySelector('input').value = '';
    a.times = cleanKhutbahTimes(inputs.map(i => i.value));
    save();
    showKhutbahRows(a.times);
    jumuahNote();
    return;
  }
  const k = e.target.dataset.copy;
  if (!k) return;
  for (const other of PRAYERS) if (other !== k) settings.alerts[other] = cleanAlert(other, JSON.parse(JSON.stringify(settings.alerts[k])));
  save();
  buildAlerts();
  say(`All five prayers now use the ${NAMES[k]} alerts.`);
});

function notify(text) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
  navigator.serviceWorker.ready.then(r => r.showNotification('IqamaHub', { body: text, icon: 'icon-192.png', tag: 'iqama' })).catch(() => {});
}
const MESSAGES = {
  adhan: (n) => `Time for ${n}.`,
  before: (n, m, k, o) => `${n} ${k === 'jumuah' ? `khutbah${o?.of > 1 ? ` ${o.n} of ${o.of}` : ''}` : 'adhan'} in ${m} minutes.`,
  iqama: (n, m) => `${n} iqama in ${m} minutes.`,
};
function fire({ kind, key, type, min, n, of }) {
  wake(); // Black at night: the alert shows its message for 30 s
  const name = key === 'jumuah' ? 'Jumu’ah' : NAMES[key], label = kind === 'adhan' ? `${name} adhan` : `${name} alert`;
  const note = (result) => logAlert({ last: { what: label, when: stamp(), result } });
  if (settings.muted) return note('skipped, alerts are off');
  const text = MESSAGES[kind](name, min, key, { n, of });
  say(text);
  if (document.hidden) notify(text);
  note('message shown'); // play() adds what became of the sound
  // a recording takes over whatever is playing; a short sound waits its turn rather than cut an adhan off
  if (type === 'adhan') play(key === 'fajr' ? settings.fajrAdhan : settings.adhan, label);
  else if (RECORDINGS[type]) play(type, label);
  else if (type === 'beep' || type === 'bismillah') { if (!playing()) play(type, label); else note('message shown, sound skipped because another sound was playing'); }
}

// Your own iqama times; the first choice is the nearby masjid's time, and "Not set" away from every masjid on the list
function buildForm() {
  const nearby = near();
  $('iqama-note').textContent = nearby
    ? `Each prayer can follow ${masjidName()}, a fixed time, or a number of minutes after adhan. Your choices stay on this device.`
    : `No masjid timetable within ${NEAR_MILES} miles of here, so set your masjid’s iqama times: a fixed time or a number of minutes after adhan. Your choices stay on this device.`;
  $('iqama-form').innerHTML = PRAYERS.map(k => `
    <div class="iq-rule">
      <label for="mode-${k}">${NAMES[k]}</label>
      <select class="d-select d-select-sm" id="mode-${k}" data-k="${k}">
        <option value="masjid">${nearby ? `${masjidName()} time` : 'Not set'}</option><option value="time">Fixed time</option><option value="offset">Minutes after adhan</option>
      </select>
      <input class="d-input d-input-sm" type="time" id="time-${k}" data-k="${k}" aria-label="${NAMES[k]} iqama time" hidden>
      <input class="d-input d-input-sm" type="number" id="offset-${k}" data-k="${k}" min="0" max="180" step="1" inputmode="numeric" aria-label="${NAMES[k]} iqama, minutes after adhan" hidden>
    </div>`).join('') + `
    <div class="iq-rule iq-rule-def">
      <label for="def-mode">No time known</label>
      <select class="d-select d-select-sm" id="def-mode"><option value="off">Leave as not set</option><option value="on">Minutes after adhan, labelled default</option></select>
      <input class="d-input d-input-sm" type="number" id="def-min" min="0" max="60" step="1" inputmode="numeric" aria-label="Default iqama, minutes after adhan" hidden>
    </div>
    <p class="iq-note">For a prayer with no iqama time above: leave it empty, or show a time a set number of minutes after the adhan, marked “default”.</p>
    <button class="d-btn d-btn-sm" type="button" id="iqama-reset">${nearby ? `Use ${masjidName()} times for all` : 'Clear all'}</button>`;
  $('iqama-reset').addEventListener('click', () => { settings.iqama = {}; save(); fillForm(); loadDay(today); });
  $('iqama-form').querySelectorAll('input[type="number"]').forEach(stepper);
  fillForm();
}
function fillForm() {
  $('def-mode').value = settings.defIqama == null ? 'off' : 'on';
  $('def-min').hidden = settings.defIqama == null;
  $('def-min').value = settings.defIqama ?? 10;
  for (const k of PRAYERS) {
    const rule = settings.iqama[k], mode = rule == null ? 'masjid' : rule[0] === '+' ? 'offset' : 'time';
    $(`mode-${k}`).value = mode;
    $(`time-${k}`).hidden = mode !== 'time';
    $(`offset-${k}`).hidden = mode !== 'offset';
    if (mode === 'time') $(`time-${k}`).value = rule.padStart(5, '0');
    if (mode === 'offset') $(`offset-${k}`).value = rule.slice(1);
  }
}
$('iqama-form').addEventListener('submit', (e) => e.preventDefault()); // Enter in a field must not reload the page
$('iqama-form').addEventListener('change', (e) => {
  if (e.target.id === 'def-mode' || e.target.id === 'def-min') {
    const n = Math.round(+$('def-min').value);
    settings.defIqama = $('def-mode').value === 'off' ? null : n >= 0 && n <= 60 ? n : 10;
    save(); fillForm(); loadDay(today);
    return;
  }
  const k = e.target.dataset.k;
  if (!k) return;
  const mode = $(`mode-${k}`).value, row = day.rows.find(r => r.key === k);
  if (mode === 'masjid') delete settings.iqama[k];
  else if (mode === 'time') {
    // start from the time already showing, so switching modes never blanks the row
    const base = row.iqama ?? row.adhan + 15;
    const v = e.target.type === 'time' ? e.target.value : `${String(Math.floor(base / 60) % 24).padStart(2, '0')}:${String(base % 60).padStart(2, '0')}`;
    if (parseHM(v) == null) return;
    settings.iqama[k] = v;
  } else {
    const n = e.target.type === 'number' ? Math.round(+e.target.value) : 15;
    if (!(n >= 0 && n <= 180)) return say('Minutes after adhan must be between 0 and 180.');
    settings.iqama[k] = `+${n}`;
  }
  save();
  fillForm();
  loadDay(today);
});

// Location
function setPlace(pl) {
  settings.place = pl;
  settings.asked = true;
  save();
  showAsk();
  $('results').replaceChildren();
  today = null;
  lastSec = null;
  buildForm();
  tick();
  sync(false, true); // the weather here, and the timetable of a masjid that is now near
  const needIqama = !near() && !Object.keys(settings.iqama).length;
  if (needIqama) go('settings', 'iqama');
  say(`Times are now for ${place().name}.${needIqama ? ' Set your masjid’s iqama times here.' : ''}`, null, true);
}
function locateMe() {
  if (!navigator.geolocation) return say('This browser cannot share a location. Search for your city instead.');
  navigator.geolocation.getCurrentPosition(
    (pos) => setPlace({ lat: +pos.coords.latitude.toFixed(3), lng: +pos.coords.longitude.toFixed(3), zone: DEVICE_ZONE, name: 'Your location' }),
    () => say('Location was not shared, so nothing changed. Search for your city instead.'));
}
const openLocation = () => { go('settings', 'location'); $('search').focus(); };
$('use-here').addEventListener('click', locateMe);
$('ask-here').addEventListener('click', locateMe);
// Use my approximate location: the same rough guess a new device starts with, taken as chosen
$('use-approx').addEventListener('click', async () => {
  say('Finding your approximate location…');
  const pl = await approxPlace();
  if (!pl) return say('Could not tell where this connection is. Search for your city or use your location instead.');
  delete pl.approx;
  setPlace(pl);
});
$('tour-again').addEventListener('click', () => { go('today'); setTimeout(runTour, 400); });
$('ask-keep').addEventListener('click', () => { if (settings.place) delete settings.place.approx; settings.asked = true; save(); showAsk(); });
$('ask-search').addEventListener('click', openLocation);
$('change-place').addEventListener('click', openLocation);
// The banner on Today: confirm an approximate place, offer to change a place nobody has chosen, or ask for one when there is none.
// With no place at all, the times stay hidden (data-noplace) and no alert sounds until one is set.
function showAsk() {
  const pl = settings.place;
  root.toggleAttribute('data-noplace', !pl);
  $('ask').hidden = settings.asked && !!pl;
  $('ask-keep').hidden = !pl;
  $('ask-text').textContent = !pl ? 'Set your location to see the prayer times for where you are.'
    : pl.approx ? `Times for ${pl.name}, from your internet connection. Is that right?`
    : `Times for ${pl.name}. Somewhere else? Set your location for your own adhan times.`;
}
showAsk();

$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('search').value.trim(), list = $('results');
  list.replaceChildren();
  if (q.length < 2) return say('Type at least two letters of a city name.');
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(r.status);
    const hits = ((await r.json()).results || []).filter(h => Number.isFinite(h.latitude) && Number.isFinite(h.longitude) && typeof h.name === 'string');
    if (!hits.length) return say(`No places found for “${q}”. Try a nearby larger town.`);
    say('');
    for (const h of hits) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'd-btn d-btn-sm';
      b.textContent = [h.name, h.admin1, h.country].filter(v => typeof v === 'string' && v).join(', ');
      b.addEventListener('click', () => setPlace({
        lat: +h.latitude.toFixed(3), lng: +h.longitude.toFixed(3),
        zone: validZone(h.timezone) ? h.timezone : DEVICE_ZONE,
        name: [h.name, typeof h.admin1 === 'string' ? h.admin1 : h.country].filter(Boolean).join(', ').slice(0, 80),
      }));
      const li = document.createElement('li');
      li.append(b);
      list.append(li);
    }
  } catch (err) {
    say('Could not search places. Check your connection and try again.');
  }
});

// Calculation method
fillSelect('method', Object.fromEntries(Object.entries(CalculationMethods).map(([id, m]) => [id, m.name])), settings.method);
$('asr').value = settings.asr === 'Hanafi' ? 'Hanafi' : 'Standard';
const recalc = () => { save(); today = null; tick(); };
$('method').addEventListener('change', () => { settings.method = $('method').value; recalc(); });
$('asr').addEventListener('change', () => { settings.asr = $('asr').value; recalc(); });
// Adhan time offsets and the Hijri day shift
// Each prayer: − and + round its minutes (controls.js stepper; the number can still be typed)
$('tune-form').innerHTML = PRAYERS.map(k => `<div class="tune-row"><span id="tune-${k}">${NAMES[k]}</span>`
  + `<input class="d-input d-input-sm" type="number" inputmode="numeric" min="-30" max="30" step="1" data-k="${k}" value="${settings.tune[k]}" aria-label="${NAMES[k]} adhan, minutes earlier or later">`
  + '<small>min</small></div>').join('');
$('tune-form').querySelectorAll('input').forEach(stepper);
$('tune-form').addEventListener('submit', (e) => e.preventDefault());
$('tune-form').addEventListener('change', (e) => {
  const k = e.target.dataset.k, v = Math.round(+e.target.value);
  if (!k) return;
  settings.tune = cleanTune({ ...settings.tune, [k]: Number.isFinite(v) ? Math.max(-30, Math.min(30, v)) : 0 });
  e.target.value = settings.tune[k];
  recalc();
});
$('tune-reset').addEventListener('click', () => { settings.tune = cleanTune({}); $('tune-form').querySelectorAll('input').forEach(i => { i.value = 0; }); recalc(); });
$('hijri-shift').value = String(settings.hijriShift);
$('hijri-shift').addEventListener('change', () => { settings.hijriShift = +$('hijri-shift').value; recalc(); });
$('set-hijri-maghrib').checked = settings.hijriMaghrib;
$('set-hijri-maghrib').addEventListener('change', () => { settings.hijriMaghrib = $('set-hijri-maghrib').checked; recalc(); });

// Clock style and theme
// decorative swatches: the theme's dark paper beside its accent
const SWATCH = { paper: ['#F3EDE1', '#A8321F'], eink: ['#F4F2EC', '#4A4A4A'], hand: ['#F6F1E4', '#24345C'], contrast: ['#FFFFFF', '#000000'] };
// small line drawings of the six clock styles for the picker (decorative: the names are the labels)
const T = (body) => `<svg viewBox="0 0 64 40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">${body}</svg>`;
const CK_THUMB = {
  board: T('<path d="M4 6h56M4 34h56M4 22h56" stroke-width="1"/><path d="M6 10h20M38 10h16M38 15h10"/><path d="M8 26h8M22 26h8M36 26h8M50 26h8" stroke-width="2.2"/>'),
  dial: T('<circle cx="32" cy="20" r="15"/><path d="M32 5v4M47 20h-4M32 35v-4M17 20h4"/><path d="M32 20l7-5" stroke-width="2"/>'),
  analog: T('<circle cx="32" cy="20" r="15"/><path d="M32 20V10M32 20l8 4" stroke-width="2"/>'),
  sun: T('<path d="M6 32h52"/><path d="M10 32a22 22 0 0 1 44 0"/><circle cx="40" cy="14" r="3" fill="currentColor"/>'),
  timeline: T('<path d="M16 5v30"/><circle cx="16" cy="9" r="2"/><circle cx="16" cy="20" r="2"/><circle cx="16" cy="31" r="2"/><path d="M24 9h24M24 20h18M24 31h22"/>'),
  bedside: T('<path d="M12 12h8M26 12h8M42 12h8" stroke-width="3"/><path d="M12 28h40" stroke-width="1"/>'),
};
function fillPicker(id, map, current, label, onPick) {
  const box = $(id);
  box.innerHTML = Object.entries(map).map(([k, name]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === current}" ${label(k, name)}</button>`).join('');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    box.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', x === b));
    onPick(b.dataset.v);
  });
}
fillPicker('clock-style', CLOCKS, settings.clock, (k, name) => `class="ck-opt">${CK_THUMB[k] || ''}<span>${name}</span>`, (v) => { settings.clock = v; save(); applyLook(); tick(); });
fillPicker('palette', LOOKS, settings.look, (k, name) => `class="swatch" style="--a:${SWATCH[k][0]};--b:${SWATCH[k][1]}" aria-label="${name}"><i class="sw-chip"></i><span>${name}</span>`, (v) => { settings.look = v; save(); applyLook(); $('bg-group').hidden = v !== 'paper'; $('look-name').textContent = LOOKS[v]; });
$('look-name').textContent = LOOKS[settings.look];
// Brightness: the button in the top bar and in full screen steps through the four levels; Settings has the sliders and Auto
function syncDim() {
  const dim = Number(root.dataset.dim) || 0, name = DIM_NAMES[dim];
  for (const id of ['dim-btn', 'dx-dim']) {
    const b = $(id);
    if (!b) continue;
    b.querySelector('.dim-label').textContent = `Brightness: ${name}`;
    b.dataset.level = String(dim);
    b.setAttribute('aria-label', `Brightness: ${name}. Tap for ${DIM_NAMES[(dim + 1) % 4].toLowerCase()}`);
  }
  if (!$('set-dim')) return;
  const same = settings.autoDim === 'off', start = settings.nightStart === 'maghrib' ? 'Maghrib' : 'Isha';
  $('set-dim').value = String(settings.level); $('set-dim-out').textContent = DIM_NAMES[settings.level]; $('set-dim').setAttribute('aria-valuetext', DIM_NAMES[settings.level]); $('set-dim').dispatchEvent(new Event('change')); // the fill and its label follow
  $('set-night').value = same ? 'same' : String(settings.nightLevel);
  document.querySelectorAll('input[name="nightstart"]').forEach(r => { r.checked = r.value === settings.nightStart; });
  $('night-row').hidden = same;
  const day = DIM_NAMES[settings.level], nightName = DIM_NAMES[settings.nightLevel].toLowerCase();
  $('dim-note').textContent = (same ? `${day} all the time.` : `${day} from sunrise; ${settings.nightLevel === 4 ? 'black, with no light,' : nightName} from ${start} until sunrise.`)
    + (settings.nightLevel === 4 && !same ? ' A tap shows the times for 30 seconds.' : '')
    + (dimOverride ? ' The Brightness button’s change holds until the next switch.' : '');
}
for (const id of ['dim-btn', 'dx-dim']) $(id)?.addEventListener('click', () => setDim(((Number(root.dataset.dim) || 0) + 1) % 4));
// Settings: By day (the day's level), At night (Same as day, Soft, Dim, Darkest or Black) and Night starts (Maghrib or Isha)
$('set-dim').addEventListener('input', () => { settings.level = +$('set-dim').value; save(); if (dimOverride && !dimOverride.night) dimOverride = null; applyLook(); });
$('set-night').addEventListener('change', () => {
  const v = $('set-night').value;
  if (v === 'same') settings.autoDim = 'off';
  else { settings.nightLevel = +v; settings.autoDim = settings.nightStart; }
  dimOverride = null; save(); applyLook();
});
document.querySelectorAll('input[name="nightstart"]').forEach(r => r.addEventListener('change', () => {
  settings.nightStart = r.value;
  if (settings.autoDim !== 'off') settings.autoDim = r.value;
  dimOverride = null; save(); applyLook();
}));
// The black cover: a tap or key on it only wakes the times (the same tap never reaches a button below); any other
// touch or key while the times show keeps them up for another 30 s
// (caught at the window, as full screen draws its own copy of the cover, above everything)
let wakeTap = false;
addEventListener('pointerdown', (e) => { wakeTap = root.dataset.black === '1'; if (wakeTap) { e.preventDefault(); e.stopPropagation(); } else wakeUntil = Date.now() + WAKE_MS; }, true);
addEventListener('pointerup', (e) => { if (wakeTap) { e.preventDefault(); e.stopPropagation(); } }, true);
addEventListener('click', (e) => { if (wakeTap || root.dataset.black === '1') { e.preventDefault(); e.stopPropagation(); wakeTap = false; wake(); } }, true);
addEventListener('keydown', (e) => { if (root.dataset.black === '1') { e.preventDefault(); e.stopPropagation(); wake(); } else wakeUntil = Date.now() + WAKE_MS; }, true);
syncDim();

// The mark follows the countdown to the next prayer, as the bar under it does: the ring in the side bar, the browser tab's
// icon (redrawn as an SVG only when the ring moves a whole percent) and the tab's title ("Isha in 12 min · IqamaHub").
// Browsers that cannot show an SVG icon keep favicon-32.png.
const FAV_LINK = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
const favSvg = (pct) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#F3EDE1"/>'
  + '<circle cx="16" cy="16" r="10.5" fill="none" stroke="#CFC4AE" stroke-width="4"/>'
  + `<circle cx="16" cy="16" r="10.5" fill="none" stroke="#1B6B52" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 16 16)"/>`
  + '<path d="M12.5 22V16.5C12.5 14 14 12.6 16 11.5C18 12.6 19.5 14 19.5 16.5V22Z" fill="#1C1914"/></svg>';
// It comes alive only when it matters (styles.css): near (the last 15 minutes before an adhan or iqama, as the countdown's
// highlight), arrived (the event just came: the ring closes and the dot pops for a moment), and a sweep when the screen is
// opened or touched after a quiet minute. Otherwise it only fills.
const MARK = document.querySelector('.brand-link');
let markPct = -1, markTitle = '', markEv = '', markHold = 0, markSwept = 0;
const markTip = (pct) => { const a = pct / 50 * Math.PI; return [16 + 12 * Math.sin(a), 16 - 12 * Math.cos(a)]; };
function markClass(name, ms) { if (!MARK) return; MARK.classList.remove(name); void MARK.offsetWidth; MARK.classList.add(name); setTimeout(() => MARK.classList.remove(name), ms); }
function sweepMark() { if (Date.now() - markSwept < 60e3) return; markSwept = Date.now(); markClass('is-sweep', 1100); }
for (const t of ['pointerdown', 'keydown']) addEventListener(t, sweepMark, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sweepMark(); });
MARK?.addEventListener('click', () => { if (location.hash === '#today') document.querySelector('.view')?.scrollTo({ top: 0, behavior: 'smooth' }); }); // already on Today: back to its top
function paintMark(f, ev, left, rows) {
  const key = `${ev.key}|${ev.kind}|${ev.at}`;
  if (markEv && key !== markEv) { markHold = Date.now() + 2600; markPct = -1; markClass('is-arrived', 2600); } // the last event has just come
  if (!markEv) sweepMark(); // the page has just opened
  markEv = key;
  MARK?.classList.toggle('is-near', left < 900 && ev.key !== 'sunrise' && Date.now() >= markHold);
  const pct = Date.now() < markHold ? 100 : Math.round(f * 100); // held full while the dot pops
  if (pct !== markPct) {
    markPct = pct;
    const [x, y] = markTip(pct);
    document.querySelectorAll('.mk-ring').forEach(el => el.setAttribute('stroke-dashoffset', String(100 - pct)));
    document.querySelectorAll('.mk-tip, .mk-rip').forEach(el => { el.setAttribute('cx', x.toFixed(2)); el.setAttribute('cy', y.toFixed(2)); });
    if (FAV_LINK) FAV_LINK.href = `data:image/svg+xml,${encodeURIComponent(favSvg(pct))}`;
  }
  const mins = Math.max(1, Math.ceil(left / 60)), span = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  const khutbah = ev.kind === 'iqama' && rows.find(r => r.key === ev.key)?.jumuah?.length;
  const name = ev.key === 'sunrise' ? 'Sunrise' : khutbah ? 'Khutbah' : `${NAMES[ev.key]}${ev.kind === 'iqama' ? ' iqama' : ''}`;
  const title = `${name} in ${span} · IqamaHub`;
  if (title !== markTitle) document.title = markTitle = title;
}

// Weather, for the header, the backdrop and the Weather panel; the page works the same without it
let wxReq = 0;
async function loadWeather() {
  if (!placeKnown()) { if (wxLoading) { wxLoading = false; renderWeather(); } return; }
  const { lat, lng } = place(), n = ++wxReq;
  let w = null;
  const warnReq = fetchAlerts(lat, lng); // official warnings, fetched alongside; [] outside the US or on any failure
  try { w = await fetchWeather(lat, lng, settings.units); } catch (e) {}
  const a = await warnReq;
  if (n !== wxReq) return; // a newer request (new place or units) has started; this answer is stale
  const first = wxLoading && !!w;
  weather = w;
  alerts = a;
  wxLoading = false;
  renderWeather();
  if (first) fade($('wx-body')); // the real weather fades in over where the placeholders were
  tick();
}
function prayerMarks() {
  if (!day) return [];
  const nowMin = clock(new Date(), place().zone).sec / 60;
  return day.rows.map((r, i) => (r.adhan >= nowMin ? { name: NAMES[r.key], min: r.adhan, today: true } : { name: NAMES[r.key], min: tomorrow.rows[i].adhan, today: false }));
}
// Under the time in the times-only full screen: temperature, a line about the next two days, then one row of details.
// One line of weather for the full screen sheet: now, today's high and low, and the chance of rain
// The warning line at the top of the sheet: the most serious warning in force, when it ends, and how many more
function warnLine() {
  const [a, ...more] = alerts;
  if (!a) return null;
  return { event: a.event, until: untilText(a.until, new Date(), place().zone), more: more.length, sender: a.sender };
}
// The weather at the next prayer (or sunrise) for the countdown: { name, temp, words, pop } or null
function wxAt(ev, rows) {
  if (!weather || !weather.hours?.length) return null;
  const w = prayerWeather(weather.hours, ev.at);
  if (!w) return null;
  const row = ev.at >= 1440 ? null : rows.find(r => r.key === ev.key);
  return { ...w, name: ev.key === 'sunrise' ? 'sunrise' : row?.jumuah ? 'Jumu’ah' : NAMES[ev.key] };
}
// The weather right now for the block under the clock: { temp, unit, words, hi, lo, pop } or null
function wxNow() {
  const w = weather;
  if (!w || w.temp == null) return null;
  const r = v => (v == null ? null : Math.round(v)), rain = w.today.pop ?? w.pop;
  return { temp: r(w.temp), unit: settings.units, words: w.label ? w.label.toLowerCase() : '', hi: r(w.today.max), lo: r(w.today.min), pop: r(rain) };
}
// What the card in the times-only full screen shows instead of the current prayer: after sunrise until Dhuhr (rest of today or a morning dua)
// and, with duas chosen, from Maghrib until Isha (an evening dua). null keeps the current prayer.
// shortcut: the dua changes every 3 minutes by itself and by one more on each tap on the card.
let duaTap = 0;
function dxCardFor(nowMin) {
  const w = cardWindow(nowMin, day.rows, day.sunrise);
  if (!w) return null;
  if (settings.dxCard === 'duas' && settings.adhkar && SETS[w].items[0].ar) { // the text has loaded
    const set = SETS[w], i = (Math.floor(nowMin / 3) + duaTap) % set.items.length;
    return { kind: 'dua', title: set.title, item: set.items[i], pos: `${i + 1} / ${set.items.length}` };
  }
  return w === 'morning' ? { kind: 'rest' } : null;
}
$('dx-small').addEventListener('click', (e) => { if (e.target.closest('[data-dua]')) { duaTap++; tick(); } });
// Official warnings at the top of the Weather tab: each one's name and end time, opening to the full NWS text
function warningsHtml() {
  if (!alerts.length) return '';
  const now = new Date(), zone = place().zone;
  return `<div class="wx-warns" role="region" aria-label="Weather warnings">${alerts.map(a => `<details class="wx-warn"><summary><b>${esc(a.event)}</b> <span>${esc(untilText(a.until, now, zone))}</span></summary>`
    + `${a.text ? `<p>${esc(a.text)}</p>` : ''}${a.todo ? `<p><b>What to do:</b> ${esc(a.todo)}</p>` : ''}<small>${esc(a.sender)}</small></details>`).join('')}</div>`;
}
// Grey shapes where the weather will be (icon, temperature, two lines, a row of hours), shown only until the first weather arrives
const WX_WAIT = '<div class="wx-skel" aria-hidden="true"><i class="sk-ic"></i><i class="sk-t"></i><i class="sk-l"></i><i class="sk-l sk-s"></i>'
  + '<div class="sk-row"><i></i><i></i><i></i><i></i><i></i><i></i></div></div><p class="iq-note">Loading the weather…</p>';
function renderWeather() {
  const u = settings.units, w = weather;
  $('weather').hidden = !w;
  $('weather').textContent = w ? `${Math.round(w.temp)}°${u}${w.label ? `, ${w.label.toLowerCase()}` : ''}` : '';
  $('wx-body').innerHTML = warningsHtml() + (w ? weatherHtml(w, u, prayerMarks()) : wxLoading ? WX_WAIT : '<p class="iq-note">Weather is not available right now. The page tries again every 15 minutes.</p>');
  $('wx-updated').textContent = w && w.at != null ? `Updated ${fmt(w.at)} local time. Weather and air quality from Open-Meteo.` : '';
  document.querySelectorAll('[data-unit]').forEach(b => b.setAttribute('aria-pressed', b.dataset.unit === u));
}
$('weather').addEventListener('click', () => go('weather'));
// A tap on the weather under the clock on Today opens the Weather tab. The clock is drawn again every second, which can replace the
// pressed element between finger down and up and so swallow a click: the tap is read from the pointer instead. (Keyboards use the Weather tab.)
let wxArmed = false;
$('clock').addEventListener('pointerdown', (e) => { wxArmed = e.target.closest('[data-go]')?.dataset.go || false; }); // the weather line, warnings and the month link
// The board is redrawn every second; a keyboard user on one of its buttons keeps focus on the new copy
function redraw(el, html) {
  const f = document.activeElement, key = f && el.contains(f) ? ['data-fold', 'data-swap', 'data-bell'].find(k => f.hasAttribute(k)) : null;
  el.innerHTML = html;
  fitBoard(el);
  if (key) el.querySelector(key === 'data-bell' ? `[data-bell="${f.dataset.bell}"]` : `[${key}]`)?.focus({ preventScroll: true });
}
// On a short screen (a phone on its side, a small window, a warning line taking room) the clock and the next prayer can
// be taller than their share of the board and run into the timetable. Then the two scale down together (zoom, as the
// full screen view does), in 5% steps to no less than 60%, and grow back once there is room. --fit lives on the
// container, which outlives the redraws; the steps are read and undone before the frame is painted.
function fitBoard(el) {
  const mid = el.querySelector('.sh-mid');
  if (!mid) return;
  const over = () => mid.scrollHeight - mid.clientHeight > 1;
  let fit = +el.style.getPropertyValue('--fit') || 1;
  const set = (v) => { fit = Math.round(v * 100) / 100; el.style.setProperty('--fit', fit); };
  if (over()) { while (over() && fit > 0.6) set(fit - 0.05); return; }
  while (fit < 1) { set(fit + 0.05); if (over()) { set(fit - 0.05); return; } }
}
// The larger number on the board: Automatic is the countdown on smaller screens (phones, 7-inch tablets: under 1280
// by 720) and the clock on bigger screens. The Bigger clock/countdown button swaps it.
const BIG_HOSTS = ['clock', 'dx-clock', 'dx-small'];
const smallBoard = matchMedia('(max-width: 79.99rem), (max-height: 44.99rem)');
const bigAuto = () => (smallBoard.matches ? 'count' : 'time');
const bigNow = () => (settings.big === 'time' || settings.big === 'count' ? settings.big : bigAuto());
function swapBig() {
  const next = bigNow() === 'count' ? 'time' : 'count';
  settings.big = next === bigAuto() ? 'auto' : next; // swapping back to this screen's usual returns to Automatic
  save(); $('set-big').value = settings.big;
  tick();
  if (displayOpen && !timesLayout()) fitDisplay();
  // a quiet cross-fade with a 4px settle, on the container (it outlives the redraws); under reduce motion, the fade only
  for (const id of BIG_HOSTS) if ($(id).offsetParent) animate($(id), { opacity: [0, 1], transform: ['translateY(4px)', 'none'] }, { duration: 0.3, ease: [0.2, 0, 0, 1] }); // transform, not translate: burn-in care owns translate
}
for (const id of BIG_HOSTS) {
  let armed = false;
  $(id).addEventListener('pointerdown', (e) => { armed = !!e.target.closest('[data-swap]'); });
  $(id).addEventListener('pointerup', (e) => { if (armed && e.target.closest('[data-swap]')) swapBig(); armed = false; });
  $(id).addEventListener('click', (e) => { if (e.detail === 0 && e.target.closest('[data-swap]')) swapBig(); });
}
// The Weather tab's sky is a band behind the current weather that scrolls away with it (styles.css reads --sky-y)
// and ends just below it (--wx-band: where the current weather ends, measured as the weather is drawn)
$('tab-weather').addEventListener('scroll', () => root.style.setProperty('--sky-y', `${$('tab-weather').scrollTop}px`), { passive: true });
function wxBand() {
  const nowEl = onWeather() && $('wx-body').querySelector('.wx-now');
  if (!nowEl) return;
  const end = Math.round(nowEl.getBoundingClientRect().bottom + $('tab-weather').scrollTop + 12);
  if (root.style.getPropertyValue('--wx-band') !== `${end}px`) root.style.setProperty('--wx-band', `${end}px`);
}
// The bell beside each prayer on the board: its alerts at a glance; a tap opens that prayer's card under Adhan and alerts
const bellsNow = () => Object.fromEntries(ALERT_KEYS.map(k => [k, bellState(settings.alerts[k], settings.muted, k === 'jumuah')]));
function openAlertCard(k) {
  const card = $(`al-${k}-card`);
  if (card) card.querySelector('.al-open').checked = true;
  // the screen changes with the address (route), so scroll and focus once it is showing
  const show = () => requestAnimationFrame(() => { card?.scrollIntoView({ block: 'start' }); $(`al-${k}-on`)?.focus({ preventScroll: true }); });
  if (location.hash.slice(1) !== 'settings') addEventListener('hashchange', show, { once: true });
  go('settings', 'alerts');
  if (location.hash.slice(1) === 'settings' && !card?.matches(':focus-within')) show();
}

// One prayer's sheet: a tap on its bell or anywhere in its column on Today (OK on the bell with a TV remote).
// Its adhan and iqama times (khutbahs for Jumu'ah), the weather then, its alerts and its adhan offset; the sounds and
// the khutbah times stay under Settings, Adhan and alerts ("More alert settings"). A sheet on phones, a card elsewhere.
const prsSheet = sheet($('prs'));
let prsKey = null, prsAhead = false;
const PRS_PARTS = { adhan: 'At adhan', before: 'Before adhan', iqama: 'Before iqama' };
const wxWords = (w) => (w ? `${Math.round(w.temp)}°${settings.units}${w.words ? `, ${w.words}` : ''}${w.pop != null ? ` (${Math.round(w.pop)}% chance)` : ''}` : '');
function prsTimes(k) {
  const rows = prsAhead ? tomorrow.rows : day.rows, r = rows.find(x => x.key === (k === 'jumuah' ? 'dhuhr' : k));
  if (!r) return '';
  const cell = (label, v) => `<div><dt>${label}</dt><dd>${v}</dd></div>`;
  const iq = r.iqama == null ? 'not set' : r.iqama === r.adhan && !r.def ? 'on time' : `${fmt(r.iqama)}${r.def ? ' (default)' : ''}`;
  const list = k === 'jumuah' ? shownJumuah() : [];
  const times = k === 'jumuah'
    ? cell(list.length > 1 ? 'Khutbahs' : 'Khutbah', list.length ? list.map(fmt).join('<br>') : 'not set')
    : cell('Adhan', fmt(r.adhan)) + cell('Iqama', iq);
  const w = wxFor(r.adhan + (prsAhead ? 1440 : 0));
  return `<dl class="prs-times">${times}</dl>${w ? `<p class="prs-wx">Weather at ${k === 'jumuah' ? 'Dhuhr' : 'adhan'}: ${wxWords(w)}</p>` : ''}`;
}
function prsBody(k) {
  const a = settings.alerts[k], name = k === 'jumuah' ? 'Jumu’ah' : NAMES[k];
  const step = (part, label) => `<div class="al-row prs-row" data-part="${part}"><input class="tick" type="checkbox" id="prs-${part}-on" data-f="${part}-on"${a[part].on ? ' checked' : ''}>`
    + `<label for="prs-${part}-on">${label}</label>`
    + (part === 'adhan' ? `<small class="prs-snd">${soundName(a.adhan.type)}</small>` : `<span class="al-min"><input class="d-input d-input-sm" type="number" data-f="${part}-min" min="1" max="60" step="1" inputmode="numeric" value="${a[part].min}" aria-label="${name}, ${label.toLowerCase()}, minutes"><small>min</small></span>`)
    + '</div>';
  const steps = k === 'jumuah' ? step('before', 'Before khutbah') : Object.entries(PRS_PARTS).map(([p, l]) => step(p, l)).join('');
  const tune = k === 'jumuah' ? '' : `<div class="prs-sec" role="group" aria-labelledby="prs-tune-h"><h3 class="iq-label" id="prs-tune-h">Adhan time</h3>`
    + `<div class="al-row prs-row"><label for="prs-tune">Earlier or later</label><input class="d-input d-input-sm" type="number" id="prs-tune" data-f="tune" min="-30" max="30" step="1" inputmode="numeric" value="${settings.tune[k]}" aria-label="${name} adhan, minutes earlier or later"><small>min</small></div>`
    + '<p class="prs-note">Moves this prayer’s adhan on this screen, if your masjid calls it at a different time.</p></div>';
  return `<header class="prs-head"><h2 id="prs-title">${name} <span class="prs-ar" lang="ar">${k === 'jumuah' ? AR_JUM : AR[k]}</span></h2>${prsAhead ? '<p class="prs-day">Tomorrow</p>' : ''}</header>`
    + `<div id="prs-when">${prsTimes(k)}</div>`
    + `<div class="prs-sec" role="group" aria-labelledby="prs-al-h"><div class="prs-al"><h3 class="iq-label" id="prs-al-h">Alerts</h3><input class="d-toggle d-toggle-success" type="checkbox" role="switch" id="prs-on" data-f="on" aria-label="${name} alerts"${a.on ? ' checked' : ''}></div>${steps}</div>`
    + tune
    + `<div class="prs-foot"><button class="d-btn d-btn-sm d-btn-ghost" type="button" data-more>More alert settings</button><button class="d-btn d-btn-sm" type="button" data-close>Done</button></div>`;
}
function prsSync() {
  const k = prsKey, a = settings.alerts[k], box = $('prs-in');
  box.querySelectorAll('[data-part] input').forEach(el => {
    const part = el.closest('[data-part]').dataset.part;
    el.disabled = !a.on || (el.type !== 'checkbox' && !a[part].on);
  });
  box.querySelectorAll('[data-part] .stp-btn').forEach(b => { b.disabled = b.parentElement.querySelector('input').disabled; });
  box.classList.toggle('is-off', !a.on);
}
function openPrayer(k) {
  if (!ALERT_KEYS.includes(k)) return;
  prsKey = k; prsAhead = ahead;
  const box = $('prs-in');
  box.innerHTML = prsBody(k);
  box.prepend(prsSheet.grab);
  box.querySelectorAll('input[type="number"]').forEach(stepper);
  prsSync();
  prsSheet.open();
  $('prs-on').focus({ preventScroll: true });
}
$('prs-in').addEventListener('change', (e) => {
  const f = e.target.dataset.f, k = prsKey;
  if (!f || !k) return;
  if (f === 'tune') {
    const v = Math.round(+e.target.value);
    settings.tune = cleanTune({ ...settings.tune, [k]: Number.isFinite(v) ? Math.max(-30, Math.min(30, v)) : 0 });
    e.target.value = settings.tune[k];
    const other = $('tune-form').querySelector(`[data-k="${k}"]`);
    if (other) other.value = settings.tune[k];
    recalc();
    $('prs-when').innerHTML = prsTimes(k);
    return;
  }
  const a = JSON.parse(JSON.stringify(settings.alerts[k])), [part, what] = f.split('-');
  if (f === 'on') a.on = e.target.checked;
  else if (what === 'on') a[part].on = e.target.checked;
  else {
    const n = Math.round(+e.target.value);
    if (n >= 1 && n <= 60) a[part].min = n;
    else { say('Alert minutes must be between 1 and 60.'); e.target.value = a[part].min; }
  }
  settings.alerts[k] = cleanAlert(k, a);
  save();
  buildAlerts(); // Settings, Adhan and alerts shows the same
  prsSync();
  tick(); // the bell on the board
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (err) {}
});
$('prs-in').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) return prsSheet.close();
  if (!e.target.closest('[data-more]')) return;
  // the sheet's history step goes back first, then Settings opens on top of Today
  const k = prsKey;
  prsNext = () => openAlertCard(k);
  prsSheet.close();
});
// Once the sheet and its history step have gone (popstate, or a moment when there was none): Settings for "More alert
// settings", otherwise back to the bell it came from (the board is redrawn every second, so the old button is gone)
let prsNext = null;
$('prs').addEventListener('close', () => {
  const k = prsKey, next = prsNext;
  prsNext = null;
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true; removeEventListener('popstate', run);
    requestAnimationFrame(() => (next ? next() : $('clock').querySelector(`[data-bell="${k}"]`)?.focus({ preventScroll: true })));
  };
  addEventListener('popstate', run);
  setTimeout(run, 400);
});
// Read from the pointer (pointerdown and pointerup on the same prayer: the cell is redrawn between them), and from OK or Enter on the bell (detail 0)
let prArmed = null;
const prOf = (e) => { const el = e.target.closest('[data-bell], [data-pr]'); return el ? el.dataset.bell || el.dataset.pr : null; };
$('clock').addEventListener('pointerdown', (e) => { prArmed = e.button > 0 ? null : prOf(e); });
$('clock').addEventListener('pointerup', (e) => { const k = prOf(e); if (k && k === prArmed) openPrayer(k); prArmed = null; });
$('clock').addEventListener('pointercancel', () => { prArmed = null; });
$('clock').addEventListener('click', (e) => { const b = e.detail === 0 && e.target.closest('[data-bell]'); if (b) openPrayer(b.dataset.bell); });

// The fold button on phones (see clocks.js): read from the pointer like the weather link, and from Enter or Space (detail 0)
let foldArmed = false;
const applyFold = () => { $('clock').dataset.fold = settings.tableOpen ? 'open' : 'closed'; };
const toggleFold = () => { settings.tableOpen = !settings.tableOpen; save(); applyFold(); tick(); };
applyFold();
// button[data-fold] only: #clock itself carries data-fold="open|closed" for the stylesheet, and would match any tap on the board
$('clock').addEventListener('pointerdown', (e) => { foldArmed = !!e.target.closest('button[data-fold]'); });
$('clock').addEventListener('pointerup', (e) => { if (foldArmed && e.target.closest('button[data-fold]')) toggleFold(); foldArmed = false; });
$('clock').addEventListener('click', (e) => { if (e.detail === 0 && e.target.closest('button[data-fold]')) toggleFold(); });
$('clock').addEventListener('pointerup', (e) => { const t = e.target.closest('[data-go]')?.dataset.go; if (wxArmed && t === wxArmed) go(t); wxArmed = false; });
$('clock').addEventListener('pointercancel', () => { wxArmed = false; });
document.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => {
  if (settings.units === b.dataset.unit) return;
  settings.units = b.dataset.unit;
  save();
  loadWeather();
}));

// Duas and adhkar: the set follows the time of day; counts reset each day and stay on this device
let dk = { key: null, i: 0, until: null }, dkSig = '';
const dkItem = () => SETS[dk.key].items[dk.i];
function renderAdhkar(nowMin) {
  const pick = pickSet(nowMin, day.rows, day.sunrise, today.weekday), set = SETS[pick.key];
  if (pick.key !== dk.key) dk = { key: pick.key, i: pick.key === 'general' ? Math.floor(Date.UTC(today.y, today.m - 1, today.d) / 864e5) % set.items.length : 0 };
  dk.until = pick.until;
  const it = dkItem(), ctKey = `${it.ch}:${it.i}`;
  const show = settings.adhkar && !!(it.ar || it.en); // hidden until the Hisn al-Muslim text has loaded
  const sig = [dk.key, dk.i, dk.until, show, settings.translit, settings.arSize].join('|');
  if (sig === dkSig) return;
  dkSig = sig;
  $('adhkar').hidden = !show;
  $('adhkar').dataset.size = settings.arSize;
  $('dk-title').textContent = set.title;
  $('dk-when').textContent = dk.until != null ? `${set.when}, until ${fmt(dk.until)}` : set.when;
  $('dk-pos').textContent = `${dk.i + 1} of ${set.items.length}`;
  $('dk-ar').textContent = it.ar;
  $('dk-ar').hidden = !it.ar;
  $('dk-tr').textContent = it.tr;
  $('dk-tr').hidden = !settings.translit || !it.tr;
  $('dk-en').textContent = it.en;
  $('dk-src').textContent = it.src;
  // the counter (counter.js), shared with the same dua on the Adhkar screen; Today's set is its group, for Next dua
  setGroup('today', set.title, set.items.map(x => ({ key: `${x.ch}:${x.i}`, n: x.n, ar: x.ar, tr: x.tr, en: x.en })));
  if ($('dk-ct').dataset.key !== `${ctKey}/${it.n}`) { $('dk-ct').innerHTML = counterHtml(ctKey, it.n, 'today', dk.i); $('dk-ct').dataset.key = `${ctKey}/${it.n}`; } // n is known once the text loads
  paintCount(ctKey);
  $('dk-tr-toggle').textContent = settings.translit ? 'Hide transliteration' : 'Show transliteration';
  $('dk-tr-toggle').hidden = !it.tr;
  $('dk-listen').hidden = !AUDIO[dk.key];
  // Full screen: the dua is its own state, one minute in every five and never in the last 15 minutes before an event,
  // so the board has the whole screen the rest of the time. Tapping Next shows it for a minute (see dxPeek).
  const toEvent = nextEvent(shownRows(), tomorrow.rows[0].adhan, nowMin, day.sunrise).at - nowMin;
  const duaTurn = Math.floor(nowMin) % 5 === 2 || Date.now() < dxPeek;
  $('dx-dhikr').hidden = !show || !(toEvent > 15 && duaTurn);
  $('dx-ar').textContent = it.ar;
  $('dx-ar').hidden = !it.ar;
  $('dx-en').textContent = it.en;
  $('dx-pos').textContent = `${dk.i + 1} of ${set.items.length}`;
}
let dxPeek = 0; // ms: until then the dua stays up in full screen
const stepAdhkar = (by) => { const n = SETS[dk.key].items.length; dk.i = (dk.i + by + n) % n; renderAdhkar(clock(new Date(), place().zone).sec / 60); };
$('dk-prev').addEventListener('click', () => stepAdhkar(-1));
$('dk-next').addEventListener('click', () => stepAdhkar(1));
$('dx-next').addEventListener('click', () => { dxPeek = Date.now() + 60e3; stepAdhkar(1); });
$('dk-tr-toggle').addEventListener('click', () => { settings.translit = !settings.translit; $('set-translit').checked = settings.translit; save(); tick(); });
$('dk-share').addEventListener('click', () => { const it = dkItem(); share(SETS[dk.key].title, [it.ar, it.tr, it.en, it.src].filter(Boolean).join('\n')); });
$('set-adhkar').checked = settings.adhkar;
$('set-wxsky').value = settings.wxSky; $('set-wxmove').checked = settings.wxMove; $('set-wxmove').disabled = settings.wxSky === 'off';
$('set-seconds').checked = settings.seconds;
$('bg-group').hidden = settings.look !== 'paper';
$('set-translit').checked = settings.translit;
const AR_SIZES = ['s', 'm', 'l'], AR_NAMES = ['Small', 'Medium', 'Large'];
$('set-arsize').value = AR_SIZES.indexOf(settings.arSize);
$('set-arsize').setAttribute('aria-valuetext', AR_NAMES[AR_SIZES.indexOf(settings.arSize)]);
$('set-adhkar').addEventListener('change', () => { settings.adhkar = $('set-adhkar').checked; save(); tick(); });
$('set-wxsky').addEventListener('change', () => { settings.wxSky = $('set-wxsky').value; $('set-wxmove').disabled = settings.wxSky === 'off'; save(); applyLook(); tick(); });
$('set-wxmove').addEventListener('change', () => { settings.wxMove = $('set-wxmove').checked; save(); applyLook(); tick(); });
$('set-seconds').addEventListener('change', () => { settings.seconds = $('set-seconds').checked; save(); tick(); });
$('set-translit').addEventListener('change', () => { settings.translit = $('set-translit').checked; save(); tick(); });
$('set-dxcard').value = settings.dxCard;
$('set-dxcard').addEventListener('change', () => { settings.dxCard = $('set-dxcard').value; save(); tick(); });
$('set-big').value = ['time', 'count'].includes(settings.big) ? settings.big : 'auto';
$('set-big').addEventListener('change', () => { settings.big = $('set-big').value; save(); tick(); if (displayOpen && !timesLayout()) fitDisplay(); });
$('set-dxlayout').value = settings.dxLayout;
$('set-dxlayout').addEventListener('change', () => { settings.dxLayout = $('set-dxlayout').value; save(); applyLayout(); });
$('set-arsize').addEventListener('input', () => { const i = +$('set-arsize').value; settings.arSize = AR_SIZES[i]; $('set-arsize').setAttribute('aria-valuetext', AR_NAMES[i]); save(); tick(); });
bubble($('set-dim'), 'rng-dim');
bubble($('set-arsize'), 'rng-ar');

// Keep screen on (Screen Wake Lock); also held while full screen is open. The browser drops it when the app is hidden.
let lock = null, locking = false, displayOpen = false;
const wantAwake = () => settings.awake || displayOpen;
async function updateLock() {
  if (wantAwake() && !lock && !locking && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
    locking = true;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; syncAwake(); });
    } catch (e) {
      say('The screen could not be kept on, for example while battery saver is on.');
    }
    locking = false;
  } else if (!wantAwake() && lock) {
    lock.release().catch(() => {});
    lock = null;
  }
  syncAwake();
}
// Slow pixel shift while the screen is kept on (Keep screen on, or Full screen); centred otherwise
function applyShift() {
  const [x, y] = wantAwake() ? burnShift(clock(new Date(), place().zone).sec, root.dataset.theme === 'dark' ? 6 : 4) : [0, 0];
  root.style.setProperty('--shift', `${x}px ${y}px`);
}
function syncAwake() {
  applyShift();
  $('awake').setAttribute('aria-pressed', settings.awake);
  $('awake-label').textContent = settings.awake ? 'Screen stays on' : 'Keep screen on';
  $('awake-switch').checked = settings.awake;
  $('dx-awake').hidden = !lock;
}
function setAwake(on) {
  settings.awake = on;
  save();
  if (on && !('wakeLock' in navigator)) say('This browser cannot keep the screen on. Try a current Chrome, Edge, Safari or Firefox.');
  else say(on ? 'The screen stays on while this app is open.' : 'The screen can sleep again.', null, on);
  updateLock();
}
$('awake').addEventListener('click', () => setAwake(!settings.awake));
$('awake-switch').addEventListener('change', () => setAwake($('awake-switch').checked));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  updateLock();
  if (Date.now() - lastSync > SYNC_EVERY) sync(); // the device was asleep or the app was in the background
});

// Full screen: the chosen clock scaled to fill the screen, with the adhkar line. iPhone has no full screen for web pages, so it opens in the page.
function fitDisplay() {
  if (timesLayout()) return;
  const el = $('dx-clock'), box = $('dx-main');
  el.style.zoom = 1;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  let z = Math.max(0.5, Math.min(3, 0.96 * Math.min(box.clientWidth / r.width, box.clientHeight / r.height)));
  el.style.zoom = z.toFixed(3);
  // second pass: some clocks (text sized in vw) do not scale exactly with zoom
  const after = el.getBoundingClientRect(), over = Math.max(after.width / box.clientWidth, after.height / box.clientHeight);
  if (over > 1) el.style.zoom = Math.max(0.5, z / over * 0.97).toFixed(3);
}
let cursorTimer = 0;
function wakeCursor() {
  $('display').classList.remove('idle');
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => $('display').classList.add('idle'), 3000);
}
// Small screens (a touch device whose shorter side is under 800 CSS pixels: phones and tablets under about 10 inches) get the times-only view.
// shortcut: the screen's size is used, not the window's, so entering full screen cannot flip the layout; inches are not available to a web page.
const smallScreen = () => matchMedia('(any-pointer: coarse)').matches && Math.min(screen.width, screen.height) < 800;
const timesLayout = () => settings.dxLayout === 'times' || (settings.dxLayout === 'auto' && smallScreen());
function applyLayout() {
  const want = timesLayout() ? 'times' : 'full';
  if ($('display').dataset.layout === want) return;
  $('display').dataset.layout = want;
  if (displayOpen) { tick(); requestAnimationFrame(fitDisplay); }
}
const DISPLAY_KEY = 'iqama-display'; // set while the full screen view is open, so a reload or restart puts it back
const flagDisplay = (on) => { try { on ? localStorage.setItem(DISPLAY_KEY, '1') : localStorage.removeItem(DISPLAY_KEY); } catch (e) {} };
async function openDisplay() {
  if (!placeKnown()) return openLocation(); // nothing to show yet
  displayOpen = true;
  flagDisplay(true);
  mountSky($('display')); // the moving sky goes with the view
  applyLayout();
  $('display').hidden = false;
  dkSig = '';
  tick();
  requestAnimationFrame(fitDisplay);
  wakeCursor();
  try { if ($('display').requestFullscreen && !document.fullscreenElement) await $('display').requestFullscreen({ navigationUI: 'hide' }); } catch (e) {}
  updateLock();
  $('dx-exit').focus();
}
function closeDisplay() {
  if (!displayOpen) return;
  displayOpen = false;
  flagDisplay(false);
  mountSky(document.body);
  $('display').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  updateLock();
  $('fullscreen').focus();
}
$('fullscreen').addEventListener('click', openDisplay);
$('dx-exit').addEventListener('click', closeDisplay);
document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) requestAnimationFrame(fitDisplay); else closeDisplay(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && displayOpen) closeDisplay(); });
addEventListener('resize', () => { if (displayOpen) { applyLayout(); fitDisplay(); } });
$('display').addEventListener('pointermove', wakeCursor);

// Install and offline
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('install').hidden = false; });
$('install').addEventListener('click', async () => { installEvent.prompt(); await installEvent.userChoice; $('install').hidden = true; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Iqama times come from the nearby masjid's source on MASJIDS (for ISCJ, our own /api/iqama, which reads iscj.org live);
// its daily copy (iqama.json) is the fallback. Returns true when the masjid itself answered, or when no masjid is near (nothing to read).
// fresh asks the server to skip its 5 minute cache. The weather is refreshed every 15 minutes. The masjid is read at start,
// on a new day, on Sync now, when the connection returns, and about hourly (its times change only when it publishes, so this
// costs it almost nothing: the server keeps a copy for 5 minutes).
const SYNC_EVERY = 15 * 60e3, IQAMA_EVERY = 55 * 60e3;
let lastSync = 0, lastIqama = 0, syncedAt = 0, syncFailed = false;
// "Last synced 2:14 PM" beside Sync now; in the warning colour when the last try failed or the last good sync is over a day old
function showSynced() {
  const el = $('synced'), old = !syncedAt || Date.now() - syncedAt > 864e5;
  el.textContent = !syncedAt ? (syncFailed ? `Not synced yet: ${masjidName()} could not be reached.` : '')
    : `${syncFailed ? 'Could not sync. ' : ''}Last synced ${stamp(syncedAt)}.`;
  el.classList.toggle('iq-warn', syncFailed || old && !!syncedAt);
}
async function loadIqama(fresh) {
  const m = nearMasjid();
  if (!m) return true;
  if (masjid.id !== m.id) masjid = { id: m.id, iqama: {}, sunday: {}, jumuah: [], updated: '', checked: 0, stale: false, failed: false };
  let j = null, live = false;
  try { const r = await fetch(`${m.source}${fresh ? '?fresh=1' : ''}`); if (r.ok) { j = await r.json(); live = !j.stale; } } catch (e) { /* fall back below */ }
  if ((!j || !j.iqama) && m.daily) {
    live = false;
    try { const r = await fetch(m.daily, { cache: 'no-cache' }); if (r.ok) j = await r.json(); } catch (e) { j = null; }
  }
  if (!j || !j.iqama || typeof j.iqama !== 'object') { masjid.failed = !Object.keys(masjid.iqama).length; return false; }
  masjid = { id: m.id, iqama: j.iqama, sunday: j.sunday && typeof j.sunday === 'object' ? j.sunday : {}, jumuah: Array.isArray(j.jumuah) ? j.jumuah : [], updated: /^\d{4}-\d{2}-\d{2}$/.test(j.updated) ? j.updated : '', checked: Number.isFinite(j.fetched) ? j.fetched : 0, stale: !!j.stale, failed: false };
  return live;
}
// Weather every time; iqama times when asked (fresh, newDay) or when the last good read is about an hour old, or none has succeeded yet.
async function sync(fresh, newDay) {
  lastSync = Date.now();
  const wantIqama = fresh || newDay || lastSync - lastIqama > IQAMA_EVERY;
  // the Today tab's duas are entries of Hisn al-Muslim, read from the Adhkar tab's file; asked again until it has loaded once
  if (!SETS.adhan.items[0].ar) loadHisnText().then(fillSets).then(() => { dkSig = ''; tick(); }).catch((e) => console.warn('IqamaHub: adhkar text failed', e));
  const [live] = await Promise.all([wantIqama ? loadIqama(fresh) : null, loadWeather()]);
  if (wantIqama && live) lastIqama = lastSync;
  if (wantIqama) { syncFailed = !live; if (live) syncedAt = lastSync; }
  showSynced();
  if (today && wantIqama) loadDay(today);
  return wantIqama ? live : true;
}

// Start with calculated times at once, then fill in the masjid's iqama times and the weather when they arrive
save();
route();
buildForm();
buildAlerts();
showAlertLog();
syncSound();
tick();
updateLock();
setInterval(tick, 1000);
setInterval(applyShift, 30e3);
sync();
setInterval(sync, SYNC_EVERY);
setInterval(showSynced, 60e3); // turns to the warning colour once the last good sync is a day old
// Connection, beside the date (and on the full screen view): nothing while online. Offline, a crossed-out signal and
// "Offline: using saved times", so no one wonders whether a time is current. When the connection comes back, the signal's
// arcs light in turn while everything syncs, then "Up to date" shows for a few seconds and the note goes away.
const NET_ICON = '<svg class="net-ic" viewBox="0 0 24 24" aria-hidden="true"><path class="n3" d="M2.5 9a14 14 0 0 1 19 0"/><path class="n2" d="M5.5 12.5a9.5 9.5 0 0 1 13 0"/>'
  + '<path class="n1" d="M8.7 16a5 5 0 0 1 6.6 0"/><circle class="n0" cx="12" cy="19.5" r="1.4"/><path class="nx" d="M4 4l16 16"/></svg>';
const NET_TEXT = { off: 'Offline: using saved times', on: 'Back online, syncing…', ok: 'Up to date' };
let netTimer = 0;
function showNet(state) { // 'off', 'on' (syncing), 'ok', or '' for nothing
  clearTimeout(netTimer);
  document.querySelectorAll('[data-net]').forEach(el => {
    if (el.dataset.state === state) return;
    el.dataset.state = state; el.hidden = !state;
    el.innerHTML = state ? `${NET_ICON}<span>${NET_TEXT[state]}</span>` : '';
  });
  if (state === 'ok') netTimer = setTimeout(() => showNet(''), 4000);
}
addEventListener('offline', () => showNet('off'));
addEventListener('online', async () => { // the connection came back: bring everything up to date at once
  showNet('on');
  const live = await sync();
  showNet(!navigator.onLine ? 'off' : live ? 'ok' : ''); // not reaching the masjid is shown beside Sync now, in the warning colour
});
if (!navigator.onLine) showNet('off');

// Self-update, for a tablet that is never reloaded by hand. Every 30 minutes (and when the connection returns) the page asks the server
// whether any of its files changed since it loaded; if so, it reloads itself at a quiet moment: no sound playing, no alert,
// nobody touching it for a minute, no adhan or iqama within 2 minutes. The full screen view is restored after the reload.
const WATCHED = ['./', 'boot.js', 'tour.js', 'fonts.css', 'daisy.css', 'styles.css', 'look.css', 'app.js', 'logic.js', 'sky.js', 'clocks.js', 'weather.js', 'adhkar.js', 'hisn.js', 'quran.js', 'quran-logic.js', 'quran-offline.js', 'motion.js', 'controls.js', 'remote.js', 'feedback.js', 'counter.js'];
let loadedVersion = '', updateWaiting = false, lastTouch = Date.now();
for (const t of ['pointerdown', 'keydown', 'touchstart']) addEventListener(t, () => { lastTouch = Date.now(); }, { passive: true });
// A wall tablet comes back to Today by itself: after 2 minutes untouched, off any other screen (but not while audio plays,
// a Settings field is being edited, or the feedback form is open)
const IDLE_HOME = 120e3;
setInterval(() => {
  if (tab === 'today' || Date.now() - lastTouch < IDLE_HOME || playing() || quran.isPlaying()) return;
  if (document.activeElement?.matches('input, select, textarea') || document.querySelector('dialog[open]')) return;
  go('today');
}, 10e3);
// The server gives every file but the home page a version tag; the home page is fingerprinted from its text instead
const fingerprint = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = (h * 33 + t.charCodeAt(i)) | 0; return `${t.length}:${h}`; };
async function siteVersion() {
  try {
    const sigs = await Promise.all(WATCHED.map(async (f) => {
      if (f === './') { const r = await fetch(f, { cache: 'no-store' }); return r.ok ? fingerprint(await r.text()) : ''; }
      const r = await fetch(f, { method: 'HEAD', cache: 'no-store' });
      return r.ok ? r.headers.get('etag') || r.headers.get('last-modified') || '' : '';
    }));
    return sigs.every(Boolean) ? sigs.join('|') : ''; // empty: offline or the server gives no version, so no update is assumed
  } catch (e) { return ''; }
}
async function checkUpdate() {
  const v = await siteVersion();
  if (!v) return;
  if (!loadedVersion) loadedVersion = v;
  else if (v !== loadedVersion) updateWaiting = true;
}
function updateIfQuiet() {
  if (!updateWaiting || !today) return;
  try { if (Date.now() - Number(sessionStorage.getItem('iqama-reloaded') || 0) < 3600e3) return; } catch (e) {} // never more than once an hour
  const nowMin = clock(new Date(), place().zone).sec / 60;
  const ev = nextEvent(shownRows(), tomorrow.rows[0].adhan, nowMin, day.sunrise);
  if (!safeToReload({ audio: playing() || quran.isPlaying(), alert: !!pending || !!alertNow, idleMs: Date.now() - lastTouch, minToEvent: ev ? ev.at - nowMin : null })) return;
  try { sessionStorage.setItem('iqama-reloaded', String(Date.now())); } catch (e) {}
  location.reload();
}
checkUpdate();
setInterval(checkUpdate, 30 * 60e3);
addEventListener('online', checkUpdate);
setInterval(updateIfQuiet, 30e3);
try { if (localStorage.getItem(DISPLAY_KEY) === '1') openDisplay(); } catch (e) {} // after a reload or restart, the full screen view comes back
$('sync').addEventListener('click', async () => {
  $('sync').disabled = true;
  say('Syncing iqama times, prayer times and weather…');
  const live = await sync(true);
  $('sync').disabled = false;
  say(live && weather ? 'Synced.' : `${live ? '' : `Could not reach ${masjidName()}, so the iqama times are the last saved ones. `}${weather ? '' : 'Weather is not available right now.'}`.trim(), null, live && !!weather);
});

// The app's version is the offline cache's name (sw.js raises it with every release)
let swVersion = '';
try { caches.keys().then(k => { swVersion = k.find(n => n.startsWith('iqama-')) || ''; }).catch(() => {}); } catch (e) {}
// Feedback: what is listed here is shown in the form, and sent only if the person leaves it switched on.
// No coordinates: the place's name is enough to look into wrong times.
feedback = initFeedback({
  snapTarget: () => (displayOpen ? $('display') : document.querySelector('.app')),
  details: () => {
    const shown = tab === 'settings' ? `settings › ${sub}` : tab;
    return {
      version: swVersion || 'unknown', screen: displayOpen ? 'full screen' : shown, place: place().name,
      look: settings.look, brightness: DIM_NAMES[currentDim()] || '', 'clock style': settings.clock,
      'full screen layout': settings.dxLayout, 'keep screen on': settings.awake ? 'on' : 'off',
      alerts: settings.muted ? 'off' : 'on', units: settings.units,
      'screen size': `${innerWidth} × ${innerHeight}, ${devicePixelRatio || 1}x`, browser: navigator.userAgent,
      'time zone': place().zone, 'local time': new Date().toLocaleString('en-US', { timeZone: place().zone }),
      online: navigator.onLine ? 'yes' : 'no',
    };
  },
});
if (location.hash === '#feedback') route();
