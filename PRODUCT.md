# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Muslim households: a screen at home (a spare tablet on the wall, a phone, a computer or a smart TV) that shows adhan and iqama times all day. Everyone from children to older relatives reads it, often from across the room.
- Masjids: a screen in the masjid showing the same times to people walking past.
- Each person or masjid sets the app up on their own, with no one to help them, so every setting must explain itself.

## Product Purpose

Your salah companion: adhan and iqama times on any screen, even your smart TV. A countdown to the next prayer, alerts, weather, daily duas, adhkar and a Quran player on one screen you can read from across the room.
Success: the screen is set up once and then trusted all day without anyone touching it, reloading it or wondering whether a time is right.

## Positioning

- Free, with no account and no ads; settings stay on this device.
- Runs on old and cheap screens (a 2015 Fire 7, smart TV browsers) as well as new ones.
- Reads a nearby masjid's real iqama times (the nearest on the MASJIDS list in logic.js within 10 miles; today only ISCJ, via /api/iqama) and calculates adhan times anywhere. A new device starts at its approximate location (/api/where) and asks to confirm it.
- Looks like a printed masjid timetable rather than a phone app.

## Operating Context

- Usually left running all day on a wall or stand, never reloaded by hand. The developer's own screen is a Fire 7 (2015, Android 5.1.1, Silk/Chrome 108, 1024×648) on a wall.
- Seen from a distance as well as up close; used with touch, mouse, keyboard and TV remotes.
- At night it may be in a bedroom or a dark room.

## Capabilities and Constraints

- Static site with no build step, hosted on Cloudflare Pages; a Cloudflare function serves ISCJ iqama times.
- Online, it updates itself (new app versions, iqama times, weather) without anyone reloading it, and never shows stale information.
- Offline, it keeps showing adhan times, alerts, downloaded and played Quran audio and the adhan recordings.
- ISCJ supplies only iqama and Jumu'ah times, never prayer start times.
- Interface wording says "this device", never "this tablet".
- Arabic prayer names appear in every look.

## Design

- DESIGN.md is the baseline for all future work: the printed sheet for times, and the approved rounded controls with their motion for everything you press.

## Evidence on Hand

- User guide: /guide/ (built from scripts/guide/chapters).
- Sources and licences: CREDITS.md.
- No testimonials, usage numbers or masjid partnerships are recorded; do not invent them.

## Product Principles

1. Glanceable first: the next prayer and its time must be clear from across the room, before anything else.
2. Set up once, trusted all day: no stale times, no reloads, no surprises.
3. Every setting explains itself in plain words, because no one is there to help.
4. Gentle on eyes and screens: very little light at night, safe from burn-in.
5. Works on the oldest supported device as well as the newest.

## Accessibility & Inclusion

- Older users: large text, simple words, forgiving tap targets.
- Readable from across the room on wall tablets and TVs.
- Arabic and English side by side (prayer names, duas, transliteration).
- Works with a screen reader, a keyboard and a TV remote, not only touch.
