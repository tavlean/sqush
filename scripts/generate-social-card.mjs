/**
 * Renders static/social-card.png, the og:image / twitter:image.
 *
 * Kept as a script rather than a hand-made binary so the card is reproducible
 * from source: the logomark comes from the one canonical file, the palette from
 * the same hex values the intro uses, and the wordmark from the shipped Satoshi
 * face. Re-run after any brand change (`npm run social-card`).
 *
 * Light surface on purpose: it matches the landing a visitor reaches one click
 * later. The always-dark editor would be the other defensible choice, but the
 * first screen wins for continuity.
 *
 * 1200x630 is the size Open Graph consumers crop from. Cards are often rendered
 * a fifth of that size in a chat sidebar, so the wordmark and tagline carry the
 * message and nothing load-bearing is set below 26px.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = new URL('../', import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, repoRoot)));

const WIDTH = 1200;
const HEIGHT = 630;

// Same values as the intro's light-mode tokens (Intro.svelte --i-*). Duplicated
// deliberately: this runs in Node with no CSS pipeline, and a drifted card is a
// visible bug rather than a silent one.
const PAGE = '#f4f3f1';
const INK = '#1a1a1e';
const MUTED = 'rgba(26, 26, 30, 0.7)';
const FAINT = 'rgba(26, 26, 30, 0.62)';
const ACCENT = '#e4602f';

const logomark = read('src/lib/brand/logomark.svg').toString('utf8');
const satoshi = read('static/fonts/Satoshi-Variable.woff2').toString('base64');

// The mark inherits `currentColor`, so colour is set on its wrapper.
const html = `<!doctype html>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Satoshi';
    src: url(data:font/woff2;base64,${satoshi}) format('woff2');
    font-weight: 300 900;
    font-display: block;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    background: ${PAGE};
    font-family: 'Satoshi', system-ui, sans-serif;
    color: ${INK};
    display: grid;
    place-items: center;
    -webkit-font-smoothing: antialiased;
  }
  /* Dashed viewfinder, echoing the promoted "frame" landing design. */
  .frame {
    position: absolute;
    inset: 38px;
    border: 2px dashed rgba(26, 26, 30, 0.16);
    border-radius: 22px;
  }
  .stack { display: flex; flex-direction: column; align-items: center; gap: 30px; }
  .lockup { display: flex; align-items: center; gap: 30px; }
  .mark { width: 116px; height: 127px; color: ${INK}; display: block; }
  .mark svg { width: 100%; height: 100%; display: block; }
  .wordmark {
    font-size: 132px;
    font-weight: 700;
    letter-spacing: -0.045em;
    line-height: 0.9;
  }
  .tagline { font-size: 38px; font-weight: 500; color: ${MUTED}; letter-spacing: -0.015em; }
  .formats {
    font-size: 27px;
    font-weight: 600;
    color: ${FAINT};
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }
  .formats b { color: ${ACCENT}; font-weight: 600; }
</style>
<div class="frame"></div>
<div class="stack">
  <div class="lockup">
    <span class="mark">${logomark}</span>
    <span class="wordmark">Frisp</span>
  </div>
  <p class="tagline">Compress and convert images in your browser</p>
  <p class="formats">WebP &middot; AVIF &middot; JPEG XL &middot; JPEG &middot; PNG &middot; <b>Nothing uploaded</b></p>
</div>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(fileURLToPath(new URL('static/social-card.png', repoRoot)), png);
  console.log(`Wrote static/social-card.png (${WIDTH}x${HEIGHT}, ${png.length} bytes)`);
} finally {
  await browser.close();
}
