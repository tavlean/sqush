/**
 * Renders static/social-card.png, the og:image / twitter:image.
 *
 * Kept as a script rather than a hand-made binary so the card is reproducible
 * from source: the logomark comes from the one canonical file, the palette from
 * the same token values Intro.svelte uses, and the wordmark from the shipped
 * Satoshi face. Re-run after any brand change (`npm run social-card`).
 *
 * The composition deliberately mirrors the production landing
 * (src/lib/editor/intro/Intro.svelte), because a preview should look like the
 * page behind the link: dark viewfinder, brand reduced to small HUD micro-copy
 * top-left, the statement headline as the hero at weight 900, and the format list
 * along the bottom. Keep the two in step when the landing changes.
 *
 * 1200x630 is the size Open Graph consumers crop from. Cards are often rendered
 * a fifth of that size in a chat sidebar, so the headline carries the message and
 * nothing load-bearing sits below 20px.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = new URL('../', import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, repoRoot)));

const WIDTH = 1200;
const HEIGHT = 630;

// The dark half of Intro.svelte's --i-* token contract. Duplicated deliberately:
// this runs in Node with no CSS pipeline, and a drifted card is a visible bug
// rather than a silent one.
const PAGE = '#111113';
const TEXT_1 = '#f5f5f7';
const TEXT_2 = 'rgba(245, 245, 247, 0.74)';
const TEXT_3 = 'rgba(245, 245, 247, 0.66)';
const ACCENT = '#ff8a5e';
// Same hue, dialled back so the frame reads as chrome and the headline keeps the
// one full-strength accent moment.
const ACCENT_DIM = 'rgba(255, 138, 94, 0.72)';

// Frame geometry follows the landing: 24px corner radius, inset from the edge.
const INSET = 30;
const RADIUS = 24;

const logomark = read('src/lib/brand/logomark.svg').toString('utf8');
const satoshi = read('static/fonts/Satoshi-Variable.woff2').toString('base64');

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
    color: ${TEXT_1};
    -webkit-font-smoothing: antialiased;
    position: relative;
    overflow: hidden;
  }

  /* The surface stays FLAT on purpose. An earlier version had a soft accent glow
     behind the headline, echoing the landing's .frame-glow, but it was barely
     perceptible and it tripled the PNG: 203 kB with it, 58 kB without, because a
     wide gradient defeats PNG's row filters. Shipping a needlessly heavy image
     from an image-optimizer would be a poor advertisement, and the flat surface
     reads cleaner anyway. */
  /* The viewfinder. Round caps on a near-zero dash length give true dots: the
     landing's "7 9" dashes are correct at viewport scale but read as a solid
     hairline once shrunk to a preview thumbnail.
     An SVG is a replaced element, so "inset: 0" alone would leave it at its
     intrinsic 300x150 and clip the rect (the same trap Intro.svelte documents).
     It needs an explicit box. */
  .frame {
    position: absolute;
    top: 0;
    left: 0;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
  }

  .hud {
    position: absolute;
    display: flex;
    align-items: center;
  }
  .hud-tl { top: ${INSET + 34}px; left: ${INSET + 38}px; gap: 13px; }
  .hud-bc {
    bottom: ${INSET + 36}px;
    left: 0;
    right: 0;
    justify-content: center;
  }

  .mark { width: 31px; height: 34px; color: ${TEXT_1}; display: block; }
  .mark svg { width: 100%; height: 100%; display: block; }
  .brand-name {
    font-size: 27px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: ${TEXT_1};
  }

  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26px;
    padding: 0 96px;
    text-align: center;
  }
  /* Matches the landing's .headline: weight 900, -0.03em, 1.05 leading. */
  .headline {
    font-size: 96px;
    font-weight: 900;
    letter-spacing: -0.035em;
    line-height: 1.04;
  }
  .headline .accent { color: ${ACCENT}; }
  .subline {
    font-size: 34px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: ${TEXT_2};
  }
  /* The landing's .hud-line treatment, scaled up for a card. */
  .formats {
    font-size: 20px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: ${TEXT_3};
    display: flex;
    gap: 26px;
  }
</style>

<svg class="frame" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect
    x="${INSET}" y="${INSET}"
    width="${WIDTH - INSET * 2}" height="${HEIGHT - INSET * 2}"
    rx="${RADIUS}"
    fill="none"
    stroke="${ACCENT_DIM}"
    stroke-width="4"
    stroke-linecap="round"
    stroke-dasharray="0.01 19"
  />
</svg>

<div class="hud hud-tl">
  <span class="mark">${logomark}</span>
  <span class="brand-name">Frisp</span>
</div>

<div class="center">
  <h1 class="headline">Compress images<br /><span class="accent">in your browser.</span></h1>
  <p class="subline">No uploads. Works offline.</p>
</div>

<div class="hud hud-bc">
  <p class="formats">
    <span>WebP</span><span>AVIF</span><span>JPEG XL</span><span>JPEG</span><span>PNG</span>
  </p>
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
