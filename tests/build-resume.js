// Prints resume-src/resume.html to "Robert Wiscount Resume.pdf" (and its old alias Resume.pdf) with Chromium,
// the same way it was made by hand. Fails if the resume no longer fits on one Letter page.
//   node build-resume.js           build both PDFs
//   node build-resume.js --check   build into a temp file only, or into --out <file> (CI previews on pull requests)
const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const root = path.resolve(__dirname, '..');
const PORT = 4174;
const check = process.argv.includes('--check');
const outArg = process.argv.indexOf('--out') > -1 ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : null;

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { // wait for the server
      try { await fetch('http://localhost:' + PORT + '/resume-src/resume.html'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
    }
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage();
    await page.goto('http://localhost:' + PORT + '/resume-src/resume.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: 'print' });

    // Fit the main column to the sheet so the page is always full with no blank strip and nothing cut off,
    // however much the content changes. (resume.html reads --fs / --gap, with defaults when viewed on its own.)
    const fit = await page.evaluate(() => {
      const main = document.querySelector('main'), root = document.documentElement.style;
      // main spreads its sections with space-between; measure how much room is left over between them.
      const free = () => {
        const cs = getComputedStyle(main), last = main.lastElementChild;
        return main.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom) - last.getBoundingClientRect().bottom;
      };
      const fits = () => main.scrollHeight <= main.clientHeight && free() >= 0;
      const set = (fs) => root.setProperty('--fs', fs + 'pt');
      // The biggest body text that still leaves ~14px of air between each section (the page has four).
      let fs = 8.6;
      for (let f = 10; f >= 8.6; f = Math.round((f - 0.05) * 100) / 100) {
        set(f);
        main.style.justifyContent = 'flex-start';
        const ok = fits() && free() >= 14 * (main.children.length - 1);
        main.style.justifyContent = '';
        if (ok) { fs = f; break; }
      }
      set(fs);
      return { fs };
    });

    // The page is a fixed 8.5×11in sheet with overflow hidden, so overflow would silently cut text off. Catch it.
    const overflow = await page.evaluate(() => [...document.querySelectorAll('main, aside')]
      .filter((el) => el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.tagName.toLowerCase() + ' is ' + (el.scrollHeight - el.clientHeight) + 'px too tall'));
    if (overflow.length) throw new Error('The resume no longer fits on one page: ' + overflow.join(', ') + '. Trim it in resume-src/resume.html.');

    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await browser.close();

    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
    if (pages !== 1) throw new Error('Expected a 1-page PDF, got ' + pages + ' pages.');

    const outs = check ? [outArg || path.join(os.tmpdir(), 'resume-check.pdf')] : ['Robert Wiscount Resume.pdf', 'Resume.pdf'].map((f) => path.join(root, f));
    outs.forEach((f) => fs.writeFileSync(f, pdf));
    console.log('Resume OK: 1 page, body text ' + fit.fs + 'pt, ' + Math.round(pdf.length / 1024) + ' KB → ' + outs.map((f) => path.relative(root, f) || f).join(', '));
  } finally {
    server.kill();
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
