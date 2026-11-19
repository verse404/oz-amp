# OZ Amp (`v2.0.0`) — Sydney & Melbourne Live Concert, Singer Radar & Ticket-Drop Guide

A standalone web application for discovering bands, singers, festivals, and live concerts across **Sydney (NSW)** and **Melbourne (VIC)** — featuring automatic favourite-singer tour announcement monitoring, Australian pre-sale countdowns, statutory resale caps, festival vs. sideshow math, interstate trip helpers, and a collectible ticket-stub wall.

---

## Core Highlights

1. **Favourite Singers Radar & Global Future Search (`#singers-monitor`)**:
   - **Live Global Artist Search (`/api/artists/search`)**: Queries **Apple Music AU** + **MusicBrainz** concurrently to find any singer or band worldwide with official artwork and bilingual aliases (`Jay Chou 周杰伦`, `Eason Chan 陈奕迅`, `Fujii Kaze 藤井風`, `YOASOBI ヨアソビ`, etc.).
   - **1-Click Category Chips & Bulk List Importer**: Select across *Global Pop*, *Mandopop & Cantopop*, *K-Pop & J-Pop*, and *Indie/Rock/Electronic*, or paste your own singer list.
   - **Auto-Announcement Alerts (`/api/artists/monitor-check`)**: Fires harmonic audio chimes and browser notifications as soon as a monitored singer announces a Sydney or Melbourne date, with 1-click search links across **Ticketek**, **Ticketmaster AU**, **Frontier**, and **Tixel**.
2. **Resale Guard (`+10%` NSW/VIC Legal Cap) & `T-48h` Production-Hold Sniper**:
   - Displays the exact **NSW Fair Trading / VIC Major Events Act `+10%` max legal resale price** on every concert card, links directly to **Tixel Auto-Buy** and **Ticketek Marketplace**, and offers `T-48h` stage production-hold drop reminders.
3. **Festival vs. Sideshow Value & Clash Advisor (`#festival-advisor`)**:
   - Compares full **Laneway 2027**, **Good Things 2026**, and **Golden Plains XIX** passes against standalone Sydney & Melbourne theatre sideshow prices while flagging stage set-time overlaps and `<10m` stage sprints.
4. **Home-City Interstate Trip, Hotel-Lock & Curfew / Last-Train Helper + Stub Wall (`#stub-wall`)**:
   - Switch your `Home` base between **Sydney** and **Melbourne** to spot interstate-only exclusives, arm pre-presale free-cancel hotel reminders, check strict outdoor noise curfews (`22:00` Opera House Forecourt, `22:30` Music Bowl) & last trains, and stamp collectible thermal ticket stubs with section sightline notes.

5. **My Singer Sessions (`#/my-sessions`) & World Festivals (`#/world-festivals`)**:
   - Dedicated 275-singer watchlist session tracker plus a global music festival hub (**Coachella**, **Tomorrowland**, **Burning Man**, **Fuji Rock**, **Wonderfruit**, **Boom Festival**, and live worldwide festival discovery).

---

## Quick Start (Local Development & Production)

```bash
npm install
npm run build
npm start
```

Serves the app locally on `http://127.0.0.1:3102/` (or set `PORT=5182`).

## Free Cloud Deployment (Render.com)

1. Open [Deploy to Render Blueprint](https://render.com/deploy?repo=https://github.com/verse404/oz-amp) (or sign in to [Render](https://dashboard.render.com/) and select **New + → Blueprint**).
2. Connect `verse404/oz-amp` — Render automatically configures the free Docker web service via `render.yaml`.
