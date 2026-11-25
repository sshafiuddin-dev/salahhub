# IqamaHub design

This is the baseline for every change to the app. New screens, settings and features use these pieces and follow
these rules; anything that does not fit is raised and agreed before it is built, and then added here.

The look was approved in November 2026 from a live preview of every control (the "micro-interactions" review); the app
now matches it everywhere. PRODUCT.md says who the app is for and what must never break; this file says how it looks
and moves.

## Two layers

| Layer | What | Look |
|---|---|---|
| **The sheet** | The clock, the timetable, the countdown, the month table, the dua card, ruled lists (reciters, surahs, adhkar chapters) | A printed masjid timetable: warm paper, ink, Newsreader numbers, ruled lines and double rules, square edges, Arabic prayer names. It does not change with the controls. |
| **The controls** | Everything you press, pick, type or drag: buttons, switches, tick boxes, choices, tabs, steppers, sliders, fields, menus, dialogs, messages | Rounded and soft, from the approved preview: pills, round knobs, green when on, each with its own small motion. |

Never mix them up: no rounded cards around timetable rows, no square or underlined controls.

## Colour

All colours live in `look.css`, per look (Printed, Handwritten, High contrast, E-ink) and per brightness level
(Bright, Soft, Dim, Darkest). Never write a new hex colour anywhere else; use the tokens.

| Token | Use |
|---|---|
| `--paper` | page ground; text on ink buttons |
| `--surface` | controls' ground: fields, pills, cards, dialogs, switch knobs |
| `--ink` | text, chosen tab or pill, primary button |
| `--muted` | secondary text, unticked boxes, off switches |
| `--line` | borders and rules |
| `--clear` | the look's accent (red ink in Printed): the next prayer, the player's progress, links |
| `--risk` | warnings and errors |
| `--on` | anything switched on: switch track, tick box, radio dot, slider fill, stepper focus. Green (`#1B6B52`) by day, the soft accent at night (no glow), ink in E-ink and High contrast |

At Darkest nothing may be bright: use the tokens and the level's colours follow.

## Shape

| Thing | Radius |
|---|---|
| Buttons, text fields, dropdowns | `.625rem` (daisyUI `--radius-field`) |
| Top-bar buttons | `.75rem` |
| Cards, dialogs, the tour card, the feedback window | `1rem` (`--radius-box`) |
| Pills: segmented tabs, chips, menu entries, steppers, the Listen button, toasts, search | fully round (`99px`) |
| Switch knobs, radio dots, round icon buttons, play button | circles |
| Tick boxes | `6px` |
| The sheet | square |

Every control is at least 44px to touch, and has a visible focus ring (`--clear` or `--on`, 2px).

## Type

- Body and controls: IBM Plex Sans (`--body`), 500 for buttons and tabs, 600 for chosen or primary.
- The sheet and headings: Newsreader (`--display`).
- Arabic: Amiri (`--ar`; Aref Ruqaa in the Handwritten look), always with `lang="ar" dir="rtl"`.
- Arabic prayer names appear in every look; Quran and Adhkar carry their Arabic names in menus.

## Motion

Every duration, easing and distance comes from `motion.js` (`T`) or its CSS copies in `look.css`:
`--m-fast .18s`, `--m-normal .35s`, `--m-slow .6s`, `--m-ease`, `--m-pop`. Change both together, never a number in a rule.

- Calm, not bouncy. The small overshoot (`--m-pop`, `spring('bouncy')`) is kept for a switch knob, a radio dot, the
  favourite heart and a slider thumb; nothing else bounces.
- Animate only cheap properties: `opacity`, `transform`, `translate`, `scale`, `rotate`, `clip-path`, colours. Never
  width, height, top or left in a loop (the 2015 Fire 7 must stay smooth). The one exception is the search field opening.
- Named moves in `motion.js`: `rise`, `fade`, `pop`, `swap`, `turn`, `rows` (a list coming in one after another),
  `sheetIn`/`sheetOut`, `flip` (rows gliding to new places). Use these before writing a new one.
- **Reduce motion** (the device setting): nothing slides, springs, grows or shakes; colours change and things fade.
  Every new animation needs its `@media (prefers-reduced-motion: reduce)` rule, or goes through `motion.js`, which
  handles it.
- **E-ink look**: nothing animates at all (one rule in `look.css` turns off every transition and animation).
- Nothing moves on its own on a screen left running all day, except the clock, the countdown and the realistic sky.

## Components

Use these; do not build a second version of any of them.

| Component | Markup / call | Where it lives | Motion |
|---|---|---|---|
| Switch | `<input class="d-toggle" type="checkbox" role="switch">` | look.css | knob springs across, track turns `--on`, dips when pressed |
| Tick box | `<input class="tick" type="checkbox">` | look.css | box fills `--on`, tick draws in |
| Radio choices | `<div class="choices"><label class="choice"><input class="rad" type="radio">…` | look.css | dot pops in |
| Segmented choice | `.seg` with `.d-tab` buttons (`aria-selected`), or `.wx-units` / `.qp-tabs` buttons | look.css | chosen pill fills with ink; a phone scrolls the row, keeping the chosen one in view |
| Stepper (any whole number) | `<input type="number" min max>` then `stepper(input)` | controls.js | − / + in a pill; hold repeats; number slides; shakes at its limit; follows the box's `hidden` and `disabled` |
| Slider | `<input type="range">` then `bubble(input, cls, text?)` | controls.js | track fills `--on`, thumb grows, value label above it |
| Button | `.d-btn` (`-primary` ink, `-outline`, `-ghost`, `-error`) | daisyUI + look.css | dips when pressed |
| Brightness | `.dn-pill` inside `.dim-btn` | look.css | day/night switch, steps across the four levels |
| More menu | `.more` › `.mm-btn` › `.mm-ic` and `.more-menu` | styles.css, app.js | lines turn into × in a round ink button; pill entries rise in, Quran nearest; the page behind dims and a tap there closes it. The bars sit on their own layer (`z-index: 30`) so a menu is never under the page |
| Message | `say(text, action?, ok?)` | app.js | rises; `ok` draws a tick; a replacement settles in |
| Stop while an alert sounds | `#alert-stop`, `#dx-stop` | styles.css | drops in; the bell rings three times |
| Connection note | `[data-net]`, `showNet()` | app.js | only offline, or briefly when back online; arcs light in turn while syncing |
| Loading placeholder | grey shapes that breathe (`.wx-skel`) | styles.css | opacity only; real content fades in |
| Search behind a magnifier | `<input type="search">` then `searchBox(input)` (Quran, Adhkar, and any new list) | controls.js, styles.css (`.sx`) | opens into a field, magnifier turns into ×; × or Escape clears and folds it |
| Favourite heart | `.qp-heart`, `love(b)` | quran.js | pops; sparks fly when it turns on |
| Download | `.qp-dl` (`data-state`, `--p`) | styles.css, quran.js | ring fills smoothly; the tick draws in once saved |
| Progress ring | `.qp-ring` (`pathLength="100"`) | styles.css, quran.js | fills as the surah plays |
| Listen / Play | `.au-play` (`.is-on` while playing) | styles.css | ▶ turns into ■ |
| Dialog | `.qp-dlg` › `.qp-dlg-in`, `.fb` | styles.css | rounded card, ink primary button on the right |

## Words

Plain words that explain themselves (no one is there to help): "this device", never "this tablet"; a control's name
says what it does ("Before iqama", "Tap − for earlier or + for later"). When a control changes, update its note in
Settings and its page in the guide (`scripts/guide/chapters`, then `node scripts/guide/build.mjs`).

## Before you open a PR

- [ ] Uses the components and tokens above; no new hex colours, radii or durations
- [ ] Controls are rounded, the sheet stays printed
- [ ] 44px targets, visible focus, works with keyboard and TV remote, labelled for screen readers
- [ ] Checked by day and at Darkest, in the Printed and E-ink looks, at phone (390px) and Fire 7 (1024×648) sizes
- [ ] Reduce motion: nothing moves; E-ink: nothing animates
- [ ] `node scripts/selfcheck.mjs` passes; `sw.js` cache name raised; a new file added to `SHELL` and `WATCHED`
- [ ] Settings notes and the guide match what is on screen
