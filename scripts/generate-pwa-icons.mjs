/**
 * Renders static/icon-192.png and static/icon-512.png, the web-app-manifest
 * install icons.
 *
 * Kept as a script rather than hand-made binaries for the same reason as
 * generate-social-card.mjs: the icons are reproducible from source, with the
 * logomark coming from the one canonical file and the ground from the dark
 * half of Intro's --i-* token contract. Re-run after any brand change
 * (`npm run pwa-icons`).
 *
 * One set serves both `purpose: any` and `purpose: maskable`. The mark's
 * bounding box is sized so its corners stay inside the maskable safe zone (a
 * centred circle spanning 80% of the icon), which doubles as comfortable
 * padding when the icon is shown unmasked. The ground is full-bleed on
 * purpose: maskable icons must have no transparent margin, or Android pads
 * them onto a white plate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const repoRoot = new URL('../', import.meta.url);
const read = (p) => readFileSync(fileURLToPath(new URL(p, repoRoot)));

// The dark half of Intro.svelte's --i-* token contract, duplicated for the
// same reason the social-card script duplicates it: this runs in Node with no
// CSS pipeline, and a drifted icon is a visible bug rather than a silent one.
const PAGE = '#111113';
const MARK = '#f5f5f7';

// Mark height as a fraction of the icon. At 0.56, with the mark's 1650:1800
// aspect, the bounding-box corner sits at radius ~0.38 from centre, inside
// the 0.40 maskable safe zone with a little slack.
const MARK_HEIGHT = 0.56;

const SIZES = [192, 512];

const logomark = read('src/lib/brand/logomark.svg').toString('utf8');

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const html = `<!doctype html>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; }
  html, body { width: ${size}px; height: ${size}px; }
  body {
    background: ${PAGE};
    display: grid;
    place-items: center;
  }
  .mark {
    height: ${Math.round(size * MARK_HEIGHT)}px;
    width: ${Math.round(size * MARK_HEIGHT * (1650 / 1800))}px;
    color: ${MARK};
  }
  .mark svg { width: 100%; height: 100%; display: block; }
</style>
<span class="mark">${logomark}</span>`;

    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'load' });
    const shot = await page.screenshot({ type: 'png' });
    const out = `static/icon-${size}.png`;
    writeFileSync(fileURLToPath(new URL(out, repoRoot)), shot);
    await page.close();
    console.log(`Wrote ${out} (${size}x${size}, ${shot.length} bytes)`);
  }
} finally {
  await browser.close();
}
