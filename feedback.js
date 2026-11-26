// The feedback form: a dialog that sends what the person writes, an optional screenshot and the app details they can
// see in the form, to /api/feedback (functions/api/feedback.js), which emails it to the app's owner.
// initFeedback({ details, snapTarget }) — details() returns a flat { label: value } object, shown before sending;
// snapTarget() returns the element showing the screen the person was on (the app, or the full screen view).
// The screenshot library (vendor/html-to-image.min.js) loads only when a screen is snapped.

const $ = (id) => document.getElementById(id);
const MAX_SIDE = 1600, MAX_BYTES = 2.8 * 1024 * 1024;
let shot = null; // { blob, url } of the picture to send
let lib = null;

function loadLib() {
  return lib ||= new Promise((ok, fail) => {
    if (window.htmlToImage) return ok(window.htmlToImage);
    const s = document.createElement('script');
    s.src = 'vendor/html-to-image.min.js';
    s.onload = () => (window.htmlToImage ? ok(window.htmlToImage) : fail(new Error('no htmlToImage')));
    s.onerror = () => { lib = null; fail(new Error('could not load the screenshot library')); };
    document.head.append(s);
  });
}
function dataUrlToBlob(url) {
  const [head, b64] = url.split(','), type = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
// Any picture is redrawn on a canvas before it is sent: it is no larger than 1600 px, and the photo's hidden
// details (EXIF, which can hold where a photo was taken) are left behind.
function redraw(src) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let q = 0.85, url = c.toDataURL('image/jpeg', q);
      while (url.length * 0.75 > MAX_BYTES && q > 0.4) url = c.toDataURL('image/jpeg', (q -= 0.15));
      ok(dataUrlToBlob(url));
    };
    img.onerror = () => fail(new Error('not a picture this browser can open'));
    img.src = src;
  });
}

function showShot(blob, caption) {
  if (shot) URL.revokeObjectURL(shot.url);
  shot = blob ? { blob, url: URL.createObjectURL(blob) } : null;
  $('fb-shot-fig').hidden = !shot;
  $('fb-shot-none').hidden = !!shot;
  $('fb-shot-remove').hidden = !shot;
  $('fb-shot-img')?.remove(); // the preview image exists only while there is a picture
  if (shot) {
    const img = document.createElement('img');
    img.id = 'fb-shot-img'; img.src = shot.url; img.alt = caption;
    $('fb-shot-fig').prepend(img);
    $('fb-shot-cap').textContent = caption;
  }
}
const status = (text, bad = false) => { $('fb-status').textContent = text; $('fb-status').classList.toggle('is-bad', bad); };

export function initFeedback({ details, snapTarget }) {
  const dlg = $('fb');
  let snapped = null; // the picture of the screen the person was on, taken as the form opened

  async function snap() {
    const node = snapTarget();
    try {
      const h = await loadLib();
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#f3ede1';
      // Only what is on screen is copied: the app keeps its other screens (Quran lists, Adhkar, Month) in the page,
      // hidden, and copying all ~2,000 of their parts took several seconds before the form could open.
      // (a display: contents wrapper, like the title's, counts as not visible itself, but its children are on screen;
      // so do the options of a closed list, whose chosen one is what the list shows)
      const shown = (n) => !(n instanceof Element) || !n.checkVisibility || n.checkVisibility()
        || getComputedStyle(n).display === 'contents' || !!n.closest('select');
      const url = await h.toJpeg(node, { quality: 0.82, pixelRatio: 1, backgroundColor: bg, width: node.clientWidth, height: node.clientHeight, filter: shown });
      return dataUrlToBlob(url);
    } catch (e) {
      console.warn('feedback: screenshot failed', e);
      return null;
    }
  }
  function fillDetails() {
    const d = details();
    $('fb-details').innerHTML = '';
    for (const [k, v] of Object.entries(d)) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = String(v);
      $('fb-details').append(dt, dd);
    }
    return d;
  }
  async function open() {
    if (dlg.open) return;
    status('');
    $('fb-snap').disabled = true;
    // snap first, so the picture shows the screen behind the form, not the form
    snapped = await snap();
    fillDetails();
    $('fb-details').hidden = !$('fb-include').checked;
    $('fb-snap').disabled = !snapped;
    $('fb-snap').title = snapped ? '' : 'This screen could not be captured. Attach a picture instead.';
    showShot(snapped, 'The screen you were on, as it will be sent.');
    if (!snapped) status('The screen could not be captured. You can attach a picture instead.');
    dlg.showModal();
    $('fb-message').focus();
  }
  function close() { if (dlg.open) dlg.close(); }

  document.querySelectorAll('.fb-open').forEach(b => b.addEventListener('click', open));
  $('fb-cancel').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); }); // a tap on the dimmed backdrop
  $('fb-include').addEventListener('change', () => { $('fb-details').hidden = !$('fb-include').checked; });
  $('fb-snap').addEventListener('click', () => { if (snapped) { showShot(snapped, 'The screen you were on, as it will be sent.'); status(''); } });
  $('fb-shot-remove').addEventListener('click', () => { showShot(null); $('fb-file').value = ''; });
  $('fb-file').addEventListener('change', async () => {
    const f = $('fb-file').files[0];
    if (!f) return;
    status('Preparing the picture…');
    const url = URL.createObjectURL(f);
    try { showShot(await redraw(url), `Your picture, ${f.name}, as it will be sent.`); status(''); }
    catch (e) { status('That file could not be opened as a picture. Try a PNG or JPEG screenshot.', true); }
    finally { URL.revokeObjectURL(url); }
  });

  $('fb-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('fb-message').value.trim();
    if (!msg) { status('Write a few words first.', true); $('fb-message').focus(); return; }
    const contact = $('fb-contact').value.trim();
    if (contact && !$('fb-contact').checkValidity()) { status('That email address does not look right. Leave it empty if you do not want a reply.', true); $('fb-contact').focus(); return; }
    const fd = new FormData($('fb-form'));
    fd.set('message', msg);
    if ($('fb-include').checked) fd.set('details', JSON.stringify(fillDetails()));
    if (shot) fd.set('screenshot', shot.blob, shot.blob.type === 'image/png' ? 'screenshot.png' : 'screenshot.jpg');
    if (!navigator.onLine) { status('This device is offline. Your feedback is still here: send it when the internet is back.', true); return; }
    $('fb-send').disabled = true;
    status('Sending…');
    try {
      const r = await fetch('/api/feedback', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        status('Thank you. Your feedback was sent.');
        $('fb-form').reset(); showShot(null); snapped = null;
        setTimeout(close, 2200);
      } else status(j.notSetUp ? 'Feedback is not switched on for this site yet. Please try again later.' : j.error || 'It could not be sent. Please try again.', true);
    } catch (err) {
      status('It could not be sent. Check the internet connection and try again.', true);
    } finally { $('fb-send').disabled = false; }
  });

  return { open };
}
