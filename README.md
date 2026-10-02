# robwizzie.github.io
My own personal website

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
