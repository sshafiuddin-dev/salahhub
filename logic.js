// Pure time logic for Iqama Times. A time of day is minutes after local midnight at the prayer location.
export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const NAMES = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

// Wall clock at a place: its date, weekday, seconds after midnight, and UTC offset in hours (to the quarter hour)
const formatters = {};
export function clock(date, zone) {
  const f = formatters[zone] ||= new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const parts = {};
  for (const { type, value } of f.formatToParts(date)) parts[type] = value;
  const [y, m, d, h, mi, s] = ['year', 'month', 'day', 'hour', 'minute', 'second'].map(k => +parts[k]);
  return { y, m, d, weekday: parts.weekday, sec: h * 3600 + mi * 60 + s, offset: Math.round((Date.UTC(y, m - 1, d, h, mi, s) - date.getTime()) / 9e5) / 4 };
}

// The soft alert beep, made here instead of shipped as a recording: a short 880 Hz tone that fades out, as 16-bit mono WAV bytes
export function beepWav(rate = 22050, sec = 0.45, hz = 880) {
  const n = Math.round(rate * sec), v = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const t = i / rate; // a 5 ms fade in avoids a click; the decay makes it a soft "ding"
    v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * hz * t) * Math.exp(-t * 7) * Math.min(1, t * 200) * 0.35 * 32767), true);
  }
  return new Uint8Array(v.buffer);
}

// The text under Settings, Adhan and alerts that explains a missed alert, from what the page saved on this device:
// log = { last: { what, when, result }, gaps: [{ from, to }] }, started = when this page started. Anything malformed is ignored.
export function alertLogText(log, started) {
  const txt = (v) => String(v ?? '').slice(0, 80);
  const last = log && log.last && typeof log.last === 'object' ? log.last : null;
  const gaps = (Array.isArray(log && log.gaps) ? log.gaps : []).filter(g => g && g.from && g.to).slice(0, 3);
  return [
    last ? `Last alert: ${txt(last.what)}, ${txt(last.when)}: ${txt(last.result)}.` : 'No alert has gone off on this device yet.',
    gaps.length ? `This page’s clock stopped, so alerts in between were skipped: ${gaps.map(g => `${txt(g.from)} to ${txt(g.to)}`).join('; ')}.` : '',
    started ? `This page started ${txt(started)}.` : '',
  ].filter(Boolean).join('\n');
}

export const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m && +m[1] < 24 && +m[2] < 60 ? m[1] * 60 + +m[2] : null;
}

// An iqama rule is "HH:MM" (fixed clock time) or "+N" (minutes after adhan). Anything else means not set.
export function iqamaAt(rule, adhan) {
  if (typeof rule !== 'string') return null;
  if (/^\+\d{1,3}$/.test(rule)) return adhan + +rule;
  return parseHM(rule);
}

export function fmt(min) {
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60);
  return `${(h + 11) % 12 + 1}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Time left, rounded up: 7 h 38 min 30 s left reads "7h 39m", so the count agrees with the adhan time shown beside it
// (9:50 PM to 5:29 AM) and reaches zero at the adhan itself. Under an hour it counts down in seconds.
export function fmtSpan(sec) {
  sec = Math.max(0, Math.ceil(sec - 1e-6));
  const two = (n) => String(n).padStart(2, '0');
  if (sec >= 3600) { const min = Math.ceil(sec / 60); return `${Math.floor(min / 60)}h ${two(min % 60)}m`; }
  return `${Math.floor(sec / 60)}m ${two(sec % 60)}s`;
}

// The moment (ms since 1970) a wall-clock time happens at a place: date y-m-d, min minutes after its midnight (1440 and
// over runs into the next days). Uses the zone's own offset at that moment, so a countdown across a clock change is right.
export function wallMs(y, m, d, min, zone) {
  const naive = Date.UTC(y, m - 1, d, 0, 0) + Math.round(min * 60e3);
  let t = naive - clock(new Date(naive), zone).offset * 36e5;
  t = naive - clock(new Date(t), zone).offset * 36e5; // a second pass settles times near the change
  return t;
}

// What to count down to: the next adhan or iqama today, else tomorrow's Fajr adhan.
// sunrise (optional) is counted down to after Fajr, as an event of its own with no kind.
// On a Friday the Jumu'ah row carries a list of khutbahs (r.jumuah): after the adhan the count goes to the first, then on to
// each next one that comes before the next prayer's adhan (Asr), then to that adhan. With more than one, the event says
// which: n of the total. The first khutbah always counts, wherever it falls.
// A prayer's alerts at a glance, for the bell on the timetable: 'off' (its alerts or all alerts are off, or no step is on),
// 'sound' (any step that is on makes a sound) or 'msg' (only messages). Jumu'ah has the one step before the khutbah.
export function bellState(a, muted, isJumuah = false) {
  if (muted || !a?.on) return 'off';
  const steps = (isJumuah ? [a.before] : [a.adhan, a.before, a.iqama]).filter(s => s?.on);
  if (!steps.length) return 'off';
  return steps.some(s => s.type !== 'message') ? 'sound' : 'msg';
}

// Where the wait for the next event began, for the progress bar on small screens: the time before it on the sheet.
// Waiting for an iqama (or a later khutbah) it is the adhan (or the khutbah before); waiting for an adhan it is the
// last time of the prayer before (its iqama, else its adhan; for Jumu'ah its last khutbah before this adhan), Sunrise
// before Dhuhr, and last night's Isha (taken as today's, a day earlier) before Fajr. Minutes, like the rows.
const lastOf = (r, limit) => (r.jumuah?.length ? Math.max(...khutbahsBefore([...r.jumuah].sort((a, b) => a - b), limit))
  : r.iqama != null && r.iqama > r.adhan ? r.iqama : r.adhan);
export function prevEventAt(rows, next, sunrise) {
  const isha = rows[rows.length - 1];
  if (next.at >= 1440) return lastOf(isha, 1440);
  if (next.key === 'sunrise') return lastOf(rows[0], sunrise);
  const i = rows.findIndex(r => r.key === next.key), r = rows[i];
  if (!r) return next.at;
  if (next.kind === 'iqama') {
    if (r.jumuah?.length && next.n > 1) return khutbahsBefore([...r.jumuah].sort((a, b) => a - b), rows[i + 1]?.adhan)[next.n - 2];
    return r.adhan;
  }
  if (i === 0) return lastOf(isha, 1440) - 1440;
  if (r.key === 'dhuhr' && sunrise != null) return sunrise;
  return lastOf(rows[i - 1], r.adhan);
}
// How far along the wait is, 0 to 1
export const progressOf = (now, from, at) => (at > from ? Math.min(1, Math.max(0, (now - from) / (at - from))) : 1);

// Which of the day's times have already gone by, for fading them on the timetable: everything before the next event
// (an adhan that has been called, but whose iqama is still to come, is not past yet). Sunrise counts as its own time.
// When the sheet shows tomorrow (after Isha) nothing is past; once the next event is tomorrow's Fajr, all of today is.
const DAY_ORDER = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
export function pastKeys(next, isAhead) {
  if (isAhead || !next) return new Set();
  if (next.at >= 1440) return new Set(DAY_ORDER);
  const i = DAY_ORDER.indexOf(next.key);
  return new Set(i < 0 ? [] : DAY_ORDER.slice(0, i));
}

// Khutbahs that count for the day: the first always, later ones only before the next prayer's adhan (Asr)
export const khutbahsBefore = (list, limit = 1440) => list.filter((t, j) => j === 0 || t < limit);

export function nextEvent(rows, tomorrowFajrAdhan, nowMin, sunrise) {
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (nowMin < r.adhan) return { key: r.key, kind: 'adhan', at: r.adhan };
    if (r.jumuah?.length) {
      const ks = khutbahsBefore(r.jumuah, rows[i + 1]?.adhan);
      const j = ks.findIndex(t => nowMin < t);
      if (j >= 0) return { key: r.key, kind: 'iqama', at: ks[j], ...(ks.length > 1 ? { n: j + 1, of: ks.length } : {}) };
    } else if (r.iqama != null && nowMin < r.iqama) return { key: r.key, kind: 'iqama', at: r.iqama };
    if (r.key === 'fajr' && sunrise != null && nowMin < sunrise) return { key: 'sunrise', kind: '', at: sunrise };
  }
  return { key: 'fajr', kind: 'adhan', at: tomorrowFajrAdhan + 1440 };
}

// On a Friday with known khutbah times (minutes), the Dhuhr row becomes Jumu'ah: it carries the khutbahs and
// counts down to each khutbah in turn (see nextEvent) in place of the Dhuhr iqama. Any other day, or no khutbah times, leaves rows as they are.
// May the page reload itself to update? Only when nothing is sounding, nobody has touched it for a minute, and no adhan or iqama is within 2 minutes.
export const safeToReload = ({ audio, alert, idleMs, minToEvent }) => !audio && !alert && idleMs >= 60e3 && (minToEvent == null || minToEvent > 2);

// The khutbah times a visitor types in: valid times only, earliest first, once each, at most six, as "HH:MM".
export function cleanKhutbahTimes(list) {
  if (!Array.isArray(list)) return [];
  const ok = list.filter(t => typeof t === 'string' && parseHM(t) != null).map(t => t.padStart(5, '0'));
  return [...new Set(ok)].sort((a, b) => parseHM(a) - parseHM(b)).slice(0, 6);
}

export function fridayRows(rows, weekday, khutbahs) {
  const k = (khutbahs || []).filter(v => v != null).sort((a, b) => a - b);
  if (weekday !== 'Fri' || !k.length) return rows;
  return rows.map(r => (r.key === 'dhuhr' ? { ...r, iqama: k[0], jumuah: k } : r));
}

// Hijri date from the Umm al-Qura calendar built into the browser (no network), moved by `shift` days for local moon sighting.
// The day turns at midnight, like the Gregorian date beside it; hijriNow can turn it at Maghrib instead.
export const HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'];
let hijriFmt = null;
export function hijri(y, m, d, shift = 0) {
  try {
    hijriFmt ||= new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric' });
    const parts = {};
    for (const { type, value } of hijriFmt.formatToParts(new Date(Date.UTC(y, m - 1, d + shift, 12)))) parts[type] = value;
    const hm = parseInt(parts.month, 10), hy = parseInt(parts.year, 10), hd = parseInt(parts.day, 10);
    if (!(hm >= 1 && hm <= 12 && hd >= 1 && hd <= 30 && hy > 1300)) return '';
    return `${hd} ${HIJRI_MONTHS[hm - 1]} ${hy}`;
  } catch (e) { return ''; } // a browser without the Islamic calendar shows no Hijri date rather than a wrong one
}

// The Hijri date to show now: with atMaghrib on, the Islamic day begins at the Maghrib adhan, so the evening shows tomorrow's date.
export const hijriNow = (y, m, d, shift, atMaghrib, nowMin, maghrib) => hijri(y, m, d, shift + (atMaghrib && nowMin >= maghrib ? 1 : 0));

// The visitor's own minutes added to each calculated adhan time; anything outside -30 to 30 is ignored.
export const cleanTune = (t) => Object.fromEntries(PRAYERS.map(k => [k, Number.isInteger(t?.[k]) && Math.abs(t[k]) <= 30 ? t[k] : 0]));

// Brightness. Level 0 is bright paper; 1 soft, 2 dim and 3 darkest are the night levels.
export const DIM_NAMES = ['Bright', 'Soft', 'Dim', 'Darkest'];
// Night for automatic dimming: from the Isha (or Maghrib) adhan until sunrise. from 'off' is never night.
export function isNight(nowMin, rows, sunrise, from) {
  if (from !== 'isha' && from !== 'maghrib') return false;
  const start = rows[from === 'maghrib' ? 3 : 4].adhan;
  return nowMin >= start || nowMin < sunrise;
}
// The level to show. s = { autoDim, nightLevel, level }; a hand-picked override { level, night } holds until day turns to night or back.
export function dimLevel(s, night, override) {
  if (s.autoDim === 'off') return s.level;
  if (override && override.night === night) return override.level;
  return night ? s.nightLevel : 0;
}

// Which extra card the small full screen shows: 'morning' from sunrise to the Dhuhr adhan, 'evening' from the Maghrib adhan to the Isha adhan, else null.
// rows: today's Fajr to Isha rows.
export function cardWindow(nowMin, rows, sunrise) {
  const [, dhuhr, , maghrib, isha] = rows;
  if (nowMin >= sunrise && nowMin < dhuhr.adhan) return 'morning';
  if (nowMin >= maghrib.adhan && nowMin < isha.adhan) return 'evening';
  return null;
}

// Great-circle distance in km between two { lat, lng } points.
export function km(a, b) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// Alert moments that fall in (fromSec, toSec]; anything over 90 s late is dropped.
// cfg[key] = { on, adhan: type, before: { type, min }, iqama: { type, min } }; type 'off' or a missing part is silent.
// One alert step is { on, type, min? }. Older saves held a bare type for the adhan and type 'off' for a step that was switched off.
export function cleanStep(s, def, sounds, withMin) {
  const o = typeof s === 'string' ? { type: s } : s && typeof s === 'object' ? s : {};
  const known = sounds.includes(o.type);
  const out = { on: o.type === 'off' ? false : typeof o.on === 'boolean' ? o.on : known ? true : def.on, type: known ? o.type : def.type };
  if (withMin) out.min = Number.isInteger(o.min) && o.min >= 1 && o.min <= 60 ? o.min : def.min;
  return out;
}
const stepType = (s) => (typeof s === 'string' ? s : s && s.on !== false ? s.type : 'off');
export function alertsBetween(rows, cfg, fromSec, toSec) {
  const out = [];
  const add = (min, kind, key, type, mins, r) => {
    const s = min * 60;
    // a row that is one of several khutbahs says which, so the message can too
    if (type && type !== 'off' && fromSec < s && s <= toSec && toSec - s < 90) out.push({ kind, key, type, min: mins, ...(r?.of > 1 ? { n: r.n, of: r.of } : {}) });
  };
  for (const r of rows) {
    const c = cfg[r.key];
    if (!c || !c.on) continue;
    add(r.adhan, 'adhan', r.key, stepType(c.adhan));
    if (c.before) add(r.adhan - c.before.min, 'before', r.key, stepType(c.before), c.before.min, r);
    if (c.iqama && r.iqama != null) add(r.iqama - c.iqama.min, 'iqama', r.key, stepType(c.iqama), c.iqama.min);
  }
  return out;
}

export const uvLevel = (u) => u < 3 ? 'low' : u < 6 ? 'moderate' : u < 8 ? 'high' : u < 11 ? 'very high' : 'extreme';
export const aqiLevel = (a) => a <= 50 ? 'good' : a <= 100 ? 'moderate' : a <= 150 ? 'unhealthy for sensitive groups' : a <= 200 ? 'unhealthy' : a <= 300 ? 'very unhealthy' : 'hazardous';
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

// Open-Meteo weather code (WMO) to a backdrop kind and a label.
const WEATHER = [
  [[0], 'clear', 'Clear'], [[1], 'clear', 'Mostly clear'], [[2], 'cloudy', 'Partly cloudy'], [[3], 'overcast', 'Overcast'],
  [[45, 48], 'fog', 'Fog'], [[51, 53, 55, 56, 57], 'rain', 'Drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], 'rain', 'Rain'],
  [[71, 73, 75, 77, 85, 86], 'snow', 'Snow'], [[95, 96, 99], 'storm', 'Thunderstorm'],
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayName = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof iso === 'string' ? iso : '');
  return m ? DAY_NAMES[new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).getUTCDay()] : '';
};

// One line about the two days after today. days: [{ date, max, min, pop, kind }] with today first.
// Temperature is a trend against today's high (5 degrees F or 3 C), else a plain word; rain or snow is named when its chance is 50% or more.
export function outlook(days, units) {
  const [t, a, b] = days || [];
  if (!t || !a || !b || [t.max, a.max, b.max].some(v => v == null)) return '';
  const F = units === 'F', diff = (a.max + b.max) / 2 - t.max, step = F ? 5 : 3;
  const avg = (a.max + b.max) / 2, c = F ? (avg - 32) / 1.8 : avg;
  const word = c <= 4 ? 'cold' : c <= 13 ? 'cool' : c <= 24 ? 'mild' : c <= 31 ? 'warm' : 'hot';
  const temp = diff <= -step ? 'turning colder' : diff >= step ? 'turning warmer' : `staying ${word}`;
  const wet = [[a, 'tomorrow'], [b, dayName(b.date) || 'the day after']].filter(([d]) => d.pop != null && d.pop >= 50 || d.kind === 'snow' && d.pop == null);
  const kind = wet.some(([d]) => d.kind === 'snow') ? 'snow' : wet.some(([d]) => d.kind === 'storm') ? 'storms' : 'rain';
  return `Next two days: ${temp}, ${wet.length ? `${kind} ${wet.map(([, n]) => n).join(' and ')}` : 'mostly dry'}.`;
}

// Open-Meteo's daily code is the most severe condition of the day, so a few snowy hours on a rainy day read as "snow".
// Keep snow only when its water content (about a tenth of the snowfall depth, in cm or inches) is at least the rain that falls.
export function dayKind(code, snowfall, rain) {
  const base = weatherKind(code);
  if (base.kind !== 'snow' || snowfall == null || rain == null) return base;
  return snowfall / 10 >= rain ? base : weatherKind(63);
}

export function weatherKind(code) {
  const hit = WEATHER.find(([codes]) => codes.includes(code));
  return hit ? { kind: hit[1], label: hit[2] } : { kind: 'plain', label: '' };
}

// Burn-in care for a screen kept on all day: the clock and table step 2 px around a 3 × 3 grid,
// one step every 3 minutes, so no edge stays on the same pixels for long. Returns [x, y] in px.
const SHIFT_PATH = [[0, 0], [2, 0], [2, 2], [0, 2], [-2, 2], [-2, 0], [-2, -2], [0, -2], [2, -2]];
export const burnShift = (sec) => SHIFT_PATH[Math.floor(sec / 180) % SHIFT_PATH.length];

// Weather at the next prayer, from the hourly forecast: hours are [{ today, min, temp, code, pop }] starting at the current hour.
// at is minutes after today's midnight; 1440 and over is tomorrow (Fajr after Isha). Returns { temp, words, pop } or null.
// Rain, snow or storms are named when the forecast shows them or their chance is 30% or more ("likely" at 60%); otherwise the sky.
export function prayerWeather(hours, at) {
  const tomorrow = at >= 1440, hr = Math.floor((at % 1440) / 60);
  const h = (hours || []).find(x => x.today === !tomorrow && Math.floor(x.min / 60) === hr);
  if (!h || h.temp == null) return null;
  const { kind, label } = weatherKind(h.code), pop = h.pop;
  const wet = ['rain', 'snow', 'storm'].includes(kind);
  if (wet || pop >= 30) {
    const word = kind === 'snow' ? 'snow' : kind === 'storm' ? 'storms' : 'rain';
    return { temp: h.temp, words: pop == null ? (label || word).toLowerCase() : pop >= 60 ? `${word} likely` : `chance of ${word}`, pop };
  }
  return { temp: h.temp, words: (label || '').toLowerCase(), pop: null };
}

// When an official warning ends, in the place's time zone: "until 7:00 PM", "until 7:00 PM Wed" on a later day,
// or "until further notice" when NWS gives no end. iso is an ISO time with offset; now is a Date.
export function untilText(iso, now, zone) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'until further notice';
  const end = clock(new Date(t), zone), today = clock(now, zone);
  const later = end.y !== today.y || end.m !== today.m || end.d !== today.d;
  return `until ${fmt(Math.floor(end.sec / 60))}${later ? ` ${end.weekday}` : ''}`;
}

// The moving weather sky: what to draw, from the weather now and the time of day. Pure, so the self-check can test it.
// w: { kind, cloud (%), vis (m), dir (° the wind comes from), sky: { rain (mm/h), snow (cm/h), wind (km/h) } } or null.
// t: { now, sunrise, maghrib } in minutes after midnight; hijriDay: 1-30.
// Returns numbers from 0 to 1 for cloud cover, darkness of the cloud, rain, snow and fog; wind as a slant from -1 (to the
// left) to 1; day (1 full daylight, 0 night), dawn (the warm hour around sunrise or Maghrib), the sun's place [x, y]
// across and up the sky (null when it is down), night (from Maghrib to sunrise) and the moon's phase (0 new, .5 full).
const SKY_KIND = { clear: [.05, 0], cloudy: [.45, .05], overcast: [.95, .55], fog: [.6, .3], rain: [.95, .6], storm: [1, .75], snow: [.9, .35], plain: [.25, 0] };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export function skyParams(w, t, hijriDay) {
  const kind = SKY_KIND[w?.kind] ? w.kind : 'plain', [cover0, dark] = SKY_KIND[kind], r = w?.sky?.rain, sn = w?.sky?.snow;
  const wet = kind === 'rain' || kind === 'storm';
  const cover = w?.cloud == null ? cover0 : Math.max(clamp01(w.cloud / 100), wet || kind === 'snow' ? .85 : 0);
  // rain: drizzle and light rain thin, moderate and heavy dense (US/WMO bands: under 2.5, 7.6 and over mm an hour)
  let rain = !wet ? 0 : r == null || r <= 0 ? .4 : r < .5 ? .3 : r < 2.5 ? .5 : r < 7.6 ? .75 : 1;
  if (kind === 'storm') rain = Math.max(rain, .8);
  const snow = kind !== 'snow' ? 0 : sn == null || sn <= 0 ? .55 : sn < .5 ? .45 : sn < 2 ? .7 : 1;
  const fog = kind === 'fog' ? .8 : w?.vis != null && w.vis < 1000 ? .5 : 0;
  // the wind leans the rain and moves the clouds: east-west part of where it blows to, strongest at 40 km/h and over
  const speed = w?.sky?.wind ?? 0, dir = w?.dir ?? 270;
  const wind = +(Math.sin(((dir + 180) % 360) * Math.PI / 180) * clamp01(speed / 40)).toFixed(3);
  const { now, sunrise, maghrib } = t, span = maghrib - sunrise, f = (now - sunrise) / span;
  const day = +clamp01(Math.min(now - (sunrise - 20), (maghrib + 20) - now) / 60).toFixed(3);
  const near = (m, before, after) => (now < m ? clamp01(1 - (m - now) / before) : clamp01(1 - (now - m) / after));
  const dawn = +Math.max(near(sunrise, 70, 40), near(maghrib, 45, 50)).toFixed(3);
  const sun = f >= -.04 && f <= 1.04 ? [+(.08 + .84 * clamp01(f)).toFixed(3), +(.35 + .55 * Math.sin(Math.PI * clamp01(f))).toFixed(3)] : null;
  return { kind, cover: +cover.toFixed(3), dark, rain, snow, fog, storm: kind === 'storm', wind, day, dawn, sun,
    night: now >= maghrib || now < sunrise, moon: +(((hijriDay || 15) - .5) / 29.53).toFixed(3) };
}
