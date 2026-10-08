// Captures the live sites behind the Projects cards and frames each one in a browser window,
// writing the 1200×750 JPGs in assets/work/ (e.g. juice.jpg, pick5.jpg). Projects live in screenshots.json.
//   node screenshots.js                         every enabled project → ../assets/work
//   node screenshots.js --only juice,pick5      just these ids (disabled ones too)
//   node screenshots.js --out /tmp/shots        write somewhere else
//   node screenshots.js --urls juice=http://localhost:4191/,pick5=http://localhost:4191/how-it-works.html
//                                               capture other pages in place of the live sites (testing);
//                                               also read from SCREENSHOT_URLS. The URL pill keeps the real domain.
// Set CHROMIUM_PATH to use a specific Chromium build. A site that fails is skipped with a message;
// the run exits non-zero only if every selected project failed.
const { chromium } = require('@playwright/test');
const fs = require('fs'), path = require('path');

const root = path.resolve(__dirname, '..');
const W = 1200, H = 750;                         // final image
const WIN = { x: 90, y: 40, w: 1020, h: 670 };   // browser window inside it
const BAR = 30;                                  // title bar height (+1px divider)
const CONTENT = { w: WIN.w, h: WIN.h - BAR - 1 };
const VIEWPORT = { width: 1440, height: 900 };   // desktop view, same 16:10 shape as the content area

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : null;
}
const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'screenshots.json'), 'utf8'));
const only = list(arg('only'));
const outDir = path.resolve(arg('out') || path.join(root, 'assets/work'));
const overrides = Object.fromEntries(list(arg('urls') || process.env.SCREENSHOT_URLS).map((p) => {
  const i = p.indexOf('=');
  return [p.slice(0, i), p.slice(i + 1)];
}));

const unknown = only.filter((id) => !config.projects.some((p) => p.id === id));
if (unknown.length) {
  console.error('Unknown project id(s): ' + unknown.join(', ') + '. Known: ' + config.projects.map((p) => p.id).join(', '));
  process.exit(1);
}
const projects = config.projects.filter((p) => (only.length ? only.includes(p.id) : p.enabled !== false));
if (!projects.length) { console.error('No projects selected.'); process.exit(1); }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const interFont = (() => {
  try { return 'data:font/woff2;base64,' + fs.readFileSync(path.join(root, 'assets/fonts/inter-0.woff2')).toString('base64'); } catch (e) { return null; }
})();

// The frame: dark backdrop with a dot grid and a brand-colored glow, a macOS-style window with
// traffic-light dots and a URL pill, rounded corners and a soft shadow. Matches the hand-made images.
function frameHtml(p, shot) {
  const label = p.label || new URL(p.url).hostname.replace(/^www\./, '');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${interFont ? `@font-face{font-family:Inter;src:url(${interFont}) format('woff2');font-weight:100 900}` : ''}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:${p.bg || '#0b0c10'};position:relative;font-family:Inter,'Helvetica Neue',Arial,sans-serif}
.glow{position:absolute;inset:0;background:radial-gradient(ellipse 520px 300px at 50% -20px,${p.glow || '#1c2230'} 0%,${p.glow || '#1c2230'}cc 30%,transparent 100%)}
.grid{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,.055) 1px,transparent 1.4px);background-size:19.5px 19.5px;background-position:-0.5px -0.5px}
.win{position:absolute;left:${WIN.x}px;top:${WIN.y}px;width:${WIN.w}px;height:${WIN.h}px;border-radius:12px;overflow:hidden;background:#17181d;
  box-shadow:0 0 0 1px rgba(255,255,255,.09),0 24px 60px rgba(0,0,0,.55),0 8px 22px rgba(0,0,0,.35)}
.bar{height:${BAR}px;background:#17181d;border-bottom:1px solid rgba(0,0,0,.45);position:relative}
.dot{position:absolute;top:${BAR / 2 - 4}px;width:10px;height:10px;border-radius:50%}
.r{left:12px;background:#ff5f57}.y{left:28.5px;background:#febc2e}.g{left:45px;background:#28c840}
.pill{position:absolute;left:72px;top:7px;width:408px;height:18px;border-radius:5px;background:#23262d;color:#959ca7;
  font-size:10px;line-height:18px;padding-left:9px;letter-spacing:.1px;white-space:nowrap;overflow:hidden}
.shot{display:block;width:${CONTENT.w}px;height:${CONTENT.h}px;object-fit:cover;object-position:top center;background:#fff}
</style></head><body><div class="glow"></div><div class="grid"></div>
<div class="win"><div class="bar"><i class="dot r"></i><i class="dot y"></i><i class="dot g"></i><div class="pill">${esc(label)}</div></div>
<img class="shot" src="${shot}"></div></body></html>`;
}

// Best effort: click an obvious "accept" button in a cookie/consent banner, then hide what's left of it.
async function dismissBanners(page) {
  const words = /^(accept( all)?( cookies)?|allow( all)?( cookies)?|i agree|agree|got it|ok(ay)?|i understand|dismiss|close)$/i;
  for (const frame of page.frames()) {
    try {
      const buttons = frame.locator('button, [role="button"], a.cc-btn, input[type="button"], input[type="submit"]');
      const n = Math.min(await buttons.count(), 60);
      for (let i = 0; i < n; i++) {
        const b = buttons.nth(i);
        const text = ((await b.innerText({ timeout: 300 }).catch(() => '')) || (await b.getAttribute('value').catch(() => '')) || '').trim();
        if (!words.test(text) || !(await b.isVisible().catch(() => false))) continue;
        // Only click inside something that looks like a consent banner, so we don't press a site's own "OK".
        const inBanner = await b.evaluate((el) => {
          for (let n = el; n && n !== document.body; n = n.parentElement) {
            const s = ((n.id || '') + ' ' + (typeof n.className === 'string' ? n.className : '') + ' ' + (n.getAttribute('aria-label') || '')).toLowerCase();
            if (/cookie|consent|gdpr|privacy|cmp|onetrust|banner/.test(s)) return true;
          }
          return false;
        }).catch(() => false);
        if (inBanner) { await b.click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(400); break; }
      }
    } catch (e) { /* cross-origin frames etc. */ }
  }
  await page.addStyleTag({ content: '#onetrust-consent-sdk,#CybotCookiebotDialog,.cc-window,.cookie-banner,#cookie-banner,#cookie-notice,.cookie-consent,[id*="cookie-consent" i],[class*="cookie-consent" i],[aria-label*="cookie" i][role="dialog"]{display:none!important}' }).catch(() => {});
}

async function capture(browser, p) {
  const url = overrides[p.id] || p.url;
  const ctx = await browser.newContext({ viewport: p.width ? { width: p.width, height: Math.round(p.width / 1.6) } : VIEWPORT, deviceScaleFactor: 1, colorScheme: 'dark', locale: 'en-US', reducedMotion: 'reduce' });
  try {
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    if (!res) throw new Error('no response');
    if (res.status() >= 400) throw new Error('HTTP ' + res.status());
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => console.warn('  ' + p.id + ': network never went idle, capturing anyway'));
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await dismissBanners(page);
    if (p.hide && p.hide.length) await page.addStyleTag({ content: p.hide.join(',') + '{visibility:hidden!important}' });
    await page.evaluate(() => window.scrollTo(0, 0));
    // Let lazy images and entrance animations finish.
    await page.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete && i.getBoundingClientRect().top < innerHeight)
      .map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); })))).catch(() => {});
    await page.waitForTimeout(1500 + (p.wait || 0));
    const png = await page.screenshot({ type: 'png' });
    const title = await page.title().catch(() => '');
    return { png, title, url };
  } finally {
    await ctx.close();
  }
}

async function compose(browser, p, png) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    await page.setContent(frameHtml(p, 'data:image/png;base64,' + png.toString('base64')), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: W, height: H } });
  } finally {
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const failed = [];
  try {
    for (const p of projects) {
      try {
        const { png, title, url } = await capture(browser, p);
        const jpg = await compose(browser, p, png);
        const out = path.join(outDir, p.file);
        fs.writeFileSync(out, jpg);
        console.log('✓ ' + p.id + ': ' + url + (title ? ' ("' + title + '")' : '') + ' → ' + (path.relative(process.cwd(), out) || out) + ' (' + Math.round(jpg.length / 1024) + ' KB)');
      } catch (e) {
        failed.push(p.id);
        console.error('✗ ' + p.id + ': could not capture ' + (overrides[p.id] || p.url) + ', skipped. ' + String(e.message || e).split('\n')[0]);
      }
    }
  } finally {
    await browser.close();
  }
  if (failed.length === projects.length) { console.error('Every capture failed.'); process.exit(1); }
  if (failed.length) console.warn('Done with ' + failed.length + ' skipped: ' + failed.join(', '));
})().catch((e) => { console.error(e.message || e); process.exit(1); });
