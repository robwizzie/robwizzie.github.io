# rw-live

Tiny Cloudflare Worker + one Durable Object behind the live bits of robwiscount.org (`js/live.js`):

- **`GET /live`** (WebSocket, Hibernation API): presence + other visitors' cursors. Each socket gets a random id and a coarse place (city / region / country from `request.cf`). Clients send `{t:'c', x, y}` (x = 0–1 of viewport width, y = 0–1 of document height, ~15/s max); the DO clamps, rate-limits (30 msg/s, 200 bytes) and relays `{t:'c', id, x, y}` to everyone else. Clients may send `{t:'d', d:'phone'|'tablet'|'desktop'}` once on connect; it's kept per socket and each peer carries it as `d` (empty if unknown). Joins/leaves broadcast `{t:'p', n, peers}`; new sockets get `{t:'hi', id, you, peers}`. Capped at 100 sockets. `ping` → `pong` is answered without waking the object.
- **`POST /visit`** `{"id": "<random per-day id>"}`: counts a visit at most once per browser per day, tallied by city (lat/lon rounded to 0.1°). Returns the same body as `/stats` plus `you`.
- **`GET /stats`**: `{ total, countries, cityCount, cities: [{city, region, country, lat, lon, n}] (top 150), recent: [{city, region, country, t}] (last 25), now }`. Cached 5 s in memory.

- **`POST /visit`** also takes where the visit came from: `ref` (only the referrer's host is kept, never the full URL), `r` (a tag Rob puts on links he sends, e.g. `?r=acme`), `utm_source` / `utm_medium` / `utm_campaign`, and `path`. Kept for 120 days.
- **`GET /letterboxd`**: the latest diary entries from `letterboxd.com/robwizzie/rss/` as JSON, cached 30 minutes.
- **`GET /guestbook`** / **`POST /guestbook`** `{"id", "name", "note"}`: plain-text notes (120 chars, no links), one per browser per day, max 30 an hour. New notes are `pending` until approved, unless `AUTO_APPROVE` is set.
- **`/admin/summary`**, **`POST /admin/note`** `{"id", "action": "approve" | "hide" | "delete"}`: need `Authorization: Bearer <ADMIN_TOKEN>`. Used by `/admin.html`.

CORS / WebSocket origins: `https://robwiscount.org`, `https://www.robwiscount.org`, `https://robwizzie.github.io`, `http://localhost:*`.

## Privacy

Only Cloudflare's coarse geolocation is used. IP addresses are never read, stored or sent; no cookies. The per-day browser id is generated client-side, hashed with the date before storage, and dedupe keys older than yesterday are deleted.

## Deploy

```sh
cd workers/live
npm install
npx wrangler login
npx wrangler deploy
```

Set the admin token once (any long random string; you'll paste it into `/admin.html`):

```sh
npx wrangler secret put ADMIN_TOKEN
```

After pulling new Worker code, run `npx wrangler deploy` again. Existing data is kept; new tables are created automatically.

Then put the printed URL (e.g. `https://rw-live.<you>.workers.dev`) in the site's `<head>`:

```html
<meta name="rw-live" content="https://rw-live.<you>.workers.dev">
```

Leave `content` empty to switch the feature off (the section stays hidden and nothing is requested).

## Local dev

`npm run dev` runs `wrangler dev --local` with `ALLOW_DEV_OVERRIDE=1`, so you can fake a location on any route with `?dev_city=Toronto&dev_region=ON&dev_country=CA&dev_lat=43.7&dev_lon=-79.4`. Point the meta tag at `http://localhost:8787` while serving the site from `http://localhost:*`. Never set `ALLOW_DEV_OVERRIDE` in production.
