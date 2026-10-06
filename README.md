# robwizzie.github.io
[![Site checks](https://github.com/robwizzie/robwizzie.github.io/actions/workflows/site-checks.yml/badge.svg)](https://github.com/robwizzie/robwizzie.github.io/actions/workflows/site-checks.yml)

My own personal website, [robwiscount.org](https://robwiscount.org). Plain HTML, CSS and JavaScript with no
framework or build step; [how-it-works.html](https://robwiscount.org/how-it-works.html) explains how it's put together.

## Tests

Every pull request runs [Playwright](https://playwright.dev) against the real page at desktop and phone sizes,
with every outside API mocked (`tests/specs/mock.js`), plus a Lighthouse report.

```bash
cd tests && npm ci && npx playwright install chromium && npm test
```

## Live mode (`workers/live/`)

Live cursors, the visitor map, the guestbook, visit sources and the Letterboxd card run on a Cloudflare
Worker. See [workers/live/README.md](workers/live/README.md) to deploy it; the admin page is `/admin.html`.

## Fetch web build (`play/fetch/`)

The playable Fetch demo is a Godot 4.7.2 **Web (no threads)** export of
[robwizzie/fetch](https://github.com/robwizzie/fetch) — single-threaded so it runs on GitHub Pages
without COOP/COEP headers. To refresh it, add a `Web` export preset with
`variant/thread_support=false`, then:

```bash
godot --headless --path . --import            # twice on a fresh clone
godot --headless --path . --export-release "Web" build/web/index.html
cp build/web/* ../robwizzie.github.io/play/fetch/
```
