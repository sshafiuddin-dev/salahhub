// The six clock styles. Each takes the same snapshot of the day and returns its markup; app.js redraws every second.
// d = { sec, now (minutes, fractional), rows: [{ key, adhan, iqama, jumuah? }], sunrise, next: { key, kind, at }, jumuah: [minutes], date }
// A row with jumuah (a list of khutbah minutes) is Friday's Dhuhr, shown as Jumu'ah; its iqama is the first khutbah.
import { NAMES, fmt, fmtSpan, esc } from './logic.js';

export const CLOCKS = { board: 'Masjid board', dial: '24-hour dial', analog: 'Analog clock face', sun: 'Sun path', timeline: 'Day timeline', bedside: 'Bedside, low glare' };

const hm = (min) => fmt(min).replace(/ [AP]M$/, '');
const ampm = (min) => fmt(min).slice(-2);
const f1 = (n) => n.toFixed(1);
// seconds to the next event: d.left from the page (real time, right across a clock change), else from the wall clock
const leftOf = (d) => d.left ?? d.next.at * 60 - d.sec;
const untilNext = (d) => fmtSpan(leftOf(d));
const nextAt = (d) => `at ${fmt(d.next.at)}${d.next.at >= 1440 ? ' tomorrow' : ''}`;
const JUM = 'Jumu’ah';
const nameOf = (r) => (r.jumuah ? JUM : NAMES[r.key]);
const khutbahs = (list, f = fmt) => list.map(f).join(' and ');
const jumRow = (d) => d.rows.find(r => r.jumuah);
const nextName = (d) => {
  const r = d.next.at < 1440 && d.rows.find(x => x.key === d.next.key);
  return r?.jumuah ? `${JUM} ${d.next.kind === 'iqama' ? 'khutbah' : d.next.kind}` : `${NAMES[d.next.key]} ${d.next.kind}`.trim();
};
// the countdown blinks (soft, once a second) in its last 15 minutes
// from 15 minutes out the countdown sits on a highlighter mark; in the last 3 minutes the mark blinks (once a second)
const soon = (d) => (leftOf(d) < 180 ? ' ck-hl ck-blink' : leftOf(d) < 900 ? ' ck-hl' : '');
// the next event as the board shows it: the name in English and Arabic, what is coming (or "Adhan called"), the countdown, adhan and iqama
const head = (d) => `${nextHead(d)}<p class="ck-count${soon(d)}">${units(untilNext(d))}</p>${nextLine(d)}`;
const stack = (cls, d) => `<div class="${cls} ck-head">${head(d)}</div>`;

function dial(d) {
  const C = 180, R = 122;
  const xy = (v, r = R) => { const a = v / 1440 * 2 * Math.PI; return [f1(C - r * Math.sin(a)), f1(C + r * Math.cos(a))]; };
  const at = (v, r) => xy(v, r).join(',');
  const arc = (a, b) => `M${at(a)} A${R} ${R} 0 ${b - a > 720 ? 1 : 0} 1 ${at(b)}`;
  let s = `<circle class="ck-ring" cx="${C}" cy="${C}" r="${R}"/><path class="ck-day" d="${arc(d.sunrise, d.rows[3].adhan)}"/>`;
  for (const r of d.rows) {
    if (r.iqama > r.adhan) s += `<path class="ck-iqama" d="${arc(r.adhan, r.iqama)}"/>`;
    const [tx, ty] = xy(r.adhan, R + 32);
    s += `<path class="ck-tick" d="M${at(r.adhan, R - 11)} L${at(r.adhan, R + 11)}"/><text x="${tx}" y="${ty}">${nameOf(r)}</text>`;
  }
  const [hx, hy] = xy(d.now);
  return `<div class="ck-dial"><svg viewBox="0 0 360 360" aria-hidden="true">${s}<circle class="ck-now" cx="${hx}" cy="${hy}" r="8"/></svg>${stack('ck-center', d)}</div>`;
}

function analog(d) {
  const pos = (deg, r) => { const a = deg * Math.PI / 180; return [f1(180 + r * Math.sin(a)), f1(180 - r * Math.cos(a))]; };
  const pt = (deg, r) => pos(deg, r).join(',');
  let ticks = '';
  for (let i = 0; i < 12; i++) ticks += `M${pt(i * 30, 150)} L${pt(i * 30, i % 3 ? 141 : 132)} `;
  let marks = '';
  for (const r of d.rows) {
    if ((r.adhan - d.now + 1440) % 1440 >= 720) continue; // only the next 12 hours, so morning and evening prayers never share a spot
    const deg = (r.adhan % 720) / 2, [x, y] = pos(deg, 150), [tx, ty] = pos(deg, 116);
    marks += `<circle class="ck-mark" cx="${x}" cy="${y}" r="7"/><text class="ck-strong" x="${tx}" y="${ty}">${nameOf(r)} ${hm(r.adhan)}</text>`;
  }
  const start = (d.now % 720) / 2, sweep = Math.min(359, (d.next.at - d.now) / 2);
  const wedge = `M180 180 L${pt(start, 150)} A150 150 0 ${sweep > 180 ? 1 : 0} 1 ${pt(start + sweep, 150)} Z`;
  const hand = (cls, deg, r) => { const [x, y] = pos(deg, r); return `<line class="${cls}" x1="180" y1="180" x2="${x}" y2="${y}"/>`; };
  const s = d.sec;
  return `<div class="ck-analog"><svg viewBox="0 0 360 360" aria-hidden="true"><circle class="ck-face" cx="180" cy="180" r="158"/><path class="ck-wedge" d="${wedge}"/><path class="ck-ticks" d="${ticks}"/>${marks}`
    + `${hand('ck-h', (s / 3600 % 12) * 30, 82)}${hand('ck-m', (s / 60 % 60) * 6, 120)}${hand('ck-s', (s % 60) * 6, 132)}<circle class="ck-pin" cx="180" cy="180" r="6"/></svg>${stack('ck-below', d)}</div>`;
}

function sun(d) {
  const rise = d.sunrise, set = d.rows[3].adhan, nightLen = 1440 - set + rise;
  const day = (v) => { const t = Math.PI * (1 - (v - rise) / (set - rise)); return [f1(200 + 160 * Math.cos(t)), f1(180 - 140 * Math.sin(t))]; };
  const night = (v) => { const t = Math.PI * (((v - set) % 1440 + 1440) % 1440) / nightLen; return [f1(200 + 160 * Math.cos(t)), f1(180 + 90 * Math.sin(t))]; };
  const [fajr, dhuhr, asr, , isha] = d.rows;
  const dot = ([x, y]) => `<circle class="ck-mark-ink" cx="${x}" cy="${y}" r="5"/>`;
  const label = ([x, y], text, cls, dy) => `<text class="ck-strong ${cls}" x="${x}" y="${f1(+y + dy)}">${text}</text>`;
  const isDay = d.now >= rise && d.now < set, [bx, by] = isDay ? day(d.now) : night(d.now);
  return `<div class="ck-sun"><svg viewBox="0 0 400 300" aria-hidden="true">`
    + `<defs><linearGradient id="ck-skyfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ck-sky-top"/><stop offset="1" class="ck-sky-bottom"/></linearGradient></defs>`
    + `<rect x="0" y="0" width="400" height="180" rx="10" fill="url(#ck-skyfill)"/><rect class="ck-ground" x="0" y="180" width="400" height="120" rx="10"/>`
    + `<path class="ck-arc" d="M40 180 A160 140 0 0 1 360 180"/><path class="ck-arc ck-dash" d="M360 180 A160 90 0 0 1 40 180"/><line class="ck-horizon" x1="0" y1="180" x2="400" y2="180"/>`
    + `<circle class="${isDay ? 'ck-sunball' : 'ck-moon'}" cx="${bx}" cy="${by}" r="13"/>` // drawn first: the prayer names sit on top of it
    + `${dot(day(dhuhr.adhan))}${dot(day(asr.adhan))}${dot(['360', '180'])}${dot(['40', '180'])}${dot(night(isha.adhan))}${dot(night(fajr.adhan))}`
    + `${label(day(dhuhr.adhan), `${nameOf(dhuhr)} ${hm(dhuhr.adhan)}`, '', -14)}${label(day(asr.adhan), `Asr ${hm(asr.adhan)}`, '', -14)}`
    + `<text class="ck-strong ck-end" x="356" y="166">Maghrib ${hm(set)}</text><text class="ck-strong ck-start" x="44" y="166">Sunrise ${hm(rise)}</text>`
    + `${label(night(isha.adhan), `Isha ${hm(isha.adhan)}`, 'ck-end', 24)}${label(night(fajr.adhan), `Fajr ${hm(fajr.adhan)}`, 'ck-start', 24)}`
    + `</svg>${stack('ck-below', d)}</div>`;
}

// Masjid board: the day as one printed sheet. The time beside the countdown, then the timetable (adhan above, iqama below,
// English and Arabic names), then sunrise and Jumu'ah. When d.card holds a dua, the dua takes the timetable's place.
// d.tomorrowFajr (a row) is used after Isha; d.wxNow ({ temp, unit, words, hi, lo, pop }) is the weather now, shown under the clock (d.wxLink makes it a button); d.wxAt the weather at the next prayer;
// d.warn ({ event, until, more, sender }) an official warning, shown as a red-ruled line at the top while one is in force.
const AR = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };
const AR_JUM = 'الجمعة';
const AR_RISE = 'الشروق';
const arOf = (d) => { const r = d.next.at < 1440 && d.rows.find(x => x.key === d.next.key); return r?.jumuah ? AR_JUM : d.next.key === 'sunrise' ? AR_RISE : AR[d.next.key]; };
const units = (t) => t.replace(/(\d)([hms])/g, '$1<i>$2</i>');
function nextLine(d) {
  const row = d.next.at >= 1440 ? d.tomorrowFajr : d.rows.find(r => r.key === d.next.key);
  if (!row) return `<p class="sh-at">${nextAt(d)}</p>`; // sunrise
  const low = row.jumuah ? `Khutbah <b>${khutbahs(row.jumuah)}</b>` : `Iqama <b>${row.iqama == null ? 'not set' : row.iqama === row.adhan ? 'on time' : fmt(row.iqama)}</b>${row.def ? ' (default)' : ''}`;
  const when = d.next.at >= 1440 || d.isAhead ? ' tomorrow' : ''; // after Isha this is tomorrow's Fajr
  return `<p class="sh-at">Adhan <b>${fmt(row.adhan)}</b>${when} &nbsp;·&nbsp; ${low}</p>`;
}
// The day ruler: a printed scale from an hour before Fajr to an hour after Isha, an hour mark for each hour,
// a tick per prayer (single letters, "rise" for sunrise) and a marker for now. The next prayer's tick is red.
// It repeats what the table says, so it is hidden from screen readers.
const LETTER = { fajr: 'F', dhuhr: 'D', asr: 'A', maghrib: 'M', isha: 'I' };
function ruler(d) {
  const a = Math.max(0, d.rows[0].adhan - 60), b = Math.min(1440, d.rows[4].adhan + 60);
  const at = (m) => `${(((Math.min(b, Math.max(a, m)) - a) / (b - a)) * 100).toFixed(2)}%`;
  const nextKey = d.next.at >= 1440 ? 'fajr-tomorrow' : d.next.key;
  let h = `<span class="sh-done" style="width:${at(d.now)}"></span>`;
  for (let m = Math.ceil(a / 60) * 60; m <= b; m += 60) h += `<span class="sh-hr" style="left:${at(m)}"></span>`;
  const marks = [[d.rows[0], 'fajr'], [{ adhan: d.sunrise }, 'sunrise'], ...d.rows.slice(1).map(r => [r, r.key])];
  for (const [r, key] of marks) {
    if (r.adhan == null) continue;
    const label = key === 'sunrise' ? 'rise' : r.jumuah ? 'J' : LETTER[key];
    h += `<span class="sh-tk${key === 'sunrise' ? ' sm' : ''}${key === nextKey ? ' nx' : ''}" style="left:${at(r.adhan)}"><i>${label}</i></span>`;
  }
  return `<div class="sh-rule" aria-hidden="true">${h}<span class="sh-now" style="left:${at(d.now)}"></span></div>`;
}
// "At Dhuhr: 45°, rain likely (80%)", from d.wxAt = { name, temp, words, pop }
const wxAt = (w) => (w ? `<p class="sh-wxat">At ${w.name}: <b>${Math.round(w.temp)}°${w.words ? `, ${esc(w.words)}` : ''}</b>${w.pop != null ? ` (${Math.round(w.pop)}%)` : ''}</p>` : '');
function sheetTable(d) {
  const nx = (r) => r.key === d.next.key && d.next.at < 1440;
  const th = d.rows.map(r => `<th scope="col"${nx(r) ? ' class="is-next"' : ''}>${nameOf(r)}<span class="sh-ar" lang="ar">${r.jumuah ? AR_JUM : AR[r.key]}</span></th>`).join('');
  const calledNow = d.next.kind === 'iqama' && d.next.at < 1440; // the adhan time has passed: the Iqama cell carries the mark
  const adhan = d.rows.map(r => `<td${nx(r) ? ` class="${calledNow ? 'is-passed' : 'is-next'}"` : ''}>${hm(r.adhan)}</td>`).join('');
  const iqama = d.rows.map(r => {
    const v = r.jumuah ? r.jumuah.map(hm).join('<br>') : r.iqama == null ? '<em>not set</em>' : r.iqama === r.adhan && !r.def ? '<em>on time</em>' : r.def ? `${hm(r.iqama)}<small class="sh-def">default</small>` : hm(r.iqama);
    return `<td${nx(r) ? ' class="is-next"' : ''}>${v}</td>`;
  }).join('');
  const low = jumRow(d) ? 'Iqama, khutbah' : 'Iqama';
  const corner = d.isAhead ? '<span class="sh-tmrw">Tomorrow</span>' : '<span class="sh-vh">Prayer</span>';
  return `<table class="sh-tt"><thead><tr><th scope="col">${corner}</th>${th}</tr></thead>`
    + `<tbody><tr><th scope="row">Adhan</th>${adhan}</tr><tr class="sh-iq"><th scope="row">${low}</th>${iqama}</tr></tbody></table>`;
}
// After the Isha iqama the sheet shows tomorrow: d.ahead = { rows, sunrise } is tomorrow's day. The big clock and the
// countdown stay on real time; the table, ruler, top line and foot read as the early hours before tomorrow's Fajr.
const aheadView = (d) => ({ ...d, isAhead: true, rows: d.ahead.rows, sunrise: d.ahead.sunrise, now: d.now - 1440, next: { ...d.next, at: d.next.at - 1440 } });
// The next event as a headline: "Asr · العصر" with what is coming ("adhan in") beside it, readable from across a room.
function nextHead(d) {
  const r = d.next.at < 1440 && d.rows.find(x => x.key === d.next.key);
  const name = r?.jumuah ? JUM : NAMES[d.next.key];
  const ar = r?.jumuah ? AR_JUM : d.next.key === 'sunrise' ? AR_RISE : AR[d.next.key];
  const kind = r?.jumuah ? 'khutbah' : d.next.kind;
  const called = d.next.kind === 'iqama' && d.next.at < 1440; // the adhan has been called: the wait is for the iqama
  return `<p class="sh-l${called ? ' is-called' : ''}"><span class="sh-nm">${name}</span><span class="sh-nar" lang="ar">${ar}</span><span class="sh-kind">${called ? 'Adhan called · iqama in' : kind ? `${kind} in` : 'in'}</span></p>`;
}
// The weather now, under the clock: "54°F fog · H 61° L 49° · Rain 34%". On Today a tap opens the Weather tab (data-go; app.js).
function wxNow(d) {
  const w = d.wxNow;
  if (!w) return '';
  const hl = w.hi != null && w.lo != null ? `H ${w.hi}° L ${w.lo}°` : '';
  const sub = [hl, w.pop != null ? `Rain ${w.pop}%` : ''].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `<p class="sh-wxnow"${d.wxLink ? ' data-go="weather"' : ''}>`
    + `<span class="sh-wxt">${w.temp}°${w.unit}</span>${w.words ? `<span class="sh-wxc">${esc(w.words)}</span>` : ''}${sub ? `<span class="sh-wxr">${sub}</span>` : ''}</p>`;
}
function board(real) {
  const d = real.ahead && real.next.at >= 1440 ? aheadView(real) : real;
  const m = Math.floor(real.now), k = d.card;
  const jum = d.jumuah?.length && !jumRow(d) ? ` &nbsp;·&nbsp; ${JUM} ${khutbahs(d.jumuah)}` : '';
  const body = k?.kind === 'dua'
    ? `<div class="sh-dua" data-dua><p class="sh-dua-h"><span>${k.title}</span><span>${k.pos} · tap for the next</span></p>`
      + `<p class="sh-dua-ar" lang="ar" dir="rtl">${esc(k.item.ar)}</p><p class="sh-dua-en">${esc(k.item.en)}</p></div>`
    : sheetTable(d);
  const w = d.warn;
  const warn = w ? `<p class="sh-warn"><b>${esc(w.event)}</b><span>${esc(w.until)}${w.more ? ` · ${w.more} more` : ''}</span><small>${esc(w.sender)}</small></p>` : '';
  return `<div class="sh${k?.kind === 'dua' ? ' sh-has-dua' : ''}${w ? ' sh-w' : ''}">${warn}<div class="sh-mid">`
    + `<div class="sh-clk"><p class="sh-time"><span class="sh-hm">${hm(m)}</span><span class="sh-side">${leftOf(d) < 900 ? `<span>:${String(Math.floor(d.sec % 60)).padStart(2, '0')}</span>` : ''}<span>${ampm(m)}</span></span></p>${wxNow(d)}</div>`
    + `<div class="sh-next">${nextHead(d)}<p class="sh-n${soon(d)}">${units(untilNext(d))}</p>${nextLine(d)}${wxAt(d.wxAt)}`
    + `${ruler(d)}</div></div>`
    + body
    + `<p class="sh-foot"><span>Sunrise ${fmt(d.sunrise)}${jum}</span>${d.fresh ? `<span class="sh-fresh${d.fresh.late ? ' late' : ''}">${esc(d.fresh.text)}</span>` : ''}${d.month ? `<a class="sh-month" href="#month">${esc(d.month)} <span aria-hidden="true">›</span></a>` : ''}</p></div>`;
}

function timeline(d) {
  const E = [{ key: 'fajr', at: d.rows[0].adhan, iq: d.rows[0].iqama, def: d.rows[0].def }, { key: 'sunrise', at: d.sunrise }, ...d.rows.slice(1).map(r => ({ key: r.key, at: r.adhan, iq: r.iqama, def: r.def, jumuah: r.jumuah }))];
  // rows are evenly spaced; the marker moves between row centres in proportion to the time between them
  const H = 56, c = (i) => i * H + H / 2, m = d.now;
  let y;
  if (m < E[0].at) y = c(0) * m / E[0].at;
  else if (m >= E[5].at) y = c(5) + (m - E[5].at) / (1440 - E[5].at) * (H / 2);
  else { const i = E.findIndex((e, k) => m >= e.at && m < E[k + 1].at); y = c(i) + (m - E[i].at) / (E[i + 1].at - E[i].at) * H; }
  const rows = E.map(e => {
    const iq = e.jumuah ? `Khutbah ${khutbahs(e.jumuah)}` : !('iq' in e) ? '' : e.iq == null ? 'Iqama not set' : e.iq === e.at && !e.def ? 'Iqama on time' : `Iqama ${fmt(e.iq)}${e.def ? ' (default)' : ''}`;
    const cls = [m >= (e.iq ?? e.at) ? 'is-done' : '', m >= e.at ? 'is-reached' : ''].filter(Boolean).join(' ');
    return `<li${cls ? ` class="${cls}"` : ''}${e.jumuah ? ' data-jumuah' : ''}><span class="ck-node"></span><strong>${e.jumuah ? JUM : NAMES[e.key]}</strong><span class="ck-tl-times"><b>${fmt(e.at)}</b><span>${iq}</span></span></li>`;
  }).join('');
  const jum = d.jumuah?.length && !jumRow(d) ? `<p class="ck-tl-foot">${JUM} khutbah ${khutbahs(d.jumuah)}</p>` : '';
  return `<div class="ck-timeline"><div class="ck-tl-head ck-head">${head(d)}</div>`
    + `<div class="ck-rail"><span class="ck-rail-fill" style="height:${f1(y)}px"></span><span class="ck-rail-dot" style="top:${f1(y - 9)}px"></span><ol>${rows}</ol></div>${jum}</div>`;
}

function bedside(d) {
  const m = Math.floor(d.now), left = Math.max(0, Math.ceil(leftOf(d) / 60 - 1e-6)), h = Math.floor(left / 60);
  const dots = d.rows.map(r => {
    const cls = r.key === d.next.key ? 'is-next' : d.now >= r.adhan && d.next.at < 1440 ? 'is-done' : '';
    return `<li${cls ? ` class="${cls}"` : ''}><span></span>${nameOf(r)}</li>`;
  }).join('');
  return `<div class="ck-bedside"><p class="ck-bed-time"><span>${hm(m)}</span><small>${ampm(m)}</small></p><p class="ck-bed-date">${d.date}</p>`
    + `<div><p class="ck-bed-ar" lang="ar">${arOf(d)}</p><p class="ck-bed-next">${nextName(d)} ${fmt(d.next.at)}</p><p class="ck-bed-in${soon(d)}">in ${h ? `${h} hr ` : ''}${left % 60} min</p></div><ol class="ck-bed-dots">${dots}</ol></div>`;
}

const STYLES = { board, dial, analog, sun, timeline, bedside };
export const renderClock = (style, d) => (STYLES[style] || board)(d);

// Full screen on small screens: the same sheet as the masjid board, whichever clock style is chosen, with the weather line.
export const renderTimes = (d) => board(d);
