// Run with: node scripts/selfcheck.mjs
import assert from 'node:assert/strict';
import { parse, fromSchedule, read } from '../functions/_lib/parse.js';
import { handle } from '../functions/api/iqama.js';
import { handle as alertsHandle, pick as pickAlerts } from '../functions/api/alerts.js';
import { handle as feedbackHandle } from '../functions/api/feedback.js';
import { normalizeItem, normalizeChapter, check, parseLoose, repairJson, parseChapterJson } from './fetch-hisn.mjs';
import { wallMs, safeToReload, PRAYERS, cardWindow, fridayRows, outlook, dayName, parseHM, iqamaAt, fmt, fmtSpan, nextEvent, km, alertsBetween, cleanStep, weatherKind, dayKind, uvLevel, aqiLevel, compass, clock, burnShift, prayerWeather, untilText, skyParams, esc, beepWav, alertLogText, cleanKhutbahTimes, pastKeys, prevEventAt, progressOf, bellState } from '../logic.js';

// Page parser, against markup shaped like iscj.org's prayer times block
const page = `<nav>Fajr Institute</nav><style>.x{}</style><div><span>Fajr</span><b>5:12 AM</b><i>Iqama</i> 5:45</div>
  <div>Sunrise 6:41 AM</div><div>Dhuhr 1:10 PM <i>Iqama</i>&nbsp;12:30</div><div>Asr 4:50 PM Iqama 2:45</div>
  <div>Maghrib 7:58 PM Iqama <em>On Time</em></div><div>Isha 9:24 PM Iqama 8:00</div>
  <h3>Jumu'ah Khutbahs</h3><p>12:00 PM</p><p>1:10 PM</p>`;
assert.deepEqual(parse(page), { iqama: { fajr: '05:45', dhuhr: '12:30', asr: '14:45', maghrib: '+0', isha: '20:00' }, jumuah: ['12:00', '13:10'] });
// iscj.org's own dated schedule (copied from its page script): the HTML shows the old one until ISCJ rebuilds, the script switches by date
const script = 'let n={periods:[{from:"2026-11-01",iqamah:{Fajr:"5:45 AM",Dhuhr:"12:30 PM",Asr:"2:45 PM",Maghrib:"On Time",Isha:"8:00 PM"},sunday:{Dhuhr:"1:10 PM"}},{from:"2026-11-16",iqamah:{Fajr:"6:00 AM",Dhuhr:"12:30 PM",Asr:"2:45 PM",Maghrib:"On Time",Isha:"8:00 PM"},sunday:{Dhuhr:"1:10 PM"}}],jumuah:["12:00 PM","1:10 PM"]},s="x"';
assert.equal(fromSchedule(script, '2026-11-15').iqama.fajr, '05:45', 'the day before the change');
assert.deepEqual(fromSchedule(script, '2026-11-16'), { iqama: { fajr: '06:00', dhuhr: '12:30', asr: '14:45', maghrib: '+0', isha: '20:00' }, jumuah: ['12:00', '13:10'], sunday: { dhuhr: '13:10' } }, 'the day of the change, with its Sunday Dhuhr');
assert.deepEqual(fromSchedule(script.replaceAll('sunday:{Dhuhr:"1:10 PM"}', 'x:1'), '2026-11-16').sunday, undefined, 'no Sunday times: none returned');
assert.throws(() => fromSchedule(script.replaceAll('sunday:{Dhuhr:"1:10 PM"}', 'sunday:{Dhuhr:"3:10 AM"}'), '2026-11-16'), /Implausible dhuhr/);
assert.equal(fromSchedule('no schedule here', '2026-11-16'), null);
assert.throws(() => fromSchedule(script, '2026-10-01'), /No ISCJ schedule/);
assert.throws(() => fromSchedule(script.replace('"6:00 AM"', '"9:00 AM"'), '2026-11-16'), /Implausible fajr/);
{ // the page's HTML still says 5:45, its script says 6:00: the script wins
  const html = page + '<script src="/_next/static/chunks/app/page-abc.js"></script><script src="/_next/static/chunks/other.js"></script>';
  const get = async (u) => new Response(u.endsWith('page-abc.js') ? script : u.endsWith('other.js') ? 'nothing' : html);
  assert.equal((await read(get, Date.parse('2026-11-16T15:00:00Z'))).iqama.fajr, '06:00');
  assert.equal((await read(get, Date.parse('2026-11-16T03:00:00Z'))).iqama.fajr, '05:45', 'still the 15th in New York');
  assert.equal((await read(async (u) => (u.endsWith('.js') ? new Response('', { status: 404 }) : new Response(html)), 1e12)).iqama.fajr, '05:45', 'script unreachable: the HTML');
}
// Self-update only at a quiet moment
assert.equal(safeToReload({ audio: false, alert: false, idleMs: 90e3, minToEvent: 40 }), true);
assert.equal(safeToReload({ audio: true, alert: false, idleMs: 90e3, minToEvent: 40 }), false, 'sound playing');
assert.equal(safeToReload({ audio: false, alert: true, idleMs: 90e3, minToEvent: 40 }), false, 'alert showing');
assert.equal(safeToReload({ audio: false, alert: false, idleMs: 20e3, minToEvent: 40 }), false, 'someone just touched it');
assert.equal(safeToReload({ audio: false, alert: false, idleMs: 90e3, minToEvent: 1.5 }), false, 'adhan or iqama about to start');
assert.equal(safeToReload({ audio: false, alert: false, idleMs: 90e3, minToEvent: null }), true, 'no event ahead');
// Live function: 5 minute cache, Sync now at most once a minute, last good copy when iscj.org fails
{
  const store = new Map(), cache = { match: async (r) => (store.has(r.url) ? new Response(store.get(r.url)) : undefined), put: async (r, res) => { store.set(r.url, await res.text()); } };
  let calls = 0, ok = true;
  const get = async () => { calls++; return ok ? new Response(page) : new Response('no', { status: 503 }); };
  const at = (q, t) => handle('https://x.test/api/iqama' + q, cache, get, t).then(async r => [r.status, await r.json()]);
  const [s1, b1] = await at('', 1e6);
  assert.deepEqual([s1, calls, b1.iqama.fajr, b1.fetched], [200, 1, '05:45', 1e6]);
  await at('', 1e6 + 299e3); assert.equal(calls, 1, 'cached for 5 minutes');
  await at('?fresh=1', 1e6 + 30e3); assert.equal(calls, 1, 'Sync now is held to once a minute');
  await at('?fresh=1', 1e6 + 90e3); assert.equal(calls, 2, 'Sync now reads iscj.org again');
  await at('', 1e6 + 90e3 + 301e3); assert.equal(calls, 3, 'refetched after 5 minutes');
  ok = false;
  const [s2, b2] = await at('', 1e6 + 90e3 + 700e3);
  assert.deepEqual([s2, b2.stale, b2.iqama.fajr], [200, true, '05:45'], 'last good copy when iscj.org fails');
  const [s3] = await handle('https://x.test/api/iqama', { match: async () => undefined, put: async () => {} }, get, 1e6).then(async r => [r.status]);
  assert.equal(s3, 502, 'no copy and no iscj.org is an error');
}
for (const q of ['&#8217;', '&rsquo;', '&#039;']) assert.deepEqual(parse(page.replace("Jumu'ah", `Jumu${q}ah`)).jumuah, ['12:00', '13:10'], `apostrophe written as ${q}`);
assert.deepEqual(parse(`<a>Jumu'ah</a><p>Friday Jumu&rsquo;ah prayer with a weekly khutbah</p>` + page).jumuah, ['12:00', '13:10'], 'menu mentions of Jumuah come first');
assert.equal(parse(page.replace('Iqama</i>&nbsp;12:30', 'Iqama</i> 11:45')).iqama.dhuhr, '11:45');
assert.throws(() => parse(page.replace('Iqama 8:00', '')), /isha/);
assert.throws(() => parse(page.replace('Iqama</i> 5:45', 'Iqama</i> 9:45')), /Implausible fajr/);

// Time logic
// UTC offset feeds every prayer time: New York is -5 in winter and -4 in summer, India keeps its half hour
assert.equal(clock(new Date(Date.UTC(2026, 0, 15, 17)), 'America/New_York').offset, -5);
assert.equal(clock(new Date(Date.UTC(2026, 6, 15, 17)), 'America/New_York').offset, -4);
assert.equal(clock(new Date(Date.UTC(2026, 0, 15, 17)), 'Asia/Kolkata').offset, 5.5);
assert.deepEqual((({ y, m, d, weekday, sec }) => ({ y, m, d, weekday, sec }))(clock(new Date(Date.UTC(2026, 0, 15, 4, 30, 5)), 'America/New_York')),
  { y: 2026, m: 1, d: 14, weekday: 'Wed', sec: 23 * 3600 + 30 * 60 + 5 }, 'a time just before midnight UTC-5 is still the day before');
{
  // the generated beep is a valid WAV: right header and length, never clips, fades to silence
  const w = beepWav(), v = new DataView(w.buffer), tag = (at) => String.fromCharCode(...w.slice(at, at + 4));
  assert.deepEqual([tag(0), tag(8), tag(36), v.getUint32(24, true), v.getUint32(40, true)], ['RIFF', 'WAVE', 'data', 22050, w.length - 44]);
  const samples = Array.from({ length: (w.length - 44) / 2 }, (_, i) => v.getInt16(44 + i * 2, true));
  assert.ok(Math.max(...samples.map(Math.abs)) < 0.36 * 32767 && Math.abs(samples.at(-1)) < 0.05 * 32767, 'beep stays soft and ends quietly');
}
assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
// The log under Settings that explains a missed alert
assert.equal(alertLogText(null, ''), 'No alert has gone off on this device yet.');
assert.equal(
  alertLogText({ last: { what: 'Fajr adhan', when: 'Nov 13, 5:24 AM', result: 'message shown, sound played' }, gaps: [{ from: 'Nov 12, 11:12 PM', to: 'Nov 13, 6:40 AM' }] }, 'Nov 13, 7:05 AM'),
  'Last alert: Fajr adhan, Nov 13, 5:24 AM: message shown, sound played.\nThis page’s clock stopped, so alerts in between were skipped: Nov 12, 11:12 PM to Nov 13, 6:40 AM.\nThis page started Nov 13, 7:05 AM.');
assert.equal(alertLogText({ last: 5, gaps: 'x' }, ''), 'No alert has gone off on this device yet.', 'a damaged save is ignored');
assert.ok(alertLogText({ gaps: [{}, 1, null, { from: 'a', to: 'b' }, { from: 'c', to: 'd' }, { from: 'e', to: 'f' }, { from: 'g', to: 'h' }] }, '').includes('a to b; c to d; e to f.'), 'at most three stopped periods');
assert.equal(parseHM('05:45'), 345);
assert.equal(parseHM('25:00'), null);
assert.equal(iqamaAt('+10', 300), 310);
assert.equal(iqamaAt('14:45', 800), 885);
assert.equal(iqamaAt(undefined, 800), null);
assert.equal(iqamaAt('<b>', 800), null);
assert.deepEqual([0, 345, 720, 885, 1439].map(fmt), ['12:00 AM', '5:45 AM', '12:00 PM', '2:45 PM', '11:59 PM']);
assert.deepEqual([4805, 65].map(fmtSpan), ['1h 21m', '1m 05s']);
// Countdown rounds up, so it agrees with the adhan time shown: 9:50:30 PM to a 5:29 AM Fajr is 7h 38m 30s, shown "7h 39m"
assert.equal(fmtSpan((1440 + 329) * 60 - (21 * 3600 + 50 * 60 + 30)), '7h 39m');
assert.equal(fmtSpan(7 * 3600 + 39 * 60), '7h 39m', 'on the minute');
assert.deepEqual([3600, 3599, 59.2, 0, -5].map(fmtSpan), ['1h 00m', '59m 59s', '1m 00s', '0m 00s', '0m 00s']);
// Real time to a wall-clock time: New York, 2026
const NY = 'America/New_York';
assert.equal(wallMs(2026, 11, 17, 329, NY), Date.parse('2026-11-17T10:29:00Z'), 'standard time, UTC-5');
assert.equal(wallMs(2026, 7, 1, 329, NY), Date.parse('2026-07-01T09:29:00Z'), 'daylight time, UTC-4');
assert.equal(wallMs(2026, 11, 16, 1440 + 329, NY), Date.parse('2026-11-17T10:29:00Z'), 'tomorrow by minutes past 1440');
// The night clocks go back (1 Nov 2026, 2 AM): from 9:50 PM on 31 Oct to a 6:20 AM Fajr is 9h 30m of real time, not 8h 30m
assert.equal(fmtSpan((wallMs(2026, 10, 31, 1440 + 380, NY) - wallMs(2026, 10, 31, 21 * 60 + 50, NY)) / 1e3), '9h 30m');
// ...and the night they go forward (8 Mar 2026): 7h 30m
assert.equal(fmtSpan((wallMs(2026, 3, 7, 1440 + 380, NY) - wallMs(2026, 3, 7, 21 * 60 + 50, NY)) / 1e3), '7h 30m');
const rows = [{ key: 'fajr', adhan: 312, iqama: 345 }, { key: 'isha', adhan: 1090, iqama: null }];
assert.deepEqual(nextEvent(rows, 313, 300), { key: 'fajr', kind: 'adhan', at: 312 });
assert.deepEqual(nextEvent(rows, 313, 320), { key: 'fajr', kind: 'iqama', at: 345 });
assert.deepEqual(nextEvent(rows, 313, 400), { key: 'isha', kind: 'adhan', at: 1090 });
// Times gone by, for fading: everything before the next event; a called adhan waiting for its iqama is not past
assert.deepEqual([...pastKeys({ key: 'fajr', kind: 'iqama', at: 345 }, false)], []);
assert.deepEqual([...pastKeys({ key: 'sunrise', kind: '', at: 400 }, false)], ['fajr']);
assert.deepEqual([...pastKeys({ key: 'asr', kind: 'adhan', at: 870 }, false)], ['fajr', 'sunrise', 'dhuhr']);
assert.deepEqual([...pastKeys({ key: 'fajr', kind: 'adhan', at: 1440 + 312 }, false)].length, 6, 'after Isha, all of today');
assert.deepEqual([...pastKeys({ key: 'fajr', kind: 'adhan', at: 1440 + 312 }, true)], [], 'tomorrow sheet: nothing past');
// Where the wait began, for the progress bar
const day5 = [{ key: 'fajr', adhan: 334, iqama: 360 }, { key: 'dhuhr', adhan: 705, iqama: 750 }, { key: 'asr', adhan: 856, iqama: 885 },
  { key: 'maghrib', adhan: 996, iqama: 996 }, { key: 'isha', adhan: 1075, iqama: 1200 }];
assert.equal(prevEventAt(day5, { key: 'dhuhr', kind: 'iqama', at: 750 }, 413), 705, 'waiting for the iqama: since the adhan');
assert.equal(prevEventAt(day5, { key: 'asr', kind: 'adhan', at: 856 }, 413), 750, 'waiting for Asr: since the Dhuhr iqama');
assert.equal(prevEventAt(day5, { key: 'dhuhr', kind: 'adhan', at: 705 }, 413), 413, 'waiting for Dhuhr: since sunrise');
assert.equal(prevEventAt(day5, { key: 'sunrise', kind: '', at: 413 }, 413), 360, 'waiting for sunrise: since the Fajr iqama');
assert.equal(prevEventAt(day5, { key: 'isha', kind: 'adhan', at: 1075 }, 413), 996, 'Maghrib on time: since its adhan');
assert.equal(prevEventAt(day5, { key: 'fajr', kind: 'adhan', at: 1440 + 334 }, 413), 1200, 'after Isha: since its iqama');
assert.equal(prevEventAt(day5, { key: 'fajr', kind: 'adhan', at: 334 }, 413), 1200 - 1440, 'before Fajr: since last night');
const fri = day5.map(r => (r.key === 'dhuhr' ? { ...r, iqama: 720, jumuah: [790, 720] } : r));
assert.equal(prevEventAt(fri, { key: 'dhuhr', kind: 'iqama', at: 790, n: 2, of: 2 }, 413), 720, 'second khutbah: since the first');
assert.equal(prevEventAt(fri, { key: 'asr', kind: 'adhan', at: 856 }, 413), 790, 'Asr on a Friday: since the last khutbah');
assert.equal(progressOf(730, 705, 750).toFixed(3), '0.556');
assert.equal(progressOf(800, 705, 750), 1);
assert.equal(progressOf(600, 705, 750), 0);
// The bell beside each prayer
const st = (on, type = 'message') => ({ on, type, min: 5 });
assert.equal(bellState({ on: true, adhan: st(true), before: st(false), iqama: st(true) }, false), 'msg');
assert.equal(bellState({ on: true, adhan: st(true, 'adhan'), before: st(false), iqama: st(true) }, false), 'sound');
assert.equal(bellState({ on: true, adhan: st(false, 'adhan'), before: st(false), iqama: st(true) }, false), 'msg', 'a sound on a step that is off does not count');
assert.equal(bellState({ on: true, adhan: st(true, 'adhan'), before: st(false), iqama: st(false) }, true), 'off', 'everything muted');
assert.equal(bellState({ on: false, adhan: st(true, 'adhan'), before: st(true), iqama: st(true) }, false), 'off');
assert.equal(bellState({ on: true, adhan: st(false), before: st(false), iqama: st(false) }, false), 'off', 'no step on');
assert.equal(bellState({ on: true, before: st(true, 'beep'), times: [] }, false, true), 'sound', "Jumu'ah: the step before the khutbah");
const dy = (date, max, pop, kind = 'clear') => ({ date, max, pop, kind });
assert.equal(dayName('2026-11-12'), 'Thursday');
assert.equal(outlook([dy('2026-11-11', 55, 10), dy('2026-11-12', 48, 70, 'rain'), dy('2026-11-13', 46, 20)], 'F'), 'Next two days: turning colder, rain tomorrow.');
assert.equal(outlook([dy('2026-11-11', 55, 10), dy('2026-11-12', 56, 10), dy('2026-11-13', 58, 60, 'rain')], 'F'), 'Next two days: staying mild, rain Friday.');
assert.equal(outlook([dy('2026-11-11', 20, 0), dy('2026-11-12', 24, 0), dy('2026-11-13', 25, 0)], 'C'), 'Next two days: turning warmer, mostly dry.');
assert.equal(outlook([dy('2026-11-11', 20, 0)], 'C'), '');
const five = [312, 700, 860, 1000, 1090].map((adhan, i) => ({ key: PRAYERS[i], adhan, iqama: adhan + 20 }));
assert.deepEqual([399, 400, 699, 700, 999, 1000, 1089, 1090].map(n => cardWindow(n, five, 400)), [null, 'morning', 'morning', null, null, 'evening', 'evening', null]);
// Burn-in shift: a step every 2 minutes on a 9-point path (an 18-minute cycle), up to 4 px from centre, or 6 px on a dark screen
const path = Array.from({ length: 10 }, (_, i) => burnShift(i * 120));
assert.deepEqual(path[0], [0, 0]); assert.deepEqual(path[9], [0, 0]);
assert.deepEqual(burnShift(119), [0, 0]); assert.deepEqual(burnShift(120), [4, 0]); assert.deepEqual(burnShift(120, 6), [6, 0]);
assert.ok(path.every(([x, y]) => Math.abs(x) <= 4 && Math.abs(y) <= 4) && new Set(path.slice(0, 9).map(String)).size === 9);
assert.ok(Array.from({ length: 9 }, (_, i) => burnShift(i * 120, 6)).every(([x, y]) => Math.abs(x) <= 6 && Math.abs(y) <= 6));
// Weather at the next prayer, from hourly rows starting at the current hour
const hrs = [[true, 11, 45, 61, 80], [true, 12, 44, 3, 40], [true, 13, 46, 2, 5], [false, 5, 30, 71, 70]].map(([today, h, temp, code, pop]) => ({ today, min: h * 60, temp, code, pop }));
assert.deepEqual(prayerWeather(hrs, 703), { temp: 45, words: 'rain likely', pop: 80 });
assert.deepEqual(prayerWeather(hrs, 750), { temp: 44, words: 'chance of rain', pop: 40 });
assert.deepEqual(prayerWeather(hrs, 790), { temp: 46, words: 'partly cloudy', pop: null });
assert.deepEqual(prayerWeather(hrs, 1440 + 329), { temp: 30, words: 'snow likely', pop: 70 }, 'tomorrow Fajr uses tomorrow’s hour');
assert.equal(prayerWeather(hrs, 1200), null, 'no forecast hour, no line');

// Warning end times, in the place's zone (New York, UTC-5 in November)
const nov17 = new Date('2026-11-17T15:00:00Z');
assert.equal(untilText('2026-11-17T19:00:00-05:00', nov17, 'America/New_York'), 'until 7:00 PM');
assert.equal(untilText('2026-11-18T13:00:00-05:00', nov17, 'America/New_York'), 'until 1:00 PM Wed');
assert.equal(untilText(null, nov17, 'America/New_York'), 'until further notice');

// /api/alerts: picks real, current alerts, most severe first, one per event; caches; outside the US and failures give []
const nwsF = (event, severity, ends, extra = {}) => ({ properties: { status: 'Actual', messageType: 'Alert', event, severity, ends, senderName: 'NWS Mount Holly NJ', ...extra } });
const feats = [nwsF('Wind Advisory', 'Moderate', '2026-11-17T23:00:00-05:00'), nwsF('Winter Storm Warning', 'Severe', '2026-11-18T19:00:00-05:00'),
  nwsF('Wind Advisory', 'Moderate', '2026-11-17T21:00:00-05:00'), nwsF('Test Message', 'Minor', null, { status: 'Test' }),
  nwsF('Frost Advisory', 'Minor', '2026-11-17T08:00:00-05:00'), nwsF('Flood Watch', 'Severe', null, { messageType: 'Cancel' })];
assert.deepEqual(pickAlerts(feats, nov17.getTime()).map(a => a.event), ['Winter Storm Warning', 'Wind Advisory']);
assert.equal(pickAlerts(feats, nov17.getTime())[1].until, '2026-11-17T23:00:00-05:00', 'the later-ending copy of a repeated advisory');
assert.deepEqual(pickAlerts([nwsF('Wind Advisory', 'Moderate', null, { description: ' * WHAT...Gusts to 50 mph. ', instruction: undefined })], nov17.getTime()).map(a => [a.text, a.todo]), [['* WHAT...Gusts to 50 mph.', '']], 'the NWS text comes through, trimmed; a missing part is empty');
{
  const store = new Map(), cache = { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r); } };
  let calls = 0, asked = null;
  const nws = async (u, o) => { calls++; asked = [u, o.headers['user-agent']]; return new Response(JSON.stringify({ features: feats })); };
  const ask = (q, get = nws) => alertsHandle('https://x.test/api/alerts' + q, cache, get, nov17.getTime()).then(async r => [r.status, await r.json()]);
  assert.equal((await ask(''))[0], 400);
  const [st, body] = await ask('?lat=40.3841&lng=-74.5633');
  assert.equal(st, 200); assert.equal(body.alerts.length, 2);
  assert.equal(asked[0], 'https://api.weather.gov/alerts/active?point=40.38,-74.56'); assert.ok(asked[1].includes('salahhub'), 'NWS gets a named User-Agent');
  await ask('?lat=40.38&lng=-74.56'); assert.equal(calls, 1, 'second ask in 5 minutes comes from the cache');
  assert.deepEqual((await ask('?lat=51.5&lng=-0.12', async () => new Response('{}', { status: 400 })))[1], { alerts: [], outside: true });
  const quiet = console.error; console.error = () => {};
  assert.deepEqual((await ask('?lat=1&lng=1', async () => { throw new Error('offline'); }))[1], { alerts: [], unavailable: true });
  console.error = quiet;
}
// /api/feedback: checks the form, sends one email through Resend with the screenshot attached, limits bursts
{
  const store = new Map(), cache = { match: async (k) => store.get(k.url)?.clone(), put: async (k, r) => { store.set(k.url, r); } };
  const env = { RESEND_API_KEY: 're_test', FEEDBACK_TO: 'owner@example.com' };
  let sent = [];
  const resend = async (u, o) => { sent.push([u, o.headers.authorization, JSON.parse(o.body)]); return new Response('{"id":"1"}'); };
  const post = (fields, e = env, send = resend, ip = '1.2.3.4') => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return feedbackHandle(new Request('https://x.test/api/feedback', { method: 'POST', body: fd, headers: { 'cf-connecting-ip': ip } }), e, cache, send).then(async r => [r.status, await r.json()]);
  };
  const png = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], 's.png', { type: 'image/png' });
  assert.equal((await post({ kind: 'problem', message: 'x' }, {}))[0], 503, 'not set up until the key and address are added');
  assert.equal((await post({ kind: 'problem', message: '  ' }))[0], 400, 'a message is needed');
  assert.equal((await post({ kind: 'nonsense', message: 'x' }))[0], 400);
  assert.equal((await post({ kind: 'idea', message: 'x', contact: 'not an email' }))[0], 400);
  assert.equal((await post({ kind: 'idea', message: 'x', screenshot: new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }) }))[0], 400, 'only PNG, JPEG or WebP');
  assert.deepEqual(await post({ kind: 'idea', message: 'x', website: 'http://spam' }), [200, { ok: true }]); assert.equal(sent.length, 0, 'the honeypot sends nothing');
  const [st] = await post({ kind: 'problem', message: 'No sound at Asr\nOn the Fire tablet', contact: 'me@example.com', details: JSON.stringify({ version: 'iqama-v35', 'bad key!': 'x', look: 'paper', nested: { a: 1 } }), screenshot: png });
  assert.equal(st, 200); assert.equal(sent.length, 1);
  const [url, auth, mail] = sent[0];
  assert.equal(url, 'https://api.resend.com/emails'); assert.equal(auth, 'Bearer re_test');
  assert.deepEqual(mail.to, ['owner@example.com']); assert.equal(mail.reply_to, 'me@example.com');
  assert.equal(mail.subject, 'Iqama Times feedback: No sound at Asr');
  assert.equal(mail.attachments[0].filename, 'screenshot.png'); assert.equal(mail.attachments[0].content, Buffer.from([137, 80, 78, 71, 1, 2, 3]).toString('base64'));
  assert.ok(mail.text.includes('version: iqama-v35') && mail.text.includes('look: paper') && !mail.text.includes('bad key') && !mail.text.includes('nested'), 'only plain details are kept');
  assert.ok(!mail.html.includes('<script') && (await post({ kind: 'other', message: '<script>x</script>' }, env, resend, '9.9.9.9'))[0] === 200 && sent.at(-1)[2].html.includes('&lt;script&gt;'), 'the message is escaped in the email');
  for (let i = 0; i < 4; i++) await post({ kind: 'idea', message: `more ${i}` });
  assert.equal((await post({ kind: 'idea', message: 'one too many' }))[0], 429, 'at most 5 an hour from one sender');
  const quiet = console.error; console.error = () => {};
  assert.equal((await post({ kind: 'idea', message: 'x' }, env, async () => new Response('bad', { status: 422 }), '5.5.5.5'))[0], 502);
  console.error = quiet;
}
// The moving sky: weather and time of day become the numbers the sky is drawn from
{
  const day = { now: 631, sunrise: 407, maghrib: 999 }, sky = (w, t = day, h = 7) => skyParams(w, t, h);
  const rain = (mm) => sky({ kind: 'rain', cloud: 70, sky: { rain: mm } }).rain;
  assert.deepEqual([rain(0), rain(.3), rain(1.2), rain(4), rain(12)], [.4, .3, .5, .75, 1], 'rain strength follows mm an hour (drizzle, light, moderate, heavy)');
  assert.equal(sky({ kind: 'storm', sky: { rain: .2 } }).rain, .8, 'a storm always rains hard');
  assert.equal(sky({ kind: 'rain', cloud: 30 }).cover, .85, 'rain means a mostly covered sky whatever the cloud figure says');
  assert.equal(sky({ kind: 'clear', cloud: 0 }).cover, 0);
  assert.equal(sky({ kind: 'snow', sky: { snow: 3 } }).snow, 1);
  assert.equal(sky({ kind: 'fog' }).fog, .8); assert.equal(sky({ kind: 'clear', vis: 600 }).fog, .5);
  assert.equal(sky({ kind: 'clear', dir: 270, sky: { wind: 40 } }).wind, 1, 'a west wind (from 270°) blows the rain to the right, full lean at 40 km/h');
  assert.equal(sky({ kind: 'clear', dir: 90, sky: { wind: 20 } }).wind, -.5);
  const noon = sky({ kind: 'clear' }, { ...day, now: 703 });
  assert.ok(noon.sun[1] > .89 && noon.day === 1 && !noon.night && noon.dawn === 0, 'midday: sun high, full day');
  const night = sky({ kind: 'clear' }, { ...day, now: 1270 });
  assert.ok(night.night && night.sun === null && night.day === 0);
  assert.ok(sky({ kind: 'clear' }, { ...day, now: 1000 }).night, 'night begins at Maghrib, when the realistic sky turns the page dark');
  assert.ok(sky({ kind: 'clear' }, { ...day, now: 380 }).dawn > .5 && sky({ kind: 'clear' }, { ...day, now: 990 }).dawn > .5, 'warm light around sunrise and Maghrib');
  assert.equal(sky(null).kind, 'plain', 'no weather yet: a plain sky');
  assert.ok(Math.abs(sky({ kind: 'clear' }, day, 15).moon - .49) < .02 && sky({ kind: 'clear' }, day, 1).moon < .03, 'the moon follows the Hijri day');
}
const { renderTimes } = await import('../clocks.js');
const tm = (now, sec) => renderTimes({ sec, now, rows: five, sunrise: 400, next: nextEvent(five, 313, now, 400), tomorrowFajr: five[0], card: null });
assert.match(tm(340, 340 * 60), /sh-nm">Sunrise<[\s\S]*sh-kind">in</, 'sunrise countdown after the Fajr iqama'); // the board draws the name and "in" as separate elements
// from 15 minutes out the countdown sits on a highlighter mark; in the last 3 minutes the mark blinks (clocks.js soon())
assert.ok(tm(390, 390 * 60).includes('ck-hl') && !tm(390, 390 * 60).includes('ck-blink') && tm(398, 398 * 60).includes('ck-blink') && !tm(340, 340 * 60).includes('ck-hl'), 'the mark from 15 minutes out, blinking in the last 3');
assert.deepEqual(nextEvent(rows, 313, 350, 400), { key: 'sunrise', kind: '', at: 400 });
assert.deepEqual(nextEvent(rows, 313, 320, 400), { key: 'fajr', kind: 'iqama', at: 345 });
assert.deepEqual(nextEvent(rows, 313, 400, 400), { key: 'isha', kind: 'adhan', at: 1090 });
assert.deepEqual(nextEvent(rows, 313, 1100), { key: 'fajr', kind: 'adhan', at: 1753 });

// Distance rule for showing ISCJ iqama times (40 km)
const iscj = { lat: 40.384, lng: -74.563 };
assert.ok(km(iscj, { lat: 40.518, lng: -74.412 }) < 40, 'Edison is near ISCJ');
assert.ok(km(iscj, { lat: 40.713, lng: -74.006 }) > 40, 'Manhattan is not near ISCJ');
assert.ok(Math.abs(km({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.2) < 0.5);

// Per-prayer alerts: Dhuhr adhan 11:40, iqama 12:00; adhan recording, beep 10 min before adhan, message 5 min before iqama
const dhuhr = [{ key: 'dhuhr', adhan: 700, iqama: 720 }];
const cfg = { dhuhr: { on: true, adhan: 'adhan', before: { type: 'beep', min: 10 }, iqama: { type: 'message', min: 5 } } };
const tick = (rows, c, min) => alertsBetween(rows, c, min * 60 - 1, min * 60);
assert.deepEqual(tick(dhuhr, cfg, 690), [{ kind: 'before', key: 'dhuhr', type: 'beep', min: 10 }]);
assert.deepEqual(tick(dhuhr, cfg, 700), [{ kind: 'adhan', key: 'dhuhr', type: 'adhan', min: undefined }]);
assert.deepEqual(tick(dhuhr, cfg, 715), [{ kind: 'iqama', key: 'dhuhr', type: 'message', min: 5 }]);
assert.deepEqual(alertsBetween(dhuhr, cfg, 0, 700 * 60 + 100), [], 'stale alerts are dropped');
assert.deepEqual(tick(dhuhr, { dhuhr: { ...cfg.dhuhr, on: false } }, 700), [], 'prayer switched off');
assert.deepEqual(tick(dhuhr, { dhuhr: { ...cfg.dhuhr, adhan: 'off' } }, 700), [], 'alert type off');
assert.deepEqual(tick([{ key: 'isha', adhan: 1100, iqama: null }], { isha: cfg.dhuhr }, 1095), [], 'no iqama alert without an iqama time');
assert.deepEqual(tick(dhuhr, {}, 690), [], 'no settings for the prayer');
// Jumu'ah: only a "before" alert, keyed like any other row
assert.deepEqual(tick([{ key: 'jumuah', adhan: 720, iqama: null }], { jumuah: { on: true, before: { type: 'message', min: 15 } } }, 705), [{ kind: 'before', key: 'jumuah', type: 'message', min: 15 }]);

// Each alert step has its own switch and sound; saves from before that are read as they behaved
{
  const steps = { dhuhr: { on: true, adhan: { on: true, type: 'makkah' }, before: { on: false, type: 'beep', min: 10 }, iqama: { on: true, type: 'aqsa', min: 5 } } };
  assert.deepEqual(tick(dhuhr, steps, 700), [{ kind: 'adhan', key: 'dhuhr', type: 'makkah', min: undefined }], 'a named recording at adhan');
  assert.deepEqual(tick(dhuhr, steps, 690), [], 'a step switched off keeps its sound but does not fire');
  assert.deepEqual(tick(dhuhr, steps, 715), [{ kind: 'iqama', key: 'dhuhr', type: 'aqsa', min: 5 }]);
  const sounds = ['message', 'beep', 'adhan', 'makkah'], def = { on: false, type: 'beep', min: 10 };
  assert.deepEqual(cleanStep('adhan', { on: true, type: 'message' }, sounds, false), { on: true, type: 'adhan' }, 'old adhan setting: a bare type');
  assert.deepEqual(cleanStep('off', { on: true, type: 'message' }, sounds, false), { on: false, type: 'message' }, 'old adhan setting: off');
  assert.deepEqual(cleanStep({ type: 'off', min: 20 }, def, sounds, true), { on: false, type: 'beep', min: 20 }, 'old step: off keeps its minutes');
  assert.deepEqual(cleanStep({ type: 'message', min: 7 }, def, sounds, true), { on: true, type: 'message', min: 7 }, 'old step: a type meant on');
  assert.deepEqual(cleanStep({ on: false, type: 'makkah', min: 3 }, def, sounds, true), { on: false, type: 'makkah', min: 3 });
  assert.deepEqual(cleanStep({ on: true, type: 'nonsense', min: 99 }, def, sounds, true), { on: true, type: 'beep', min: 10 }, 'unknown sound and minutes fall back');
  assert.deepEqual(cleanStep(null, def, sounds, true), def);
}

// Quran player: catalogue, search, queue, saved state and playlists
{
  const Q = await import('../quran-logic.js');
  const suwar = { suwar: [{ id: 1, name: 'Al-Fatihah ', makkia: 1 }, { id: 2, name: 'Al-Baqarah ', makkia: 0 }, { id: 18, name: 'Al-Kahf', makkia: 1 }, { id: 114, name: 'An-Nas', makkia: 1 }] };
  const reciters = { reciters: [
    { id: 102, name: 'Maher Al Meaqli', letter: 'M', moshaf: [
      { id: 102, name: "Rewayat Hafs A'n Assem - Murattal", rewaya_id: 1, server: 'https://cdn.example/maher/r1/', surah_list: '1,2,18,114' },
      { id: 133, name: "Rewayat Hafs A'n Assem - Almusshaf Al Mojawwad", rewaya_id: 1, server: 'http://cdn.example/maher/r3', surah_list: '18,1,1,999,x' }] },
    { id: 5, name: "Abdul'aziz Al-Ahmad", letter: 'A', moshaf: [{ id: 50, name: "Rewayat Warsh A'n Nafi' - Murattal", rewaya_id: 2, server: 'https://cdn.example/aziz/', surah_list: '2,114' }] },
    { id: 9, name: 'Nobody', letter: 'N', moshaf: [{ id: 90, name: 'Empty', rewaya_id: 1, server: '', surah_list: '1' }] }] };
  const riwayat = { riwayat: [{ id: 1, name: "Rewayat Hafs A'n Assem" }, { id: 2, name: "Rewayat Warsh A'n Nafi'" }, { id: 3, name: 'Rewayat Khalaf' }] };
  const cat = Q.buildCatalog(suwar, reciters, riwayat);
  assert.deepEqual(cat.reciters.map(r => r.name), ["Abdul'aziz Al-Ahmad", 'Maher Al Meaqli'], 'sorted by name; a reciter with nothing playable is left out');
  assert.deepEqual(cat.riwayat, [{ id: 1, name: "Hafs A'n Assem", count: 2 }, { id: 2, name: "Warsh A'n Nafi'", count: 1 }], 'only riwayat that have a recitation');
  assert.deepEqual(cat.moshaf.get(133).surahs, [1, 18], 'surah list is cleaned and sorted');
  assert.equal(cat.moshaf.get(133).server, 'https://cdn.example/maher/r3/', 'https and a closing slash');
  assert.equal(cat.moshaf.get(102).style, "Hafs A'n Assem · Murattal");
  assert.equal(cat.surahs.get(1).name, 'Al-Fatihah');
  assert.deepEqual(Q.trackInfo(cat, '102:18'), { id: '102:18', n: 18, title: 'Al-Kahf', reciter: 'Maher Al Meaqli', style: "Hafs A'n Assem · Murattal", url: 'https://cdn.example/maher/r1/018.mp3' });
  assert.equal(Q.trackInfo(cat, '133:2'), null, 'a surah the recitation does not have');
  assert.equal(Q.trackInfo(cat, '7:1'), null);
  assert.deepEqual(Q.recitersFor(cat, 2).map(r => r.id), [5], 'riwayah filter');
  assert.deepEqual(Q.moshafOf(cat, cat.reciters[1], 1).map(m => m.id), [102, 133]);
  assert.deepEqual(Q.search(cat, 'abdulaziz').reciters.map(r => r.id), [5], 'search ignores apostrophes');
  assert.deepEqual(Q.search(cat, 'al fatiha').surahs.map(s => s.n), [1], 'search ignores hyphens and case');
  assert.deepEqual(Q.search(cat, '18').surahs.map(s => s.n), [18], 'search by surah number');
  assert.deepEqual(Q.search(cat, 'maher', 2).reciters, [], 'search respects the riwayah filter');
  assert.deepEqual(Q.search(cat, '  '), { reciters: [], surahs: [] });
  assert.deepEqual([0, 59.9, 61, 3600, 3725, NaN].map(Q.fmtTime), ['0:00', '0:59', '1:01', '1:00:00', '1:02:05', '0:00']);
  // a dropped connection: waits grow and stop growing; offline never gives up; a broken file is not retried for ever
  assert.deepEqual([-1, 0, 1, 2, 3, 4, 5, 9, NaN].map(Q.retryWait), [2, 2, 5, 10, 20, 30, 60, 60, 2]);
  assert.equal(Q.shouldRetry(2, 50, false), true, 'offline: keep waiting');
  assert.equal(Q.shouldRetry(2, 7, true), true);
  assert.equal(Q.shouldRetry(2, 8, true), false, 'network fault: give up after 8 tries');
  assert.equal(Q.shouldRetry(0, 3, true), true, 'a stall counts like a network fault');
  assert.equal(Q.shouldRetry(4, 0, true), true, 'a file that will not play: one more try');
  assert.equal(Q.shouldRetry(4, 1, true), false);
  assert.equal(Q.shouldRetry(3, 1, undefined), false, 'unknown connection state counts as online');
  // recitations kept on the device
  const sv = Q.cleanSaved({
    'https://server8.mp3quran.net/afs/001.mp3': { id: '102:1', title: '1. Al-Fatihah', sub: 'Afasy', bytes: 800000, at: 5, kind: 'played' },
    'https://cdn.mp3quran.net/x/002.mp3': { id: '102:2', bytes: 9e6, at: 1, kind: 'download' },
    'https://cdn.mp3quran.net/x/018.mp3': { id: '102:18', bytes: 4e6, at: 3, kind: 'weird' },
    'https://evil.example/001.mp3': { id: '102:1' }, 'https://cdn.mp3quran.net/x/003.mp3?a=1': { id: '102:3' },
    'https://cdn.mp3quran.net/x/004.mp3': { id: 'nope' },
  });
  assert.deepEqual(Object.keys(sv), ['https://server8.mp3quran.net/afs/001.mp3', 'https://cdn.mp3quran.net/x/002.mp3', 'https://cdn.mp3quran.net/x/018.mp3'], 'only mp3quran.net files with a track id');
  assert.equal(sv['https://cdn.mp3quran.net/x/018.mp3'].kind, 'played', 'an unknown kind counts as played');
  assert.deepEqual(Q.cleanSaved('junk'), {});
  const MB = 1e6;
  assert.deepEqual(Q.toEvict(sv, 5 * MB, 500 * MB, 300 * MB), [], 'room enough: nothing goes');
  assert.deepEqual(Q.toEvict(sv, 5 * MB, 304 * MB, 300 * MB), ['https://cdn.mp3quran.net/x/018.mp3'], 'longest unplayed first, and no more than needed');
  assert.deepEqual(Q.toEvict(sv, 5 * MB, 300 * MB, 300 * MB), ['https://cdn.mp3quran.net/x/018.mp3', 'https://server8.mp3quran.net/afs/001.mp3'], 'a download is never removed');
  assert.deepEqual(Q.toEvict(sv, 5 * MB, 300 * MB, 300 * MB, ['https://cdn.mp3quran.net/x/018.mp3']), ['https://server8.mp3quran.net/afs/001.mp3'], 'what is playing is kept');
  // every adhan recording the app offers is one the service worker keeps for offline
  {
    const { readFileSync, readdirSync } = await import('node:fs');
    const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
    const kept = JSON.parse(/const ADHAN_FILES = (\[[^\]]*\])/.exec(sw)[1].replace(/'/g, '"'));
    const onDisk = readdirSync(new URL('../audio/', import.meta.url)).filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4));
    assert.deepEqual([...kept].sort(), onDisk.sort(), 'sw.js ADHAN_FILES matches audio/');
  }

  const ids = ['102:1', '102:2', '102:18', '102:114'];
  let q = Q.makeQueue(ids, 2);
  assert.equal(Q.current(q), '102:18');
  assert.deepEqual([Q.stepPos(q, 1, 'off'), Q.stepPos(q, -1, 'off')], [3, 1]);
  q.pos = 3;
  assert.deepEqual([Q.stepPos(q, 1, 'off'), Q.stepPos(q, 1, 'one'), Q.stepPos(q, 1, 'all')], [-1, -1, 0], 'Next stops at the end unless the list repeats');
  assert.deepEqual([Q.afterEnd(q, 'off'), Q.afterEnd(q, 'one'), Q.afterEnd(q, 'all')], [-1, 'again', 0]);
  q.pos = 0;
  assert.deepEqual([Q.stepPos(q, -1, 'off'), Q.stepPos(q, -1, 'all')], [-1, 3]);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sh = Q.makeQueue(ids, 2, true, rnd);
  assert.equal(Q.current(sh), '102:18', 'shuffle starts on the chosen surah');
  assert.deepEqual([...sh.order].sort(), [0, 1, 2, 3], 'shuffle plays every surah once');
  sh.pos = 2;
  const un = Q.reshuffle(sh, false);
  assert.deepEqual([un.order, Q.current(un)], [[0, 1, 2, 3], Q.current(sh)], 'turning shuffle off keeps the surah that is playing');
  assert.equal(Q.current(Q.makeQueue([], 0)), null);

  const blank = Q.cleanStore(null);
  assert.deepEqual(blank, { v: 2, last: null, riwaya: 'all', favR: [], favT: [], lists: [], repeat: 'off', shuffle: false, vol: 1, rate: 1 });
  const old = Q.cleanStore({ reciter: "Maher Al Meaqli (Rewayat Hafs A'n Assem - Almusshaf Al Mojawwad)", surah: 18 });
  assert.deepEqual(old.legacy, { reciter: "Maher Al Meaqli (Rewayat Hafs A'n Assem - Almusshaf Al Mojawwad)", surah: 18 }, 'the old player\'s save is kept for carrying over');
  assert.equal(Q.legacyTrack(cat, old.legacy), '133:18');
  assert.equal(Q.legacyTrack(cat, { reciter: "Abdul'aziz Al-Ahmad", surah: 2 }), '50:2');
  assert.equal(Q.legacyTrack(cat, { reciter: 'Gone', surah: 2 }), null);
  const dirty = Q.cleanStore({ last: { id: '102:18', t: 93.5, title: 'x', sub: 'y', url: 'javascript:alert(1)', queue: ['102:1', 'bad', '102:1'] }, riwaya: 2, favR: [102, '5', 102], favT: ['102:18', 7, '102:18'],
    lists: [{ id: 'a', name: '  Morning   set ', tracks: ['102:1', 'nope'] }, { id: 'b', name: '   ' }, null], repeat: 'forever', shuffle: 'yes', vol: 4, rate: 9 });
  assert.deepEqual(dirty, { v: 2, last: { id: '102:18', t: 93.5, title: 'x', sub: 'y', queue: ['102:1'], url: '' }, riwaya: 2, favR: [102], favT: ['102:18'],
    lists: [{ id: 'a', name: 'Morning set', tracks: ['102:1'] }], repeat: 'off', shuffle: false, vol: 1, rate: 1 }, 'anything malformed falls back');
  assert.equal(Q.cleanStore({ last: { id: '102:18', url: 'https://cdn.example/maher/r1/018.mp3' } }).last.url, 'https://cdn.example/maher/r1/018.mp3');
  assert.deepEqual([Q.nextRepeat('off'), Q.nextRepeat('all'), Q.nextRepeat('one')], ['all', 'one', 'off']);
  assert.deepEqual([Q.toggle([1, 2], 2), Q.toggle([1], 2)], [[1], [1, 2]]);

  let lists = Q.addList([], '  Friday  ', 'p1');
  assert.deepEqual(lists, [{ id: 'p1', name: 'Friday', tracks: [] }]);
  assert.equal(Q.addList(lists, '   '), lists, 'a playlist needs a name');
  lists = Q.addToList(Q.addToList(Q.addToList(lists, 'p1', '102:18'), 'p1', '102:1'), 'p1', '102:18');
  assert.deepEqual(lists[0].tracks, ['102:18', '102:1'], 'no surah twice in one playlist');
  lists = Q.addToList(lists, 'p1', '50:114');
  assert.deepEqual(Q.moveInList(lists, 'p1', 2, 0)[0].tracks, ['50:114', '102:18', '102:1']);
  assert.equal(Q.moveInList(lists, 'p1', 0, 9)[0], lists[0], 'a move off the end is ignored');
  assert.deepEqual(Q.setListOrder(lists, 'p1', ['102:1', '50:114', '102:18'])[0].tracks, ['102:1', '50:114', '102:18']);
  assert.equal(Q.setListOrder(lists, 'p1', ['102:1', '102:1', '102:18'])[0], lists[0], 'a reorder must keep the same surahs');
  assert.deepEqual(Q.removeFromList(lists, 'p1', '102:18')[0].tracks, ['102:1', '50:114']);
  assert.equal(Q.renameList(lists, 'p1', 'Jumu’ah')[0].name, 'Jumu’ah');
  assert.equal(Q.renameList(lists, 'p1', ' ')[0].name, 'Friday');
  assert.deepEqual(Q.removeList(lists, 'p1'), []);
  assert.equal(lists[0].tracks.length, 3, 'the earlier list is never changed in place');
}

// Weather labels
assert.deepEqual([0, 2.9, 3, 7.9, 10, 11].map(uvLevel), ['low', 'low', 'moderate', 'high', 'very high', 'extreme']);
assert.deepEqual([42, 51, 101, 151, 201, 301].map(aqiLevel), ['good', 'moderate', 'unhealthy for sensitive groups', 'unhealthy', 'very unhealthy', 'hazardous']);
assert.deepEqual([0, 44, 90, 200, 315, 359, -45].map(compass), ['N', 'NE', 'E', 'SSW', 'NW', 'N', 'NW']);

// Weather codes
assert.deepEqual(weatherKind(63), { kind: 'rain', label: 'Rain' });
assert.equal(weatherKind(75).kind, 'snow');
assert.equal(weatherKind(999).kind, 'plain');
assert.equal(dayKind(73, 0.4, 6).kind, 'rain'); // a little snow on a rainy day is rain
assert.equal(dayKind(73, 5, 0.5).kind, 'snow');
assert.equal(dayKind(73, null, null).kind, 'snow');
assert.equal(dayKind(61, 9, 0).kind, 'rain');
// Adhkar set for the time of day (ISCJ, Nov 10): Fajr 5:21/5:45, sunrise 6:39, Dhuhr 11:42/12:30, Asr 2:24/2:45, Maghrib 4:45, Isha 6:03/8:00
const { SETS, pickSet } = await import('../adhkar.js');
const day = [{ adhan: 321, iqama: 345 }, { adhan: 702, iqama: 750 }, { adhan: 864, iqama: 885 }, { adhan: 1005, iqama: 1005 }, { adhan: 1083, iqama: 1200 }];
const at = (h, m, wd = 'Tue') => pickSet(h * 60 + m, day, 399, wd).key;
assert.equal(at(5, 30), 'adhan', 'between Fajr adhan and iqama');
assert.equal(at(5, 50), 'prayer', 'just after Fajr iqama');
assert.equal(at(6, 10), 'morning');
assert.equal(at(9, 0), 'general');
assert.equal(at(9, 0, 'Fri'), 'friday');
assert.equal(at(14, 30), 'adhan', 'between Asr adhan and iqama');
assert.equal(at(15, 30), 'evening');
assert.equal(at(16, 50), 'prayer', 'Maghrib iqama is on time');
assert.equal(at(18, 30), 'adhan', 'between Isha adhan and iqama');
assert.equal(at(21, 0), 'sleep');
assert.equal(at(3, 0), 'sleep');
assert.equal(pickSet(600, day.map(r => ({ ...r, iqama: null })), 399, 'Tue').key, 'general', 'no iqama times set');
// Today-tab duas point into hisn-text.json by chapter and entry. If the monthly copy ever reorders entries, this fails
// (the workflow runs it again after fetching), so the card can never show the wrong dua.
{
  const { fillSets } = await import('../adhkar.js');
  const { readFileSync } = await import('node:fs');
  fillSets(JSON.parse(readFileSync(new URL('../hisn-text.json', import.meta.url), 'utf8')).chapters);
  const bare = (s) => s.replace(/[ً-ٰٟۖ-ۭـؐ-ؚ]/g, '').replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
  const KEY = {
    '15.3': 'رب هذه الدعوة', '15.4': 'بين الاذان والاقامة', '25.0': 'انت السلام', '25.3': 'والحمد لله، والله اكبر',
    '27.3': 'اللهم بك اصبحنا', '27.11': 'لا يضر مع اسمه', '27.16': 'سبحان الله وبحمده', '27.18': 'وحده لا شريك له', '27.22': 'بكلمات الله التامات',
    '27.9': 'العفو والعافية', '28.6': 'باسمك اللهم اموت', '28.1': 'الحي القيوم', '28.7': 'والله اكبر', '23.0': 'صل علي محمد', '23.1': 'صل علي محمد',
    '24.2': 'ظلمت نفسي', '117.0': 'اتنا في الدنيا حسنة', '34.1': 'الهم والحزن', '130.2': 'كلمتان خفيفتان',
  };
  for (const [k, s] of Object.entries(SETS)) for (const it of s.items) {
    const key = KEY[`${it.ch}.${it.i}`];
    assert.ok(key, `adhkar ${k}: Hisn ${it.ch}.${it.i} has a key phrase in this check`);
    assert.ok(bare(it.ar).includes(bare(key)) && it.en && it.src.startsWith(`Hisn al-Muslim, ch. ${it.ch}`), `adhkar ${k}: Hisn ${it.ch}.${it.i} is still the expected dua`);
  }
}
// Hisn al-Muslim text: fields are matched by meaning, text is copied untouched, http audio links become https
{
  const raw = { ID: 1, ARABIC_TEXT: ' \u0627\u0644\u062d\u0645\u062f ', LANGUAGE_ARABIC_TRANSLATED_TEXT: 'Alhamdu', TRANSLATED_TEXT: 'Praise be.', REPEAT: '3', AUDIO: 'http://www.hisnmuslim.com/audio/ar/1.mp3' };
  assert.deepEqual(normalizeItem(raw), { ar: '\u0627\u0644\u062d\u0645\u062f', tr: 'Alhamdu', en: 'Praise be.', n: 3, audio: 'https://www.hisnmuslim.com/audio/ar/1.mp3' });
  assert.deepEqual(normalizeItem({ ARABIC_TEXT: 'a', TRANSLATED_TEXT: 'b' }), { ar: 'a', tr: '', en: 'b' }, 'no repeat or audio is fine');
  assert.equal(normalizeChapter({ 'Any chapter title': [raw, { ID: 2 }] }).length, 1, 'empty entries are dropped, the key is ignored');
  const ch = (n) => ({ items: Array.from({ length: n }, () => ({ ar: 'x', tr: '', en: 'y' })) });
  assert.throws(() => check({ 1: ch(3) }), /does not look as expected/, 'a bad download is refused');
  assert.equal(check({ 1: ch(3), 2: ch(2) }, { chapters: 2, duas: 5 }).duas, 5);
}
// A raw line break inside a text value (as in one of their chapter files) is read, and kept as a line break
{
  const bad = '{"What to say when\nyou feel frightened": [{"ARABIC_TEXT": "a\nb\tc", "TRANSLATED_TEXT": "say \\"hi\\"\r\nthere", "REPEAT": 1}]}';
  assert.throws(() => JSON.parse(bad), 'strict JSON refuses it');
  const item = normalizeChapter(parseLoose(bad))[0];
  assert.deepEqual([item.ar, item.en], ['a\nb\tc', 'say "hi"\nthere']);
  assert.deepEqual(parseLoose('\uFEFF{"a": [1, 2]}'), { a: [1, 2] }, 'valid JSON and a leading byte order mark are unchanged');
  assert.throws(() => parseLoose('{"a": [1, }'), 'real breakage still fails');
}
// Other slips in their JSON: a backslash that escapes nothing, a trailing comma. Real escapes and text stay as they are.
{
  assert.deepEqual(parseLoose('{"a": ["it\\\'s", "x\\\\ny", "q\\"z\\u0041"],}'), { a: ["it's", 'x\\ny', 'q"zA'] });
  assert.equal(repairJson('{"k": "a, ]"}'), '{"k": "a, ]"}', 'a comma inside a string is left alone');
  assert.throws(() => parseLoose('{"a": "' + 'x'.repeat(200) + '", "b": tru}'), /tru.*\(strict: /, 'the error shows the broken part and the strict error');
}
// A chapter whose title lost its closing quote (chapter 126) is read from the list inside it
{
  const broken = '{\r\n\t"What to say when you feel frightened:\r\n\t[\r\n\t\t{\r\n\t\t\t"ID": 245,\r\n\t\t\t"ARABIC_TEXT": "a",\r\n\t\t\t"TRANSLATED_TEXT": "b[1]",\r\n\t\t\t"REPEAT": 3\r\n\t\t}\r\n\t]\r\n}';
  assert.throws(() => parseLoose(broken), 'the whole file cannot be read');
  const items = normalizeChapter(parseChapterJson(broken));
  assert.deepEqual(items, [{ ar: 'a', tr: '', en: 'b[1]', n: 3 }]);
  assert.throws(() => parseChapterJson('{"no list here": 5'), 'a file with no list still fails');
}
console.log('selfcheck ok');

// Friday: Dhuhr shows as Jumu'ah only when khutbah times are known, and counts down to the first khutbah
{
  const rows = PRAYERS.map((key, i) => ({ key, adhan: 300 + i * 180, iqama: 330 + i * 180 }));
  assert.equal(fridayRows(rows, 'Thu', [720]), rows, 'not on other days');
  assert.equal(fridayRows(rows, 'Fri', []), rows, 'not without khutbah times');
  const f = fridayRows(rows, 'Fri', [790, 720]);
  assert.deepEqual(f[1], { key: 'dhuhr', adhan: 480, iqama: 720, jumuah: [720, 790] });
  assert.deepEqual(nextEvent(f, 300, 600, 400), { key: 'dhuhr', kind: 'iqama', at: 720 }, 'counts down to the first khutbah');
  assert.equal(rows[1].iqama, 510, 'the day rows used for alerts are left alone');
}
// Friday with several khutbahs: the countdown goes from one to the next, until Asr
{
  const week = (...k) => fridayRows([{ key: 'fajr', adhan: 333, iqama: 360 }, { key: 'dhuhr', adhan: 704, iqama: 750 }, { key: 'asr', adhan: 856, iqama: 885 }, { key: 'maghrib', adhan: 1000, iqama: 1000 }, { key: 'isha', adhan: 1075, iqama: 1200 }], 'Fri', k);
  const f2 = week(720, 790);
  assert.deepEqual(nextEvent(f2, 333, 700, 400), { key: 'dhuhr', kind: 'adhan', at: 704 }, 'the adhan first');
  assert.deepEqual(nextEvent(f2, 333, 710, 400), { key: 'dhuhr', kind: 'iqama', at: 720, n: 1, of: 2 }, 'then the first khutbah');
  assert.deepEqual(nextEvent(f2, 333, 725, 400), { key: 'dhuhr', kind: 'iqama', at: 790, n: 2, of: 2 }, 'then the second');
  assert.deepEqual(nextEvent(f2, 333, 800, 400), { key: 'asr', kind: 'adhan', at: 856 }, 'then Asr');
  assert.deepEqual(nextEvent(week(720, 790, 840), 333, 800, 400), { key: 'dhuhr', kind: 'iqama', at: 840, n: 3, of: 3 }, 'any number of khutbahs');
  assert.deepEqual(nextEvent(week(720), 333, 710, 400), { key: 'dhuhr', kind: 'iqama', at: 720 }, 'one khutbah: as before, no numbering');
  assert.deepEqual(nextEvent(week(720, 900), 333, 725, 400), { key: 'asr', kind: 'adhan', at: 856 }, 'a later khutbah at or after Asr is not counted');
  assert.deepEqual(nextEvent(week(900), 333, 710, 400), { key: 'dhuhr', kind: 'iqama', at: 900 }, 'a single khutbah is counted wherever it is, as before');
  // the board says which khutbah, and dims the ones that have passed
  const t2 = (now) => renderTimes({ sec: now * 60, now, rows: f2, sunrise: 400, next: nextEvent(f2, 333, now, 400), tomorrowFajr: f2[0], jumuah: [720, 790], card: null });
  assert.match(t2(725), /khutbah 2 of 2 in/, 'the heading names the khutbah');
  assert.match(t2(725), /sh-past">12:00/, 'the passed khutbah is dimmed');
  assert.doesNotMatch(t2(710), /sh-past/, 'nothing is dimmed before the first');
  assert.doesNotMatch(renderTimes({ sec: 710 * 60, now: 710, rows: week(720), sunrise: 400, next: nextEvent(week(720), 333, 710, 400), tomorrowFajr: f2[0], jumuah: [720], card: null }), /\d of \d/, 'one khutbah: no numbering');
  // Jumu'ah alerts: one before each khutbah, and a message that says which
  const jrows = [{ key: 'jumuah', adhan: 720, iqama: null, n: 1, of: 2 }, { key: 'jumuah', adhan: 790, iqama: null, n: 2, of: 2 }];
  const jcfg = { jumuah: { on: true, before: { type: 'message', min: 15 } } };
  assert.deepEqual(tick(jrows, jcfg, 705), [{ kind: 'before', key: 'jumuah', type: 'message', min: 15, n: 1, of: 2 }]);
  assert.deepEqual(tick(jrows, jcfg, 775), [{ kind: 'before', key: 'jumuah', type: 'message', min: 15, n: 2, of: 2 }]);
  // the khutbah times a visitor types in: valid times only, in order, once each
  assert.deepEqual(cleanKhutbahTimes(['13:10', '12:00', '12:00', 'soon', null, '9:05']), ['09:05', '12:00', '13:10']);
  assert.deepEqual(cleanKhutbahTimes('12:00'), [], 'not a list: nothing');
  assert.equal(cleanKhutbahTimes(['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00']).length, 6, 'at most six');
}
console.log('friday ok');

// Playlist ids from the device must have the shape addList makes, since they are written into the page
{
  const { cleanStore, addList } = await import('../quran-logic.js');
  const ok = addList([], 'Mine')[0];
  assert.match(ok.id, /^[a-z0-9]{1,24}$/i);
  const kept = cleanStore({ lists: [ok, { id: '"><img src=x onerror=alert(1)>', name: 'Bad', tracks: [] }] }).lists;
  assert.deepEqual(kept.map(l => l.id), [ok.id], 'a playlist id that could break out of an attribute is dropped');
}
console.log('playlist ids ok');

// CSP reports: both browser formats are read, other report types are skipped
{
  const { summarize } = await import('../functions/api/csp-report.js');
  assert.deepEqual(summarize({ 'csp-report': { 'document-uri': 'https://x/', 'violated-directive': 'script-src', 'blocked-uri': 'inline' } }),
    [{ page: 'https://x/', directive: 'script-src', blocked: 'inline', where: '' }]);
  assert.deepEqual(summarize([{ type: 'deprecation', body: {} }, { type: 'csp-violation', body: { documentURL: 'https://x/iqama/', effectiveDirective: 'media-src', blockedURL: 'https://y/a.mp3', sourceFile: 'https://x/iqama/app.js', lineNumber: 9 } }]),
    [{ page: 'https://x/iqama/', directive: 'media-src', blocked: 'https://y/a.mp3', where: 'https://x/iqama/app.js:9' }]);
  assert.deepEqual(summarize(null), []);
}
console.log('csp reports ok');

// Brightness: bright by day, the chosen night level after Isha (or Maghrib) until sunrise; a hand-picked level lasts until the next switch
{
  const { isNight, dimLevel } = await import('../logic.js');
  const rows = [324, 702, 861, 1002, 1080].map((adhan, i) => ({ key: PRAYERS[i], adhan }));
  assert.deepEqual([300, 500, 1010, 1085].map(m => isNight(m, rows, 402, 'isha')), [true, false, false, true]);
  assert.deepEqual([1010, 1085].map(m => isNight(m, rows, 402, 'maghrib')), [true, true]);
  assert.equal(isNight(1300, rows, 402, 'off'), false);
  const s = { autoDim: 'isha', nightLevel: 3, level: 1 };
  assert.deepEqual([dimLevel(s, false), dimLevel(s, true)], [1, 3], 'By day is the day level, At night the night level');
  assert.equal(dimLevel(s, true, { level: 0, night: true }), 0, 'a level picked at night holds for that night');
  assert.equal(dimLevel(s, false, { level: 0, night: true }), 1, 'and ends at sunrise');
  assert.equal(dimLevel({ ...s, autoDim: 'off' }, true), 1, 'At night: Same as by day');
  assert.equal(dimLevel({ ...s, nightLevel: 4 }, true), 4, 'Black (no light)');
  const { fmtMins } = await import('../logic.js');
  assert.deepEqual([fmtMins(1286), fmtMins(60), fmtMins(59.2), fmtMins(0), fmtMins(3900)], ['22m', '1m', '1m', '0m', '1h 05m'], 'Show seconds off: whole minutes, rounded up');
}
console.log('brightness ok');

// Hijri date (Umm al-Qura) with a day shift, and adhan offsets
{
  const { hijri, cleanTune } = await import('../logic.js');
  assert.equal(hijri(2026, 2, 18), '1 Ramadan 1447');
  assert.equal(hijri(2026, 2, 18, -1), '29 Shaban 1447'); // Shaban 1447 has 29 days in Umm al-Qura
  assert.equal(hijri(2026, 3, 20), '1 Shawwal 1447');
  assert.deepEqual(cleanTune({ fajr: 2, dhuhr: 31, asr: 'x', isha: -3 }), { fajr: 2, dhuhr: 0, asr: 0, maghrib: 0, isha: -3 });
}
console.log('hijri and offsets ok');

// The Hijri day can begin at the Maghrib adhan
{
  const { hijriNow } = await import('../logic.js');
  assert.equal(hijriNow(2026, 2, 17, 0, true, 1000, 1060), '29 Shaban 1447', 'before Maghrib');
  assert.equal(hijriNow(2026, 2, 17, 0, true, 1061, 1060), '1 Ramadan 1447', 'after Maghrib the evening is the next Hijri day');
  assert.equal(hijriNow(2026, 2, 17, 0, false, 1061, 1060), '29 Shaban 1447', 'off: midnight');
}
console.log('hijri at maghrib ok');
{ // After the Isha iqama the sheet shows tomorrow; the clock and countdown stay on real time
  const { renderTimes: rt } = await import('../clocks.js');
  const mk = (f) => [['fajr', f, 360], ['dhuhr', 712, 750], ['asr', 871, 885], ['maghrib', 1001, 1001], ['isha', 1085, 1200]].map(([key, adhan, iqama]) => ({ key, adhan, iqama }));
  const todayRows = mk(328), tmrw = mk(329), now = 21 * 60 + 50, next = nextEvent(todayRows, 329, now);
  const base = { sec: now * 60 + 30, left: (1440 + 329 - now) * 60 - 30, now, rows: todayRows, sunrise: 410, next, tomorrowFajr: tmrw[0], card: null };
  const txt = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const late = txt(rt({ ...base, ahead: { rows: tmrw, sunrise: 411 } }));
  assert.match(late, /Tomorrow/, 'corner says Tomorrow');
  assert.match(late, / 5:29 /, 'table has tomorrow’s Fajr');
  assert.doesNotMatch(late, / 5:28 /, 'and not today’s');
  assert.match(late, /9:50/, 'big clock is still now');
  assert.match(late, /7 h 39 m/, 'countdown unchanged');
  assert.match(late, /Adhan 5:29 AM tomorrow/);
  assert.match(late, /Sunrise 6:51 AM/, 'tomorrow’s sunrise');
  assert.match(rt({ ...base, ahead: { rows: tmrw, sunrise: 411 } }), /is-next[^>]*>Fajr/, 'Fajr is the next prayer');
  const early = txt(rt(base));
  assert.doesNotMatch(early, /Tomorrow/, 'without ahead the sheet is today’s');
  // Thursday night: Friday's sheet carries Jumu'ah
  const fri = txt(rt({ ...base, ahead: { rows: fridayRows(tmrw, 'Fri', [720, 790]), sunrise: 411 } }));
  assert.match(fri, /Jumu’ah/);
  console.log('tomorrow sheet ok');
}
{ // A default iqama (the visitor's "minutes after adhan" for prayers with no known time) is labelled default
  const { renderTimes: rt } = await import('../clocks.js');
  const rows = [['fajr', 328, 338], ['dhuhr', 712, 722], ['asr', 871, 881], ['maghrib', 1001, 1011], ['isha', 1085, 1095]].map(([key, adhan, iqama]) => ({ key, adhan, iqama, def: true }));
  const h = rt({ sec: 300 * 60, left: 28 * 60, now: 300, rows, sunrise: 410, next: nextEvent(rows, 329, 300), tomorrowFajr: rows[0], card: null });
  assert.equal((h.match(/sh-def">default/g) || []).length, 5, 'every default iqama in the table is labelled');
  assert.match(h.replace(/<[^>]+>/g, ''), /Iqama 5:38 AM \(default\)/, 'and the line beside the countdown');
  console.log('default iqama ok');
}

// Quran artwork: Arabic surah names, colours that stay readable, and the drawings themselves
{
  const A = await import('../quran-art.js');
  assert.equal(A.SURAH_AR.length, 114, 'an Arabic name for every surah');
  assert.equal(A.SURAH_AR[17], 'الكهف'); assert.equal(A.SURAH_AR[113], 'الناس');
  const lum = (hex) => { const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const ink of A.ART_INKS) assert.ok((lum(A.ART_PAPER) + 0.05) / (lum(ink) + 0.05) >= 4.5, `paper reads on ${ink}`);
  assert.equal(A.artColor('Mishary Alafasy'), A.artColor('mishary alafasy'), 'a reciter keeps one colour');
  assert.ok(A.ART_INKS.includes(A.artColor('')) && A.ART_INKS.includes(A.artColor('Maher Al-Muaiqly')));
  assert.equal(new Set(['Mishary Alafasy', 'Abdulbasit Abdulsamad', 'Maher Al Meaqli', 'Saad Al-Ghamdi', 'Yasser Al-Dosari', 'Ahmad Al-Ajmy'].map(A.artColor)).size > 2, true, 'reciters are spread over the colours');
  assert.deepEqual(A.initial('Mishary Alafasy', 'مشاري العفاسي'), { ch: 'م', arabic: true });
  assert.deepEqual(A.initial('Mishary Alafasy', ''), { ch: 'M', arabic: false });
  assert.deepEqual(A.initial('', null), { ch: '#', arabic: false });
  const t = A.tileArt({ reciter: 'A <b> & "c"' });
  assert.ok(!t.includes('<b>') && t.includes('&lt;b&gt; &amp; &quot;c&quot;'), 'names are escaped');
  const s = A.starArt({ n: 18, reciter: 'Mishary Alafasy', title: '18. Al-Kahf' });
  assert.ok(s.startsWith('<svg') && s.endsWith('</svg>') && s.includes('الكهف') && s.includes('>18<') && s.includes('aria-label="18. Al-Kahf, Makki, Mishary Alafasy"'));
  assert.ok(!A.starArt({ n: 0 }).includes('direction="rtl"'), 'no name for a surah that does not exist');
  assert.deepEqual(A.arNames({ reciters: [{ id: '5', name: ' ماهر ' }, { id: 'x', name: 'y' }, { id: 6 }] }), { 5: 'ماهر' });
  assert.deepEqual(A.arNames(null), {});
  assert.equal([...Array(114)].filter((_, k) => !A.isMakki(k + 1)).length, 28, '28 Madani surahs');
  assert.ok(A.isMakki(18) && !A.isMakki(2) && !A.isMakki(110) && A.isMakki(1));
  assert.equal(A.isMakki(2, true), true, "mp3quran's flag wins when it is known");
  assert.ok(s.includes('Makki · مكية') && A.starArt({ n: 2 }).includes('Madani · مدنية'), 'the card says Makki or Madani');
  const cv = A.starArt({ n: 18, reciter: 'Mishary Alafasy', cover: true });
  const lowest = Math.max(...[...cv.matchAll(/<text[^>]* y="([\d.]+)"/g)].map(m => +m[1]));
  assert.ok(lowest <= 108, 'the cover keeps the foot clear for the timeline');
  assert.equal(A.paintingOf(18), 'art/kaaba.webp'); assert.equal(A.paintingOf(2), 'art/nabawi.webp'); assert.equal(A.paintingOf(2, true), 'art/kaaba.webp');
  assert.ok(A.paintedArt({ n: 110 }).includes('art/nabawi.webp') && A.paintedArt({ n: 110 }).includes('مدنية'));
  const fs = await import('node:fs');
  for (const f of ['art/kaaba.webp', 'art/nabawi.webp']) assert.ok(fs.statSync(new URL('../' + f, import.meta.url)).size < 120000, `${f} stays small`);
  console.log('quran art ok');
}
