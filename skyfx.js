// Rain, snow, hail and lightning over the realistic sky. sky.js loads this file only for the realistic sky, puts its
// see-through canvas above the sky's own, and calls fxFrame() from its own loop of about 30 frames a second.
// The canvas carries the sky's class, so it fades out before the timetable exactly as the sky does (styles.css).
// Depth is what makes it look real: near drops are longer, brighter and faster than far ones, and the wind leans them.
// Lightning: a visible bolt with a gentle glow in the clouds (fxFlash, drawn by sky.js), never a white screen.
// Under the dark look the colours are the night's; at Dim and Darkest everything is fainter.

const TAU = Math.PI * 2, rnd = Math.random;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const RAIN_DAY = [215, 225, 235], RAIN_NIGHT = [165, 180, 205];
const root = document.documentElement;

let cv = null, ctx = null, W = 0, H = 0, BAND = 0, AREA = 1, scene = null, last = 0, T = 0;
let drops = [], flakes = [], hail = [];
const L = { next: 5, t: 99, pulses: [], lines: null };
let flakeSpr = null;

function sprite() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32); return c;
}

export function fxMount(box) {
  if (!cv) { cv = document.createElement('canvas'); cv.className = 'sky-real sky-fx'; cv.setAttribute('aria-hidden', 'true'); ctx = cv.getContext('2d'); flakeSpr = sprite(); }
  if (cv.parentElement !== box) box.append(cv);
}
export function fxUnmount() { cv?.remove(); last = 0; }
export const fxMounted = () => !!cv?.parentElement;

// The glow sky.js adds to the clouds while lightning flickers: 0 to about .45.
export function fxFlash() {
  let v = 0;
  for (const p of L.pulses) { const d = L.t - p.t; if (d >= 0) v += p.a * Math.exp(-d / .07); }
  return Math.min(1, v) * .45;
}

function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5), w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return false;
  if (w === W && h === H && cv.width === Math.round(w * dpr)) return true;
  W = w; H = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  BAND = Math.min(H * .66, 460) + 40; // below this the sky is masked away, so nothing needs to fall further
  AREA = clamp(W * BAND / (1280 * 500), .3, 1.8);
  drops = []; flakes = []; hail = []; glassOn = false; // the pane starts again at the new size
  return true;
}

// ---- rain: drizzle to downpour from scene.rain (.3 to 1) ----
function spawnDrop(d, init) {
  d.z = Math.pow(rnd(), 1.4); d.v = H * (1.05 + d.z * 1.9) * (.9 + rnd() * .2); d.len = (6 + d.z * 34) * (.7 + scene.rain * .5);
  const span = Math.abs(scene.wind) * .4 * BAND; d.x = rnd() * (W + span) - (scene.wind > 0 ? span : 0);
  d.y = init ? rnd() * BAND : -d.len - rnd() * BAND * .3; return d;
}
function rain(dt) {
  const target = Math.round((scene.rain || 0) * 650 * AREA);
  if (drops.length > target) drops.length = target;
  for (let i = 0; drops.length < target && i < 80; i++) drops.push(spawnDrop({}, true));
  const vr = scene.wind * .4;
  for (const d of drops) { d.y += d.v * dt; d.x += vr * d.v * dt; if (d.y - d.len > BAND) spawnDrop(d, false); }
}
function drawRain(f, k, col, glass) {
  const vr = scene.wind * .4, g = glass ? .55 : 1; // seen through wet glass the rain outside is softer: fainter, wider streaks
  for (const [z0, z1, a, w] of [[0, .35, .16, .6], [.35, .7, .28, 1], [.7, 1.01, .45, 1.6]]) {
    ctx.strokeStyle = rgba(col, Math.min(1, a * (1 + f * 1.4) * k * g)); ctx.lineWidth = w * (glass ? 2 : 1); ctx.beginPath();
    for (const d of drops) { if (d.z < z0 || d.z >= z1) continue; ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - vr * d.len, d.y - d.len); }
    ctx.stroke();
  }
}

// ---- snow: drifting flakes; with a strong wind (40 km/h and over) it becomes a blizzard ----
function spawnFlake(f, init) {
  f.z = Math.pow(rnd(), 1.2); f.r = 1.1 + f.z * 3.4; f.v = (22 + f.z * 60) * (.8 + rnd() * .4);
  f.amp = 6 + f.z * 18; f.fq = .6 + rnd() * .9; f.ph = rnd() * TAU; f.x = rnd() * W; f.y = init ? rnd() * BAND : -10 - rnd() * BAND * .2; return f;
}
function snow(dt) {
  const target = Math.round((scene.snow || 0) * 700 * AREA);
  if (flakes.length > target) flakes.length = target;
  for (let i = 0; flakes.length < target && i < 80; i++) flakes.push(spawnFlake({}, true));
  const w = scene.wind, boost = 1 + Math.abs(w) * 1.2;
  for (const f of flakes) {
    f.y += f.v * boost * dt; f.x += (w * (40 + f.z * 260) + Math.cos(T * f.fq + f.ph) * f.amp * f.fq) * dt;
    if (f.x > W + 12) f.x -= W + 24; else if (f.x < -12) f.x += W + 24;
    if (f.y > BAND) spawnFlake(f, false);
  }
}
function drawSnow(f, k) {
  const dim = (scene.day < .5 ? .6 : 1) * (1 + f) * k;
  for (const s of flakes) { ctx.globalAlpha = Math.min(1, (.35 + s.z * .6) * dim); ctx.drawImage(flakeSpr, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2); }
  ctx.globalAlpha = 1;
}

// ---- hail: short fast pellets, in a thunderstorm with hail ----
function spawnHail(h, init) {
  h.z = rnd(); h.v = H * (1.5 + h.z * 1.5); h.l = 6 + h.z * 10;
  const span = Math.abs(scene.wind) * .3 * BAND; h.x = rnd() * (W + span) - (scene.wind > 0 ? span : 0);
  h.y = init ? rnd() * BAND : -rnd() * BAND * .3; return h;
}
function hailMove(dt) {
  const target = Math.round((scene.hail || 0) * 300 * AREA);
  if (hail.length > target) hail.length = target;
  for (let i = 0; hail.length < target && i < 40; i++) hail.push(spawnHail({}, true));
  for (const h of hail) { h.y += h.v * dt; h.x += scene.wind * .3 * h.v * dt; if (h.y - h.l > BAND) spawnHail(h, false); }
}
function drawHail(f, k) {
  ctx.strokeStyle = `rgba(235,242,250,${Math.min(1, (scene.day < .5 ? .5 : .8) * (1 + f) * k)})`; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath();
  for (const h of hail) { ctx.moveTo(h.x, h.y); ctx.lineTo(h.x - scene.wind * .3 * h.l, h.y - h.l); }
  ctx.stroke();
}

// ---- lightning: a branching bolt every 6 to 16 seconds, one to three flickers ----
function path(x0, y0, x1, y1, disp, out) {
  if (disp < 3) { out.push(x1, y1); return; }
  const mx = (x0 + x1) / 2 + (rnd() - .5) * disp, my = (y0 + y1) / 2 + (rnd() - .5) * disp * .3;
  path(x0, y0, mx, my, disp / 2, out); path(mx, my, x1, y1, disp / 2, out);
}
function strike() {
  L.t = 0; L.pulses = [{ t: 0, a: 1 }];
  let tt = 0; for (let i = 0, n = 1 + (rnd() * 3 | 0); i < n; i++) { tt += .05 + rnd() * .12; L.pulses.push({ t: tt, a: .4 + rnd() * .6 }); }
  L.lines = null;
  if (rnd() < .7) {
    const x0 = W * (.12 + .76 * rnd()), y0 = BAND * .04, y1 = BAND * (.45 + .4 * rnd()), x1 = x0 + (rnd() - .5) * W * .2;
    const main = [x0, y0]; path(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * .35, main); L.lines = [{ p: main, w: 1 }];
    for (let b = 0, nb = 2 + (rnd() * 3 | 0); b < nb; b++) {
      const i = 2 * ((rnd() * (main.length / 2 - 2)) | 0), bx = main[i], by = main[i + 1], p = [bx, by];
      path(bx, by, bx + (rnd() - .5) * W * .15, by + 40 + rnd() * BAND * .2, 70, p); L.lines.push({ p, w: .45 });
    }
  }
  L.next = 6 + rnd() * 10;
}
function drawBolt(f, k, light) {
  if (!L.lines || f < .02) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // on the pale daytime page a white bolt would vanish, so it gets a dusky violet edge; at night a pale blue glow
  const glow = light ? `rgba(60,66,120,${.45 * f * k})` : `rgba(170,180,255,${.2 * f * k})`;
  for (const [w, c] of [[light ? 5 : 7, glow], [2.2, `rgba(255,255,255,${f * k})`]]) for (const l of L.lines) {
    ctx.lineWidth = w * l.w; ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(l.p[0], l.p[1]);
    for (let i = 2; i < l.p.length; i += 2) ctx.lineTo(l.p[i], l.p[i + 1]);
    ctx.stroke();
  }
}

// ---- rain on glass (Settings › Display › Rain on glass, only while it rains) ----
// The sky behind is drawn soft by sky.js. On the pane: many small droplets that build up, and bigger drops that act
// as little lenses (the sky upside down inside them); a heavy one slides down, swallows what is in its way, leaves a
// trail of tiny drops, and joins the drops it meets.
let glassC = null, gctx = null, dropSpr = null, gStatic = [], gDrops = [], glassOn = false, GS = 1;
function dropSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'); x.beginPath(); x.arc(32, 32, 31, 0, TAU);
  let g = x.createRadialGradient(32, 28, 14, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.05)'); g.addColorStop(.72, 'rgba(0,0,0,.10)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); x.fillStyle = g; x.fill();
  g = x.createRadialGradient(32, 44, 0, 32, 44, 18); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fill();
  x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.ellipse(22, 19, 6.5, 4, -.6, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.ellipse(43, 47, 4, 2, -.6, 0, TAU); x.fill();
  return c;
}
const wet = () => clamp((scene.rain || 0) + (scene.hail || 0) * .5, 0, 1);
function addStatic(x, y, r) { gStatic.push({ x, y, r }); gctx.drawImage(dropSpr, x - r, y - r, r * 2, r * 2); }
function newDrop(y) { return { x: rnd() * W, y, r: (2.5 + rnd() * rnd() * 7) * GS, vy: 0, slide: false, seed: rnd() * 99, trail: 0 }; }
function glassReset() {
  if (!glassC) { glassC = document.createElement('canvas'); gctx = glassC.getContext('2d'); dropSpr = dropSprite(); }
  const dpr = cv.width / W; glassC.width = cv.width; glassC.height = cv.height; gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  GS = clamp(Math.min(W, H) / 480, .8, 2); gStatic = []; gDrops = [];
  const a = wet();
  for (let i = 0, n = a * 900 * AREA; i < n; i++) addStatic(rnd() * W, rnd() * BAND, (.6 + rnd() * rnd() * 2.6) * GS);
  for (let i = 0, n = Math.round(6 + a * 20); i < n; i++) gDrops.push(newDrop(rnd() * BAND));
}
function glassMove(dt) {
  const a = wet(), maxS = a * 1400 * AREA;
  let add = a * 280 * dt * AREA;
  while (add > 0 && gStatic.length < maxS) { if (rnd() < add) addStatic(rnd() * W, rnd() * BAND, (.6 + rnd() * rnd() * 2.6) * GS); add--; }
  if (gDrops.length < 8 + a * 28 && rnd() < a * 8 * dt) gDrops.push(newDrop(rnd() * BAND * .9));
  gctx.globalCompositeOperation = 'destination-out';
  for (let i = gDrops.length - 1; i >= 0; i--) {
    const d = gDrops[i]; if (!d) continue;
    if (!d.slide) { d.r += a * dt * .25 * GS * rnd(); if (d.r > 5.5 * GS && rnd() < dt * .5) { d.slide = true; d.vy = 15; } continue; }
    d.vy = Math.min(d.vy + 130 * dt, 60 + d.r * 14 / GS); if (rnd() < dt * .7) d.vy *= .15; // drops stick and let go as they run
    const dy = d.vy * dt; d.y += dy; d.x += Math.sin(d.y * .045 + d.seed) * .35;
    gctx.beginPath(); gctx.arc(d.x, d.y, d.r * .95, 0, TAU); gctx.fill(); // the path it wipes clear
    d.trail += dy;
    if (d.trail > d.r * (.8 + rnd())) {
      d.trail = 0; gctx.globalCompositeOperation = 'source-over';
      const tr = d.r * (.22 + rnd() * .22); addStatic(d.x + (rnd() - .5) * d.r * .6, d.y - d.r * 1.3, tr);
      gctx.globalCompositeOperation = 'destination-out'; d.r = Math.max(2 * GS, d.r - tr * .05);
    }
    for (let j = gDrops.length - 1; j >= 0; j--) {
      const o = gDrops[j];
      if (o !== d && Math.hypot(o.x - d.x, o.y - d.y) < d.r + o.r * .7) { d.r = Math.sqrt(d.r * d.r + o.r * o.r); gDrops.splice(j, 1); if (j < i) i--; }
    }
    if (d.y - d.r > BAND) gDrops.splice(gDrops.indexOf(d), 1);
  }
  gctx.globalCompositeOperation = 'source-over';
  const sl = gDrops.filter(d => d.slide);
  if (sl.length) gStatic = gStatic.filter(s => !sl.some(d => Math.abs(s.x - d.x) < d.r && Math.abs(s.y - d.y) < d.r));
}
function drawGlass(src, darkLook, k) {
  ctx.fillStyle = darkLook ? 'rgba(40,46,58,.12)' : 'rgba(225,230,236,.12)'; ctx.fillRect(0, 0, W, BAND); // a little mist on the pane
  ctx.globalAlpha = k; ctx.drawImage(glassC, 0, 0, W, H);
  const s = src.width / W, sw = src.width, sh = src.height;
  for (const d of gDrops) {
    const rx = d.r * (d.slide ? .82 : .95), ry = d.r * (d.slide ? 1.12 : 1), R = d.r * 7;
    const ss = Math.min(2 * R * s, sw, sh), sx = clamp((d.x - R) * s, 0, sw - ss), sy = clamp((d.y - R) * s, 0, sh - ss);
    ctx.save(); ctx.beginPath(); ctx.ellipse(d.x, d.y, rx, ry, 0, 0, TAU); ctx.clip(); ctx.translate(d.x, d.y); ctx.scale(-1, -1);
    ctx.drawImage(src, sx, sy, ss, ss, -rx, -ry, rx * 2, ry * 2); ctx.restore();
    ctx.drawImage(dropSpr, d.x - rx, d.y - ry, rx * 2, ry * 2);
  }
  ctx.globalAlpha = 1;
}

// sky.js, once a frame. still: one frame, nothing moves (Movement off, or the device asks for less motion).
// darkLook: the page is in its dark look, so the night's colours. src: the sky's canvas when it rains on the glass.
export function fxFrame(now, p, still, darkLook, src) {
  if (!cv || !p || !fit()) return;
  scene = p;
  const onGlass = !!src;
  if (onGlass && (!glassOn || glassC.width !== cv.width)) glassReset();
  glassOn = onGlass;
  let dt = still || !last ? 0 : Math.min(.05, (now - last) / 1000); last = now; T += dt;
  rain(dt); snow(dt); hailMove(dt); if (glassOn && dt) glassMove(dt);
  if (p.storm && !still) { L.next -= dt; L.t += dt; if (L.next <= 0) strike(); }
  else { L.pulses = []; L.lines = null; }
  const flicker = fxFlash() / .45, dim = Number(root.dataset.dim) || 0, k = dim >= 3 ? .35 : dim === 2 ? .6 : 1;
  const col = darkLook ? RAIN_NIGHT : mix(RAIN_NIGHT, RAIN_DAY, clamp(p.day, 0, 1));
  ctx.clearRect(0, 0, W, H);
  drawBolt(flicker, k, !darkLook);
  if (drops.length) drawRain(flicker, k, col, glassOn);
  if (hail.length) drawHail(flicker, k);
  if (flakes.length) drawSnow(flicker, k);
  if (glassOn) drawGlass(src, darkLook, k);
}
