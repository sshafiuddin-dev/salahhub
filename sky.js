// The weather sky behind the page. Settings › Display › Weather background picks one of:
//   real   a realistic sky drawn live on the graphics chip (WebGL): sun on its real path, clouds, rain, snow, fog, stars
//          and the moon at the Hijri date's phase; the default. Needs the page's look to match the sky (light by day,
//          dark at night) and a device fast enough; otherwise it falls back to print.
//   print  the same weather as moving printed texture: ink hatching, stipple and halftone, moved by the compositor only.
//   real-still  the realistic sky as one still frame, redrawn when the scene changes (Movement off).
//   still  the printed texture, not moving (also what a device set to reduce motion gets instead of print).
//   off    plain paper.
// app.js calls updateSky() on each clock tick with the scene from logic.js skyParams(); this file decides what to draw.
// <html data-sky data-night data-skymode> tell styles.css which tint and texture to show.

const root = document.documentElement;
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const TIER_KEY = 'iqama-sky-tier', REPROBE_MS = 7 * 864e5;
let box = null, mode = '', sceneKey = '', scene = null;

// ---- where it lives: one layer, moved into the full screen view while that is open ----
function ensureBox() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'sky-live';
  box.setAttribute('aria-hidden', 'true');
  document.body.prepend(box);
  return box;
}
export function mountSky(host) {
  ensureBox();
  if (box.parentElement !== host) host.prepend(box);
}

// ---- the device's speed: measured once a week in the realistic sky; a slow device keeps the printed one ----
function tier() {
  try { const t = JSON.parse(localStorage.getItem(TIER_KEY) || 'null'); if (t && Date.now() - t.at < REPROBE_MS) return t.tier; } catch (e) {}
  return '';
}
function saveTier(t) { try { localStorage.setItem(TIER_KEY, JSON.stringify({ tier: t, at: Date.now() })); } catch (e) {} }

// ---- realistic sky: one fragment shader, half resolution, at most 30 frames a second ----
const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FS = `precision mediump float;
uniform vec2 R; uniform float T, DAY, DAWN, CLOUD, DARK, RAIN, SNOW, FOG, FLASH, MOON, WIND, DIM; uniform vec2 SUN;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<6;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
  vec2 uv=gl_FragCoord.xy/R; float asp=R.x/R.y; vec2 q=vec2(uv.x*asp,uv.y); float y=uv.y;
  vec3 zen=mix(vec3(.05,.08,.18),vec3(.22,.47,.78),DAY), hor=mix(vec3(.12,.17,.30),vec3(.70,.84,.94),DAY);
  hor=mix(hor,vec3(.98,.62,.36),DAWN*.85); zen=mix(zen,vec3(.36,.42,.66),DAWN*.5);
  vec3 grey=mix(vec3(.10,.11,.14),vec3(.62,.66,.70),DAY);
  vec3 sky=mix(hor,zen,smoothstep(.25,1.,y)); sky=mix(sky,grey,DARK);
  vec2 sp=vec2(SUN.x*asp,SUN.y); float d=length(q-sp);
  float up=step(0.,SUN.x); float sunDisc=smoothstep(.035,.03,d)*DAY*up, glow=(exp(-d*6.)*.55+exp(-d*22.)*.6)*max(DAY,DAWN*.6)*up;
  vec3 sunCol=mix(vec3(1.,.95,.82),vec3(1.,.72,.42),DAWN);
  float moonDisc=0.,moonGlow=0.;
  if(DAY<.5){ vec2 o=q-vec2(.80*asp,.80); float md=length(o); float disc=smoothstep(.042,.038,md);
    float ph=cos(6.2832*MOON); float side=MOON<.5?o.x:-o.x; float lit=step(0.,side-ph*sqrt(max(0.,.04*.04-o.y*o.y)));
    moonDisc=disc*mix(.12,1.,lit)*(1.-DAY*2.); moonGlow=exp(-md*9.)*.25*(1.-DAY*2.); }
  vec2 sg=q*90.; vec2 si=floor(sg); float st=h(si); vec2 sf=fract(sg)-.5;
  float star=step(.985,st)*smoothstep(.12,.0,length(sf))*(.6+.4*sin(T*1.5+st*40.))*(1.-DAY)*(1.-DAWN)*smoothstep(.2,.6,y);
  float drift=T*.012*(WIND<0.?-1.:1.)*(.4+abs(WIND));
  vec2 cp=q*vec2(1.6,3.2)+vec2(drift,0.); vec2 w=vec2(fbm(cp+T*.004),fbm(cp+3.1));
  float c=fbm(cp+1.6*w); float cov=smoothstep(1.-CLOUD-.15,1.-CLOUD+.25,c);
  float shade=fbm(cp+1.6*w+normalize(vec2(sp.x-q.x,sp.y-q.y+.001))*.08);
  vec3 cloudCol=mix(vec3(.16,.18,.24),vec3(.97,.97,.98),DAY); cloudCol=mix(cloudCol,grey*1.05,DARK*.7);
  cloudCol*=.82+.25*(c-shade)*4.; cloudCol=mix(cloudCol,vec3(1.,.78,.6),DAWN*.35*smoothstep(.2,.7,y));
  cloudCol+=FLASH*vec3(.55,.55,.6);
  vec3 col=sky+star*vec3(.95,.95,1.)+sunCol*(sunDisc+glow)*(1.-cov*.85)+vec3(.95,.93,.85)*(moonDisc+moonGlow)*(1.-cov*.8);
  col=mix(col,cloudCol,cov*.92);
  float fg=fbm(vec2(q.x*1.2-T*.02,q.y*5.))*FOG; col=mix(col,mix(vec3(.25,.27,.3),vec3(.88,.89,.9),DAY),fg*.85);
  float r=0.;
  for(int i=0;i<3;i++){ float k=float(i)+1.; vec2 rp=q*vec2(70.*k,3.*k); rp.x+=rp.y*(.12+.35*WIND); rp.y+=T*(4.+k*1.6);
    vec2 ri=floor(rp); float rh=h(ri+k*7.); vec2 rf=fract(rp);
    r+=step(1.-RAIN*.55,rh)*smoothstep(.12,0.,abs(rf.x-.5))*smoothstep(0.,.25,rf.y)*smoothstep(1.,.55,rf.y)*(.35+.2*k); }
  col=mix(col,mix(vec3(.6,.65,.72),vec3(.92,.94,.97),DAY),clamp(r,0.,1.)*.55);
  float s=0.;
  for(int i=0;i<3;i++){ float k=float(i)+1.; vec2 pp=q*(9.+k*7.); pp.y+=T*(.35+.12*k); pp.x+=sin(T*.7+pp.y*.9+k)*.25+T*.08*WIND;
    vec2 si2=floor(pp); vec2 sf2=fract(pp)-.5; float sh=h(si2+k*3.); vec2 off=vec2(h(si2+1.),h(si2+2.))-.5;
    s+=step(1.-SNOW*.7,sh)*smoothstep(.09/k+.04,.0,length(sf2-off*.6)); }
  col=mix(col,vec3(.98),clamp(s,0.,1.)*.9);
  col*=1.-.5*DIM*max(DAY,DAWN); // under the dark look, a dawn or dusk sky is kept deep so the light text stands out
  gl_FragColor=vec4(col,1.);
}`;
const real = { cv: null, gl: null, U: null, raf: 0, start: null, last: 0, frames: [], nextFlash: 0, failed: false, still: false };
// Rain, snow, hail and lightning are drawn by skyfx.js on a canvas above this one, loaded only for the realistic sky.
// Until it has loaded (or if it cannot), the shader's own simple rain and snow stand in.
let fx = null, fxLoad = null;
const loadFx = () => (fxLoad ||= import('./skyfx.js').then(m => (fx = m)).catch(() => null));
function realSetup() {
  if (real.gl || real.failed) return !!real.gl;
  const cv = document.createElement('canvas');
  cv.className = 'sky-real';
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' });
  if (!gl) { real.failed = true; return false; }
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) { real.failed = true; return false; }
  const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { real.failed = true; return false; }
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const cache = {};
  real.U = (n) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(pr, n)));
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); real.failed = true; real.gl = null; cancelAnimationFrame(real.raf); refresh(); });
  real.cv = cv; real.gl = gl;
  return true;
}
function realDraw(now) {
  const { gl, cv, U } = real, p = scene;
  if (!gl || !p) return;
  // rain on glass: the sky outside a wet window is soft, so it is drawn small and stretched (cheaper too)
  const glass = !!(p.glass && (p.rain > 0 || p.hail > 0) && fx?.fxMounted());
  const w = glass ? Math.max(48, Math.round(innerWidth * .14)) : Math.min(960, Math.round(innerWidth * .5)), h = Math.round(w * innerHeight / innerWidth);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
  if (real.start === null) real.start = now;
  const T = real.still ? 40 : (now - real.start) / 1000;
  // storms: skyfx.js throws the bolts and gives the glow they put in the clouds; without it, a soft glow behind the
  // clouds every 10 to 20 seconds, two quick swells. Never a white flash either way.
  const layer = fx?.fxMounted();
  let flash = 0;
  if (layer) flash = fx.fxFlash();
  else if (p.storm && !real.still) {
    if (!real.nextFlash) real.nextFlash = T + 4;
    const dt = T - real.nextFlash;
    if (dt > 0 && dt < .6) flash = .3 * Math.max(0, Math.sin(dt / .6 * Math.PI * 2)) ** 2;
    if (dt >= .6) real.nextFlash = T + 10 + Math.random() * 10;
  }
  const f1 = (n, v) => gl.uniform1f(U(n), v);
  gl.uniform2f(U('R'), w, h); f1('T', T); f1('DAY', p.day); f1('DAWN', p.dawn); f1('CLOUD', p.cover); f1('DARK', p.dark);
  f1('RAIN', layer ? 0 : p.rain); f1('SNOW', layer ? 0 : p.snow); f1('FOG', p.fog); f1('FLASH', flash); f1('MOON', p.moon); f1('WIND', p.wind); f1('DIM', dark ? 1 : 0);
  gl.uniform2f(U('SUN'), p.sun ? p.sun[0] : -1, p.sun ? p.sun[1] : -1);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (layer) fx.fxFrame(now, p, real.still, dark, glass ? cv : null); // drops on the glass show the sky upside down, so they read this canvas
}
function realLoop(now) {
  real.raf = requestAnimationFrame(realLoop);
  if (now - real.last < 33) return; // about 30 frames a second is plenty for a sky
  const gap = now - real.last; real.last = now;
  realDraw(now);
  // the speed check: 60 frames after the first 10; a median over 50 ms (under 20 frames a second) means too slow
  if (!tier() && gap < 1000) {
    real.frames.push(gap);
    if (real.frames.length === 70) {
      const m = real.frames.slice(10).sort((a, b) => a - b)[30];
      saveTier(m > 50 ? 'print' : 'real');
      if (m > 50) refresh();
    }
  }
}
function realStart(freeze = false) {
  if (!realSetup()) return false;
  if (real.cv.parentElement !== box) box.append(real.cv);
  loadFx().then(m => { if (m && real.cv?.parentElement === box) { m.fxMount(box); if (real.still) requestAnimationFrame(realDraw); } });
  real.still = calm.matches || freeze;
  cancelAnimationFrame(real.raf);
  if (real.still) requestAnimationFrame(realDraw); // a device set to reduce motion gets one still frame, redrawn when the scene changes
  else { real.last = 0; real.raf = requestAnimationFrame(realLoop); }
  return true;
}
function realStop() { cancelAnimationFrame(real.raf); real.cv?.remove(); fx?.fxUnmount(); }

// ---- printed motion: ink tiles moved with transform and opacity only, so the compositor does the work ----
const svgTile = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;
const strokes = (list, wd) => list.map(([x, y, l]) => `<line x1='${x}' y1='${y}' x2='${x}' y2='${y + l}' stroke='#000' stroke-width='${wd}' stroke-linecap='round'/>`).join('');
const dots = (list) => list.map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}'/>`).join('');
const glints = (list) => list.map(([x, y, r]) => `<path d='M${x - r * 2.6},${y}L${x + r * 2.6},${y}M${x},${y - r * 2.6}L${x},${y + r * 2.6}' stroke='#000' stroke-width='.7'/><circle cx='${x}' cy='${y}' r='${r}'/>`).join('');
function scatter(seed, n, w, h, rMin, rMax) { // the same points every time, so a tile has no visible grid
  let t = seed >>> 0;
  const rnd = () => { t += 0x6D2B79F5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  return Array.from({ length: n }, () => [+(rnd() * w).toFixed(1), +(rnd() * h).toFixed(1), +(rMin + rnd() * (rMax - rMin)).toFixed(2)]);
}
function el(cls, vars = {}, html = '') {
  const d = document.createElement('div');
  d.className = cls;
  for (const [k, v] of Object.entries(vars)) d.style.setProperty(k, v);
  if (html) d.innerHTML = html;
  return d;
}
const blobs = (list) => list.flatMap(([x, y, w, h]) => [x, x + 50].map(xx => `radial-gradient(ellipse ${w}% ${h}% at ${xx}% ${y}%, #000 35%, transparent 72%)`)).join(',');
const CLOUDS = [[6, 30, 14, 26], [16, 22, 11, 24], [27, 34, 15, 22], [38, 18, 10, 22]];
function sunSvg(p) {
  const [x, y] = p.sun, rings = [18, 30, 42, 56, 72, 90, 110].map((r, i) => `<circle r='${r}' fill='none' stroke='currentColor' stroke-width='${i < 2 ? 1.4 : 1}' opacity='${(1 - i * .11).toFixed(2)}'/>`).join('');
  const spokes = Array.from({ length: 36 }, (_, i) => { const a = i * Math.PI / 18; return `<line x1='${(Math.cos(a) * 124).toFixed(1)}' y1='${(Math.sin(a) * 124).toFixed(1)}' x2='${(Math.cos(a) * 150).toFixed(1)}' y2='${(Math.sin(a) * 150).toFixed(1)}' stroke='currentColor' stroke-width='1'/>`; }).join('');
  return el('pm-orb', { left: `${x * 100}%`, top: `${(1 - y) * 60}%` }, `<svg width="1" height="1" overflow="visible"><g><circle r='10' fill='currentColor' opacity='.5'/>${rings}</g><g>${spokes}</g></svg>`);
}
function moonSvg(p) {
  const r = 26, k = Math.cos(2 * Math.PI * p.moon), rx = Math.abs(k) * r, waxing = p.moon < .5;
  const lit = `M0,${-r} A${r},${r} 0 0 ${waxing ? 1 : 0} 0,${r} A${rx},${r} 0 0 ${(k > 0) === waxing ? 0 : 1} 0,${-r} Z`;
  const hatch = Array.from({ length: 13 }, (_, i) => `<line x1='${-r + i * 4.4}' y1='${-r}' x2='${-r + i * 4.4 - 14}' y2='${r}' stroke='currentColor' stroke-width='.8'/>`).join('');
  return el('pm-orb pm-moon', { left: '80%', top: '13%' }, `<svg width="1" height="1" overflow="visible"><defs><clipPath id="pm-disc"><circle r='${r}'/></clipPath></defs>`
    + `<circle r='${r}' fill='none' stroke='currentColor' stroke-width='1'/><g clip-path="url(#pm-disc)" opacity='.55'>${hatch}</g><path d="${lit}" fill='var(--paper)' stroke='currentColor' stroke-width='1'/></svg>`);
}
function printBuild(p) {
  const f = document.createDocumentFragment(), slant = `${(10 + p.wind * 12).toFixed(1)}deg`;
  if (p.dawn > .2) f.append(el('pm-warm', { '--o': p.dawn.toFixed(2) }));
  if (p.night && p.dawn < .5) {
    if (p.cover < .6) [[310, 230, 26, .7, 1.3, '5s', .75, 5, false], [470, 350, 9, 1.1, 1.5, '7s', .7, 17, true]].forEach(([w, h, n, a, b, dur, op, seed, g]) => {
      const pts = scatter(seed, n, w, h, a, b);
      f.append(el('pm-tile pm-twinkle', { '--tile': svgTile(w, h, g ? glints(pts) : dots(pts)), '--tw': `${w}px`, '--th': `${h}px`, '--dur': dur, '--op': op * (1 - p.cover) }));
    });
    if (p.cover < .9) f.append(moonSvg(p));
  } else if (p.sun && p.cover < .9) f.append(sunSvg(p));
  const dir = p.wind < 0 ? ' pm-rev' : '';
  if (p.cover > .6) {
    f.append(el(`pm-cloud${dir}`, { '--dot': '1.3px', '--grid': '7px', '--blobs': 'linear-gradient(#000,#000)', '--dur': '400s', '--op': p.snow ? .07 : .1 + p.dark * .16 }));
    f.append(el(`pm-cloud${dir ? '' : ' pm-rev'}`, { '--dot': '1px', '--grid': '9px', '--blobs': blobs(CLOUDS), '--dur': '240s', '--op': .14 }));
  } else if (p.cover > .2) {
    f.append(el(`pm-cloud${dir}`, { '--dot': '1.25px', '--grid': '7px', '--blobs': blobs(CLOUDS), '--dur': `${Math.round(220 - 120 * Math.abs(p.wind))}s`, '--op': .3 * p.cover / .6 }));
  }
  if (p.fog) ['8%', '22%'].forEach((y, i) => f.append(el('pm-fog', { '--y': y, '--dur': i ? '150s' : '95s', '--op': .2 * p.fog })));
  if (p.rain) {
    const heavy = p.rain >= .75, light = p.rain < .5;
    const tile = heavy ? [22, 80, strokes([[4, 2, 24], [12, 30, 26], [19, 10, 20], [8, 56, 22], [16, 62, 16]], 1.2)]
      : light ? [36, 120, strokes([[6, 4, 14], [24, 64, 12]], 1)] : [30, 96, strokes([[5, 4, 18], [17, 46, 16], [26, 22, 14], [11, 72, 18]], 1.1)];
    f.append(el('pm-rain', { '--tile': svgTile(...tile), '--tw': `${tile[0]}px`, '--th': `${tile[1]}px`, '--dur': heavy ? '.55s' : light ? '1.6s' : '.9s', '--op': .3 + p.rain * .12, '--slant': slant }));
  }
  if (p.storm) f.append(el('pm-glow'));
  if (p.snow) [[260, 2.0, 2.8, '15s', '5s', .55, 11], [330, 1.4, 2.0, '21s', '6.5s', .45, 23], [410, 1.0, 1.5, '30s', '8s', .35, 37]].forEach(([size, a, b, dur, sw, op, seed]) => {
    const s = el('pm-sway', { '--sw': sw });
    s.append(el('pm-tile pm-fall', { '--tile': svgTile(size, size, dots(scatter(seed, p.snow >= .7 ? 22 : 12, size, size, a, b))), '--tw': `${size}px`, '--th': `${size}px`, '--dur': dur, '--op': op }));
    f.append(s);
  });
  return f;
}
let printed = null;
function printShow(p) {
  const key = [p.kind, p.night, p.dawn > .2, p.rain >= .75, p.rain < .5, p.snow >= .7, Math.round(p.wind * 2), p.sun ? Math.round(p.sun[0] * 40) : -1, Math.round(p.cover * 4)].join('|');
  if (printed && printed.dataset.key === key && printed.parentElement === box) return;
  printed?.remove();
  printed = el('sky-printed'); printed.dataset.key = key;
  printed.append(printBuild(p));
  box.append(printed);
}
function printStop() { printed?.remove(); printed = null; }

// ---- choosing ----
// want: the setting; allowed: false where the look or brightness has no sky (Handwritten, High contrast, Dim and Darkest
// with the printed sky); dark: the page is in its dark look.
let want = 'real', allowed = true, dark = false;
function refresh() {
  ensureBox();
  let m = !allowed || want === 'off' ? 'off' : want;
  const freeze = m === 'real-still'; // Movement off: the realistic sky as one still frame
  if (freeze) m = 'real';
  if (m === 'real' && scene && (scene.night !== dark || real.failed || tier() === 'print')) m = 'print'; // a night sky needs the dark look, and a day sky the light look (evenings stay a day sky until then, updateSky)
  if (m === 'print' && (calm.matches || freeze)) m = 'still';
  if (m === 'print' && dark) m = 'off'; // the printed sky is ink on paper; the dark look keeps a still page, as before
  if (m === 'real' && !realStart(freeze)) m = calm.matches || freeze ? 'still' : 'print';
  if (m !== 'real') realStop();
  if (m === 'print' && scene) printShow(scene); else printStop();
  if (m !== mode) { mode = m; root.dataset.skymode = m; }
  if (m === 'real' && real.still) requestAnimationFrame(realDraw);
}
calm.addEventListener?.('change', refresh);

// app.js, once a tick: the scene from skyParams(), the setting, and the page's state.
export function updateSky(p, setting, ok, isDark) {
  if (root.dataset.sky !== p.kind) root.dataset.sky = p.kind;
  root.toggleAttribute('data-night', p.night);
  // After Maghrib, until the page turns to its dark look (Brightness at night: after Maghrib or after Isha), the
  // realistic sky stays on as a late-evening sky, still light enough for ink, rather than giving way to the printed one
  if (p.night && !isDark) p = { ...p, night: false, day: Math.max(p.day, .6), sun: null };
  scene = p;
  const key = JSON.stringify(p);
  if (key === sceneKey && setting === want && ok === allowed && isDark === dark) return;
  sceneKey = key; want = setting; allowed = ok; dark = isDark;
  refresh();
}
// For callers from the earlier versions; the look's colours are read by CSS, so nothing needs redrawing.
export function redrawSky() {}
