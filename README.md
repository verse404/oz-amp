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
4. **Email Sign-In & Auto-Save Account Sync + Home-City Interstate Trip & Curfew Helper**:
   - Register or sign in with your email (`scrypt`-hashed passwords, `HttpOnly; SameSite=Strict` session cookies) to automatically save and restore your favourite singers, armed reminders, custom world festivals, Home City, and theme across visits and devices—plus switch your `Home` base between **Sydney** and **Melbourne** to spot interstate-only exclusives, pre-presale hotel reminders, and venue curfews/last trains.

5. **My Singer Sessions (`#/my-sessions`) & World Festivals (`#/world-festivals`)**:
   - Dedicated 275-singer watchlist session tracker plus a global music festival hub (**Coachella**, **Tomorrowland**, **Burning Man**, **Fuji Rock**, **Wonderfruit**, **Boom Festival**, all-in AUD trip budgets, entry/camping logistics, and live worldwide festival discovery).
6. **Nearby Asia-Pacific Short-Flight Radar & Venue Sightline Guides**:
   - Tracks nonstop short-flight stops in **Tokyo**, **Singapore**, **Bangkok**, **Hong Kong**, and **Auckland** for watchlist singers, 1-click **Spotify / Apple Music / Setlist.fm** previews, Melbourne & Sydney venue sightline/restricted-view/bag guides, installable **PWA phone mode**, cross-device `.json` profile sync, and background **7:30 AM AEDT** mobile push alerts via GitHub Actions.

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

## Autonomous Long-Term Operation (No Local Machine Required)

- **Always-Live Public Feeds (`$0`, No Key)**: Trending Popular Music (`AU`/`US`/`UK`/`JP` Top 25 + 30s audio previews via Apple Music RSS), Live Artist Search (Apple Music + MusicBrainz), Worldwide Festival Discovery (Wikipedia/Wikimedia), Australian Tour Press Wire (Music Feeds, Tone Deaf, Beat Melbourne), and Smart Tour Importer all run directly on Render with zero external maintenance.
- **Daily Automated Sync**: GitHub Actions (`.github/workflows/daily-gig-sync.yml`) runs every morning at **7:30 AM AEDT**, pruning past shows, pulling fresh tour news, and pushing updates to trigger a clean Render redeploy. Even if GitHub Actions is paused, Render automatically refreshes its cache every 24 hours on demand.
- **Recommended 2-Minute Setup for Perpetual 2028+ Concerts & Permanent Cloud Accounts on Render Free Tier**:
  - Add a free `TICKETMASTER_API_KEY` (5,000 calls/day from [Ticketmaster Developer Portal](https://developer.ticketmaster.com/)) to **GitHub → Settings → Secrets and variables → Actions** and/or **Render → Environment** so OZ Amp automatically ingests up to 160 newly listed Melbourne & Sydney concerts indefinitely.
  - Add free **Upstash Redis** credentials (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, `$0` permanent free tier at [Upstash](https://upstash.com/)) to **Render → Environment** so email accounts and saved preferences persist permanently across Render Free Tier container redeploys.
  - Optionally add `REMINDER_WEBHOOK_URL` (Discord, Slack, Telegram, or Bark iOS) for automated morning phone alerts.
