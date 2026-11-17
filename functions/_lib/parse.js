// Reads iqama times out of iscj.org's home page. Shared by the live /api/iqama function and the daily GitHub job.
// Throws if the page no longer looks as expected, so a bad scrape never ships.
// [key, name on the page, afternoon?, earliest and latest plausible iqama in minutes after midnight]
const PRAYERS = [
  ['fajr', 'Fajr', false, 180, 480],
  ['dhuhr', '(?:Dhuhr|Zuhr|Duhr)', true, 690, 900],
  ['asr', 'Asr', true, 780, 1200],
  ['maghrib', 'Maghrib', true, 960, 1320],
  ['isha', 'Isha', true, 1020, 1439],
];
const two = (n) => String(n).padStart(2, '0');
export const SOURCE = 'https://iscj.org/';
// how this site's fetches introduce themselves to iscj.org and hisnmuslim.com
export const USER_AGENT = 'Mozilla/5.0 (iqama-times; +https://salahhub.pages.dev/)';

// iscj.org is built ahead of time with ONE schedule in its HTML (whichever was current at the last build), and a script in the page
// picks the schedule for today's date in the visitor's browser. Reading only the HTML therefore shows old times until ISCJ rebuilds.
// So we read the schedule list from the page's own script, the way the browser does, and fall back to the HTML only if it is gone.
// The script holds: periods:[{from:"2026-11-16",iqamah:{Fajr:"6:00 AM",...}}, ...],jumuah:["12:00 PM","1:10 PM"]
const KEYS = { Fajr: 'fajr', Dhuhr: 'dhuhr', Asr: 'asr', Maghrib: 'maghrib', Isha: 'isha' };
const newYorkDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
function clock24(text) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP])M\s*$/i.exec(text);
  if (!m || +m[1] > 12 || +m[2] > 59) return null;
  return +m[1] % 12 * 60 + +m[2] + (/p/i.test(m[3]) ? 720 : 0);
}
// Returns { iqama, jumuah } for the day, null if this script has no schedule, and throws if it has one we cannot trust.
export function fromSchedule(js, day) {
  const m = /periods:\s*(\[[\s\S]*?\])\s*,\s*jumuah:\s*(\[[^\]]*\])/.exec(js);
  if (!m) return null;
  const periods = JSON.parse(m[1].replace(/([{,])\s*([A-Za-z_]\w*)\s*:/g, '$1"$2":'));
  const current = periods.filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.from) && p.from <= day).sort((a, b) => (a.from < b.from ? -1 : 1)).pop();
  if (!current || !current.iqamah) throw new Error(`No ISCJ schedule applies on ${day}`);
  const one = (key, raw, min, max) => {
    if (/^\s*on time\s*$/i.test(raw)) return '+0';
    const at = clock24(raw);
    if (at == null || at < min || at > max) throw new Error(`Implausible ${key} iqama "${raw}" in the schedule`);
    return `${two(Math.floor(at / 60))}:${two(at % 60)}`;
  };
  const iqama = {}, sunday = {};
  for (const [key, , , min, max] of PRAYERS) {
    const name = Object.keys(KEYS).find(k => KEYS[k] === key);
    iqama[key] = one(key, current.iqamah[name], min, max);
    // ISCJ's Sunday-only changes (Dhuhr is later on Sundays), kept apart so the app can use them on Sundays only
    if (current.sunday && current.sunday[name] != null) sunday[key] = one(key, current.sunday[name], min, max);
  }
  const jumuah = JSON.parse(m[2]).map(clock24).filter(v => v != null).map(v => `${two(Math.floor(v / 60))}:${two(v % 60)}`).slice(0, 4);
  return Object.keys(sunday).length ? { iqama, jumuah, sunday } : { iqama, jumuah };
}

// Fetches iscj.org through get (fetch, or a stand-in in the self-check) and returns today's { iqama, jumuah }.
export async function read(get, now = Date.now()) {
  const opts = { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(6000) };
  const res = await get(SOURCE, opts);
  if (!res.ok) throw new Error(`iscj.org answered ${res.status}`);
  const html = await res.text();
  const srcs = [...html.matchAll(/<script[^>]+\bsrc="([^"]+\.js)"/gi)].map(m => new URL(m[1], SOURCE).href);
  srcs.sort((a, b) => /\/page-/.test(b) - /\/page-/.test(a)); // the home page's own script first
  for (const src of srcs.slice(0, 8)) {
    let js;
    try { const r = await get(src, opts); if (!r.ok) continue; js = await r.text(); } catch (e) { continue; }
    const found = fromSchedule(js, newYorkDay(now));
    if (found) return found;
  }
  return parse(html);
}

export function parse(html) {
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&(?:rsquo|lsquo|apos|#8217|#8216|#0*39|#x27);/gi, "'").replace(/\s+/g, ' ');
  const iqama = {};
  for (const [key, name, afternoon, min, max] of PRAYERS) {
    // the page reads "<prayer> <start time> Iqama <time>", with "On Time" for Maghrib
    const m = new RegExp(`\\b${name}\\b.{0,60}?\\bIqamah?\\b\\W{0,10}(On Time|(\\d{1,2}):(\\d{2}))(?:\\s*([AP])M\\b)?`, 'i').exec(text);
    if (!m) throw new Error(`No iqama time found for ${key}`);
    if (!m[2]) { iqama[key] = '+0'; continue; }
    const pm = m[4] ? /p/i.test(m[4]) : afternoon && !(key === 'dhuhr' && +m[2] === 11);
    const at = (+m[2] % 12 + (pm ? 12 : 0)) * 60 + +m[3];
    if (+m[2] > 12 || +m[3] > 59 || at < min || at > max) throw new Error(`Implausible ${key} iqama "${m[1]}"`);
    iqama[key] = `${two(Math.floor(at / 60))}:${two(at % 60)}`;
  }
  // the page also says "Jumu'ah" in its menu and program list, so look for the khutbah heading first
  const j = /Jumu.{0,4}ah\s*Khutbahs?.{0,200}/i.exec(text) || /Jumu.{0,4}ah.{0,200}/i.exec(text);
  const jumuah = [...(j ? j[0] : '').matchAll(/(\d{1,2}):(\d{2})\s*([AP])M/gi)]
    .map(([, h, mi, ap]) => `${two(+h % 12 + (/p/i.test(ap) ? 12 : 0))}:${mi}`).slice(0, 4);
  return { iqama, jumuah };
}
