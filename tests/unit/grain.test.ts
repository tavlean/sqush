import { describe, expect, it } from 'vitest';
import { applyGrainToPixels } from '../../src/features/processors/grain/shared/apply';
import { grainIsReal } from '../../src/client/lazy-app/feature-meta/shared';

// The numeric assertions test the CALIBRATED model, not implementation
// details: σ ≈ 0.44·amount at mid-gray, a 4L(1−L) midtone parabola, and
// monochrome deltas. Tolerances are statistical (128×128 = 16k samples).
// Calibration data: docs/project/specs/2026-07-12-film-grain.md.

const SIZE = 128;

function flatPixels(r: number, g = r, b = r, a = 255): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }
  return pixels;
}

function channelStd(pixels: Uint8ClampedArray, base: number): number {
  let sum = 0;
  let sumSq = 0;
  const n = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    const d = pixels[i] - base;
    sum += d;
    sumSq += d * d;
  }
  const mean = sum / n;
  return Math.sqrt(sumSq / n - mean * mean);
}

describe('applyGrainToPixels', () => {
  it('is deterministic: identical runs produce identical bytes', () => {
    const a = flatPixels(128);
    const b = flatPixels(128);
    applyGrainToPixels(a, SIZE, 50, 1);
    applyGrainToPixels(b, SIZE, 50, 1);
    expect(a).toEqual(b);
  });

  it('amount 0 is a byte-level no-op', () => {
    const pixels = flatPixels(128);
    applyGrainToPixels(pixels, SIZE, 0, 1);
    expect(pixels).toEqual(flatPixels(128));
  });

  it('hits the calibrated σ ≈ 0.44·amount at mid-gray', () => {
    for (const amount of [12, 50, 100]) {
      const pixels = flatPixels(128);
      applyGrainToPixels(pixels, SIZE, amount, 1);
      const sigma = channelStd(pixels, 128);
      expect(sigma).toBeGreaterThan(0.44 * amount * 0.93);
      expect(sigma).toBeLessThan(0.44 * amount * 1.07);
    }
  });

  it('follows the midtone parabola: quarter-tones get ~75% of peak σ', () => {
    const mid = flatPixels(128);
    const quarter = flatPixels(64);
    applyGrainToPixels(mid, SIZE, 50, 1);
    applyGrainToPixels(quarter, SIZE, 50, 1);
    // 4L(1−L) at L=64/255 is ≈ 0.752 of the mid-gray peak.
    const ratio = channelStd(quarter, 64) / channelStd(mid, 128);
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(0.81);
  });

  it('fades to (near) nothing at the tonal extremes', () => {
    for (const tone of [0, 255]) {
      const pixels = flatPixels(tone);
      applyGrainToPixels(pixels, SIZE, 100, 1);
      expect(channelStd(pixels, tone)).toBeLessThan(1);
    }
  });

  it('adds monochrome grain: R, G and B move together', () => {
    const pixels = flatPixels(120, 130, 140);
    applyGrainToPixels(pixels, SIZE, 50, 1);
    for (let i = 0; i < pixels.length; i += 4) {
      const dr = pixels[i] - 120;
      const dg = pixels[i + 1] - 130;
      const db = pixels[i + 2] - 140;
      // Independent per-channel rounding/clamping allows ±1 divergence.
      expect(Math.abs(dr - dg)).toBeLessThanOrEqual(1);
      expect(Math.abs(dr - db)).toBeLessThanOrEqual(1);
    }
  });

  it('leaves fully transparent pixels byte-identical', () => {
    const pixels = flatPixels(128, 128, 128, 0);
    applyGrainToPixels(pixels, SIZE, 100, 1);
    expect(pixels).toEqual(flatPixels(128, 128, 128, 0));
  });

  it('never touches alpha', () => {
    const pixels = flatPixels(128, 128, 128, 137);
    applyGrainToPixels(pixels, SIZE, 100, 1);
    for (let i = 3; i < pixels.length; i += 4) {
      expect(pixels[i]).toBe(137);
    }
  });

  it('slider size ≤ 20 is byte-identical to the per-pixel path', () => {
    const one = flatPixels(128);
    const twenty = flatPixels(128);
    applyGrainToPixels(one, SIZE, 50, 1);
    applyGrainToPixels(twenty, SIZE, 50, 20);
    expect(twenty).toEqual(one);
  });

  it('coarse sizes keep the calibrated per-pixel σ (normalized interpolation)', () => {
    for (const size of [30, 40, 60, 100]) {
      const pixels = flatPixels(128);
      applyGrainToPixels(pixels, SIZE, 50, size);
      const sigma = channelStd(pixels, 128);
      expect(sigma).toBeGreaterThan(0.44 * 50 * 0.93);
      expect(sigma).toBeLessThan(0.44 * 50 * 1.07);
    }
  });

  it('coarser sizes are more spatially correlated, fine grain is not', () => {
    const grainField = (size: number) => {
      const pixels = flatPixels(128);
      applyGrainToPixels(pixels, SIZE, 50, size);
      return pixels;
    };
    const lag1 = (pixels: Uint8ClampedArray) => {
      // horizontal lag-1 autocorrelation of the green-channel grain
      let sum = 0;
      let sumSq = 0;
      let cross = 0;
      let n = 0;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE - 1; x++) {
          const a = pixels[(y * SIZE + x) * 4 + 1] - 128;
          const b = pixels[(y * SIZE + x + 1) * 4 + 1] - 128;
          sum += a;
          sumSq += a * a;
          cross += a * b;
          n++;
        }
      }
      const mean = sum / n;
      return (cross / n - mean * mean) / (sumSq / n - mean * mean);
    };
    expect(Math.abs(lag1(grainField(20)))).toBeLessThan(0.1);
    expect(lag1(grainField(40))).toBeGreaterThan(0.3);
    // fractional scales sit smoothly between the whole-pixel steps
    expect(lag1(grainField(30))).toBeGreaterThan(
      Math.abs(lag1(grainField(20))),
    );
    expect(lag1(grainField(40))).toBeGreaterThan(lag1(grainField(30)));
    expect(lag1(grainField(80))).toBeGreaterThan(lag1(grainField(40)));
  });

  it('coarse size is deterministic too', () => {
    const a = flatPixels(128);
    const b = flatPixels(128);
    applyGrainToPixels(a, SIZE, 50, 45);
    applyGrainToPixels(b, SIZE, 50, 45);
    expect(a).toEqual(b);
  });
});

describe('grainIsReal', () => {
  it('requires enabled AND a non-zero amount', () => {
    expect(grainIsReal({ enabled: true, amount: 12, size: 20 })).toBe(true);
    expect(grainIsReal({ enabled: true, amount: 0, size: 20 })).toBe(false);
    expect(grainIsReal({ enabled: false, amount: 12, size: 20 })).toBe(false);
  });
});
