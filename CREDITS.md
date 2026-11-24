# Sources and credits

Everything in this app that comes from someone else, where it is used, and under what terms.
Iqama Times shows the same list under Settings, About.

## Iqama Times

### Quran

| What | Source | Used in |
|---|---|---|
| Recitations (audio), reciter list, riwayat and surah names | [mp3quran.net](https://mp3quran.net/) API v3. Each recitation is by the reciter named in the player and streams from mp3quran.net's servers. | `quran.js` |

### Adhkar and duas

| What | Source | Used in |
|---|---|---|
| Book | *Hisn al-Muslim* (Fortress of the Muslim) by Saʿid ibn ʿAli ibn Wahf al-Qahtani | Adhkar tab, Today tab, full screen |
| Arabic text, transliteration, English translation, repeat counts | [hisnmuslim.com](https://www.hisnmuslim.com/) ([index](https://www.hisnmuslim.com/api/en/husn_en.json)), copied unchanged into `hisn-text.json` by `scripts/fetch-hisn.mjs` | `hisn-text.json`, `adhkar.js` |
| Arabic chapter and dua recordings | hisnmuslim.com, streamed from their site | `hisn.js`, `adhkar.js`, `app.js` |
| Spoken Bismillah alert sound | hisnmuslim.com's recording of chapter 8, entry 1 (`audio/ar/12.mp3`), saved unchanged so it plays offline; the app plays only 5.5–6.6 s, where "Bismillah" is said on its own | `audio/bismillah.mp3` |
| Hadith and verse references beside Today-tab duas | Given in `adhkar.js` where known. Every dua also names its Hisn al-Muslim chapter. | `adhkar.js` |

### Adhan and alert sounds

| What | Source | Used in |
|---|---|---|
| Adhan recordings: Makkah, Egyptian style, Masjid al-Aqsa, Ottoman style (Shaykh Nazim), Mishary al-Afasy; Fajr adhans by Mansoor az-Zahrani and Mishary al-Afasy | Bundled with the open-source [Adhan Clock](https://github.com/adhanclock/PWA) | `audio/` |
| Soft beep | Generated in the app (`beepWav` in `logic.js`); no recording | `app.js` |

### Prayer and iqama times

| What | Source | Licence | Used in |
|---|---|---|---|
| Prayer time calculator | [PrayTimes.org](http://praytimes.org/) v2.3 by Hamid Zarrabi-Zadeh, as adapted in Adhan Clock | GNU LGPL 3.0, see `lib/PRAYTIMES-LICENSE` | `lib/PrayTimes.js` |
| Calculation methods and the adaptation above | [Adhan Clock](https://github.com/adhanclock/PWA) © 2022 AdhanClock.com | MIT, see `lib/ADHANCLOCK-LICENSE` | `lib/` |
| Iqama and Jumuʿah times near the masjid | [Islamic Society of Central Jersey](https://iscj.org/#prayer-times), read from iscj.org | | `functions/`, `scripts/fetch-iqama.mjs`, `iqama.json` |

### Weather and places

| What | Source | Licence |
|---|---|---|
| Weather and forecast | [Open-Meteo.com](https://open-meteo.com/) | CC BY 4.0 |
| Air quality | Open-Meteo, using [Copernicus Atmosphere Monitoring Service](https://atmosphere.copernicus.eu/) information | CC BY 4.0 (Open-Meteo); Copernicus licence |
| Place search | Open-Meteo geocoding, using [GeoNames](https://www.geonames.org/) | CC BY 4.0 |
| US weather warnings, watches and advisories | [National Weather Service](https://www.weather.gov/) (NOAA), from [api.weather.gov](https://www.weather.gov/documentation/services-web-api) through `functions/api/alerts.js` | Public domain (US government work). Not affiliated with or endorsed by the NWS |

## Artwork

- The watercolours of the Kaaba and Masjid an-Nabawi in `art/` and the reciter and surah cards (`quran-art.js`) were drawn
  for Iqama Times (`scripts/art/paint.py`); no outside artwork is used.

## Libraries and fonts

| What | Source | Licence | Where |
|---|---|---|---|
| Animation | [Motion](https://motion.dev/) © Motion B.V. | MIT, see `vendor/MOTION-LICENSE.md` | `vendor/motion.min.js` |
| Screenshot for the feedback form (loaded only when the form opens) | [html-to-image](https://github.com/bubkoo/html-to-image) © 2017-2025 W.Y. | MIT, see `vendor/HTML-TO-IMAGE-LICENSE` | `vendor/html-to-image.min.js` |
| UI components | [daisyUI](https://daisyui.com/) 5 and [Tailwind CSS](https://tailwindcss.com/) 4, built into `daisy.css` by `scripts/daisy/build.sh` | MIT | `daisy.css` |
| Fonts | Amiri, Aref Ruqaa, IBM Plex Sans, Kalam and Newsreader in the app; Amiri, IBM Plex Sans and Newsreader in the guide. The [Google Fonts](https://fonts.google.com/) releases as packaged by [Fontsource](https://fontsource.org/) 5.3.0, unchanged, served from this site | SIL Open Font License 1.1, see `fonts/*-OFL.txt` | `fonts.css`, `fonts/` |
