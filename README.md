# IqamaHub

Your salah companion: adhan and iqama times on any screen, even your smart TV. An installable web app that turns a spare
tablet, phone, computer or smart TV into a prayer clock for your home or masjid: adhan and iqama times, a countdown,
alerts, weather, adhkar and a Quran player.
No account, no tracking: settings stay on the device.

- App: https://iqamahub.app
- Guide: https://iqamahub.app/guide/
- Made by [Shafiuddin Syed](https://sshafiuddin.pages.dev)

## How it is built

A static site with no build step (the output of the two small build scripts is committed), hosted on Cloudflare Pages.

```
/                  the app (index.html, app.js, styles.css, ...)
/guide/            the user guide, built from scripts/guide/chapters by scripts/guide/build.mjs
/functions/api/    /api/iqama (reads iscj.org, cached at the edge) and /api/csp-report (logs policy reports, stores nothing)
/scripts/          selfcheck.mjs (tests), fetch-iqama.mjs and fetch-hisn.mjs (daily and monthly data jobs), daisy/ (CSS build)
/_headers          security headers
```

Cloudflare Pages settings: connect this repo, leave the build command empty, output directory `/` (the repo root).

## Tests

`node scripts/selfcheck.mjs`

## Data jobs (GitHub Actions)

- `iqama.yml` copies today's ISCJ iqama times into `iqama.json` every day.
- `hisn.yml` refreshes `hisn-text.json` (Hisn al-Muslim text) once a month.

## Credits

Every outside source (Quran recitations, Hisn al-Muslim, adhan recordings, prayer-time calculator, iqama times, weather data,
libraries and fonts) is listed with its licence in [CREDITS.md](CREDITS.md).
