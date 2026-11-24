// Artwork for the Quran player, drawn here so it needs no download and works offline.
// mp3quran.net has no reciter pictures, so each reciter gets a colour of their own (from their name, so it is the same
// online and offline) and two drawings: a small tile with the first letter of their name, and a large card with the
// surah's number and Arabic name inside an eight-point star. Plain SVG strings, so the tests can check them.
// The fills are attributes with classes beside them: look.css can turn them to ink and paper in E-ink and High contrast,
// and the lock-screen picture, drawn from the same markup, keeps the colours.

export const SURAH_AR = ['الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
  'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
  'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
  'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
  'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
  'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس'];

// Muted inks that the paper colour reads on at 4.5:1 or better (checked in selfcheck.mjs)
export const ART_PAPER = '#F4EFE4';
export const ART_INKS = ['#0F6E56', '#993C1D', '#3C3489', '#3B6D11', '#72243E', '#185FA5', '#854F0B', '#0C447C'];

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function artColor(name) {
  let h = 2166136261; // FNV-1a: small, and the same everywhere
  for (const ch of String(name || '').toLowerCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return ART_INKS[h % ART_INKS.length];
}
// The letter on the small tile: the first of the Arabic name when it is known, otherwise of the English one
export function initial(en, ar) {
  const a = String(ar || '').trim().match(/[ء-ي]/);
  if (a) return { ch: a[0], arabic: true };
  const e = String(en || '').trim().match(/[A-Za-z0-9]/);
  return { ch: e ? e[0].toUpperCase() : '#', arabic: false };
}
const AR_FONT = "Amiri, 'Noto Naskh Arabic', serif";
const svgOpen = (label) => `<svg class="qa" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${xml(label)}">`;

// Small tile: a letter on the reciter's colour
export function tileArt({ reciter, reciterAr }) {
  const ink = artColor(reciter), { ch, arabic } = initial(reciter, reciterAr);
  return svgOpen(reciter || 'Reciter')
    + `<rect class="qa-bg" width="140" height="140" fill="${ink}"/>`
    + `<circle class="qa-line" cx="70" cy="70" r="50" fill="none" stroke="${ART_PAPER}" stroke-opacity=".3" stroke-width="3"/>`
    + `<text class="qa-fg" x="70" y="${arabic ? 92 : 90}" text-anchor="middle" font-size="${arabic ? 72 : 60}" font-family="${arabic ? AR_FONT : 'Newsreader, Georgia, serif'}" fill="${ART_PAPER}">${xml(ch)}</text></svg>`;
}

const square = (cx, cy, r, turn, attrs) => `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}"${turn ? ` transform="rotate(45 ${cx} ${cy})"` : ''} ${attrs}/>`;
const star = (cx, cy, r, attrs) => square(cx, cy, r, false, attrs) + square(cx, cy, r, true, attrs);
// Large card: the surah inside an eight-point star, on a field of small stars
export function starArt({ n, reciter, title }) {
  const ink = artColor(reciter), name = SURAH_AR[n - 1] || '';
  let field = '';
  for (let x = 0; x <= 140; x += 35) for (let y = 0; y <= 140; y += 35) field += star(x, y, 6, `class="qa-line" fill="none" stroke="${ART_PAPER}" stroke-opacity=".2"`);
  return svgOpen(`${title || `Surah ${n}`}${reciter ? `, ${reciter}` : ''}`)
    + `<rect class="qa-bg" width="140" height="140" fill="${ink}"/>${field}`
    + star(70, 60, 30, `class="qa-bg qa-edge" fill="${ink}" stroke="${ART_PAPER}" stroke-width="1.2"`)
    + `<text class="qa-fg" x="70" y="${n > 99 ? 67 : 68}" text-anchor="middle" font-size="${n > 99 ? 19 : 22}" font-family="Newsreader, Georgia, serif" fill="${ART_PAPER}">${n}</text>`
    + (name ? `<text class="qa-fg" x="70" y="122" text-anchor="middle" font-size="${name.length > 7 ? 17 : 20}" font-family="${AR_FONT}" fill="${ART_PAPER}" direction="rtl">${xml(name)}</text>` : '')
    + '</svg>';
}

// A picture of the card for the lock screen (the media session wants an image address, not markup).
// Resolves to a blob: address, or null where the browser cannot draw it.
export function artPicture(svg, size = 512) {
  return new Promise((resolve) => {
    try {
      const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = size;
          c.getContext('2d').drawImage(img, 0, 0, size, size);
          URL.revokeObjectURL(url);
          c.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), 'image/png');
        } catch (e) { URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch (e) { resolve(null); }
  });
}

// mp3quran's Arabic reciter list, kept as { id: name } and refreshed at most once a week
export function arNames(json) {
  const out = {};
  for (const r of json?.reciters || []) if (Number.isInteger(+r.id) && r.name) out[+r.id] = String(r.name).trim().slice(0, 80);
  return out;
}
