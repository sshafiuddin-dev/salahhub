// TV remote and arrow keys: ← ↑ → ↓ move the focus to the nearest control in that direction, as on a TV's own menus.
// OK (Enter) presses it, as usual; Back arrives as Escape and closes what is open (app.js, quran.js).
// Many TV browsers only scroll with the arrows, so the app does this itself. It stays out of the way of anything that
// uses the arrows already: text being typed, a slider, a stepper's number, the tour, a playlist row being moved.
const FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };

// What may take the focus now: inside an open window (Now playing, a dialog, the More menu) only its own controls
function scope() {
  const open = [...document.querySelectorAll('dialog[open], #qp-now:not([hidden])')].pop();
  if (open) return open;
  const more = document.querySelector('.more details[open], details.more[open]');
  if (more) return more;
  return document.body;
}
const shown = (el) => {
  if (el.disabled || el.tabIndex < 0 || el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.opacity !== '0' && s.pointerEvents !== 'none';
};
// The screen's parts: the page scrolls under bars that stay put. The arrows keep to the part they are in (so ↓ walks the
// whole page, scrolling it, before it reaches the player or the bottom bar) and cross to the next part at its edge.
const PART = '.topbar-actions, .topbar, .qp-player, .tabbar, .dockbar, .dx-top, .more-menu'; // nearest wins: the top bar's buttons sit at the foot on a wide screen
const part = (el) => el.closest(PART);
const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
// a closed details hides everything inside it except its summary
const reachable = (el) => !el.closest('details:not([open]) > :not(summary)');

// Keys the focused control keeps for itself
function ownsKey(el, key) {
  if (!el || el === document.body) return false;
  const tag = el.tagName, type = (el.type || '').toLowerCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  if (type === 'range') return key === 'ArrowLeft' || key === 'ArrowRight';
  if (type === 'number') return key === 'ArrowUp' || key === 'ArrowDown';
  if (type === 'time') return true;
  if (['text', 'search', 'email', 'tel', 'url', ''].includes(type)) {
    if (key === 'ArrowUp' || key === 'ArrowDown') return false;
    // the caret moves within the text; only at its very start (←) or end (→) does the focus leave
    try { return key === 'ArrowLeft' ? el.selectionStart > 0 : el.selectionEnd < el.value.length; } catch (err) { return false; }
  }
  return false;
}

// The best control in direction [dx, dy] from `from`: ahead of it, nearest along the way, and lined up with it
function pick(from, [dx, dy], list, row = true) {
  const a = from.getBoundingClientRect(), acx = a.left + a.width / 2, acy = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === from || from.contains(el) || el.contains(from)) continue;
    const b = el.getBoundingClientRect(), bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
    // how far ahead, edge to edge, so a wide row and a small button beside it still count
    const ahead = dx ? (dx > 0 ? b.left - a.right : a.left - b.right) : (dy > 0 ? b.top - a.bottom : a.top - b.bottom);
    const centre = dx ? (bcx - acx) * dx : (bcy - acy) * dy;
    if (centre <= 1 || ahead < -Math.min(a.width, a.height, b.width, b.height) / 2) continue;
    // ← and → stay on the row: the other control must share some of this one's height, as on a TV's own menus
    if (row && dx && (b.bottom <= a.top + 2 || b.top >= a.bottom - 2)) continue;
    // how far off to the side; none when they overlap across the way of travel
    const side = dx ? Math.max(0, b.top - a.bottom, a.top - b.bottom) : Math.max(0, b.left - a.right, a.left - b.right);
    const score = Math.max(0, ahead) + side * 3 + Math.abs(dx ? bcy - acy : bcx - acx) * .1;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export function initRemote({ busy = () => false } = {}) {
  addEventListener('keydown', (e) => {
    const dir = KEYS[e.key];
    if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || busy()) return;
    const at = document.activeElement;
    if (ownsKey(at, e.key)) return;
    const area = scope();
    const list = [...area.querySelectorAll(FOCUSABLE)].filter(el => shown(el) && reachable(el));
    if (!list.length) return;
    let next;
    if (!at || at === document.body || !area.contains(at) || !shown(at)) {
      // nothing chosen yet: start at the top (↓ →) or the bottom (↑ ←) of what can be chosen
      const sorted = (list.some(inView) ? list.filter(inView) : list).sort((p, q) => { const r = p.getBoundingClientRect(), s = q.getBoundingClientRect(); return r.top - s.top || r.left - s.left; });
      next = dir[0] + dir[1] > 0 ? sorted[0] : sorted[sorted.length - 1];
    } else {
      // this part first, then anywhere; ← and → keep to the row, and leave it only when nothing on the row is that way
      const own = part(at), mine = list.filter(el => part(el) === own);
      next = pick(at, dir, mine) || pick(at, dir, list) || (dir[0] ? pick(at, dir, mine, false) || pick(at, dir, list, false) : null);
    }
    if (!next) return; // nothing that way: the page may scroll as usual
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}
