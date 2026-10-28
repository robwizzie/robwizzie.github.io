// Renders og-src/og-video.html to the link preview: assets/og-video.mp4 (what iMessage plays) and
// assets/og-video-poster.png (its first frame, the og:image every other app shows). Needs ffmpeg.
//   node build-og-video.js           render both files
//   node build-og-video.js --fps 30  frame rate (default 30)
const { chromium } = require('@playwright/test');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const root = path.resolve(__dirname, '..');
const PORT = 4175;
const FPS = process.argv.indexOf('--fps') > -1 ? Number(process.argv[process.argv.indexOf('--fps') + 1]) : 30;

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'og-frames-'));
  try {
    for (let i = 0; i < 50; i++) { // wait for the server
      try { await fetch('http://localhost:' + PORT + '/og-src/og-video.html'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
    }
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto('http://localhost:' + PORT + '/og-src/og-video.html?capture', { waitUntil: 'networkidle' });
    // Draw one frame at the very end so every icon font face gets requested, then wait for them all
    await page.evaluate(async () => { render(12.5); render(0); await document.fonts.ready; await window.ready; });

    const duration = await page.evaluate(() => window.DURATION);
    const total = Math.round(duration * FPS);
    for (let f = 0; f < total; f++) {
      await page.evaluate((t) => render(t), f / FPS);
      await page.screenshot({ path: path.join(frames, String(f).padStart(4, '0') + '.png') });
    }
    await page.evaluate(() => render(0));
    await page.screenshot({ path: path.join(root, 'assets/og-video-poster.png') });
    await browser.close();

    // H.264 baseline-friendly MP4 that Messages, Slack and browsers all play: yuv420p, faststart, silent track omitted.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%04d.png'),
      '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '24',
      '-tune', 'animation', '-movflags', '+faststart', '-an', path.join(root, 'assets/og-video.mp4')], { stdio: 'inherit' });
    console.log('Wrote assets/og-video.mp4 (' + (fs.statSync(path.join(root, 'assets/og-video.mp4')).size / 1024 | 0) + ' KB, ' +
      total + ' frames) and assets/og-video-poster.png');
  } finally {
    server.kill();
    fs.rmSync(frames, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
