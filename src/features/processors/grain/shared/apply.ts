import type { Options } from './meta';

// Film grain, calibrated against Luminar Neo's default look — the measured
// model and its calibration data live in docs/project/specs/2026-07-12-film-grain.md.
// In short: monochrome white noise, amplitude following a midtone parabola of
// the pixel's own luma, samples drawn flatter-than-gaussian.
//
// `size` is the 1–100 slider value, 20 units per output pixel of particle
// scale (see meta.ts). At or below one pixel it's per-pixel noise (the
// calibrated film look, the default at 20); above, band-limited grain from a
// bilinear-interpolated noise lattice — measurably the efficient debanding
// shape: the codec's quantization deletes fine noise first, so coarser grain
// survives encoding at a fraction of the amplitude and byte cost (the size
// experiment is in the spec).
//
// Everything here is deterministic (fixed seed, PRNG consumption a function
// of dimensions and size alone): the encode signature, result cache,
// undo/redo and bulk staleness contracts all assume identical inputs produce
// identical bytes.

// sign(u)·|u|^SHAPE of uniform u has excess kurtosis ≈ −1.5, matching
// Luminar's default Roughness 30. SHAPE_SIGMA is that distribution's standard
// deviation, so dividing by it lets `peak` below be the literal grain σ at
// mid-gray in 8-bit units.
const SHAPE = 0.683;
const SHAPE_SIGMA = Math.sqrt(1 / (2 * SHAPE + 1));

// Measured: Luminar's Amount maps linearly to grain σ at mid-gray with this
// slope, and the maintainer's preferred looks (Amount 12 everyday, ~24
// creative) are expressed on that scale — so Frisp's slider adopts it 1:1.
const SIGMA_PER_AMOUNT = 0.44;

const SEED = 0x9e3779b9;

// Slider units per pixel of particle scale: slider 20 (the default) = 1px,
// 40 = 2px, 100 = 5px. Every slider step is a 0.05px change, so the growth
// between neighboring values is gradual instead of jumping whole pixels.
const SIZE_UNITS_PER_PIXEL = 20;

/** Add grain in place. `amount` and `size` are the 0–100 UI slider values. */
export function applyGrainToPixels(
  pixels: Uint8ClampedArray,
  width: number,
  amount: number,
  size: number,
): void {
  const peak = (SIGMA_PER_AMOUNT * amount) / SHAPE_SIGMA;
  const scale = size / SIZE_UNITS_PER_PIXEL;
  if (scale <= 1) {
    // Sub-pixel particles don't exist; everything at or below one pixel is
    // the calibrated per-pixel path (byte-identical to the original model).
    applyPerPixel(pixels, peak);
  } else {
    applyLattice(pixels, width, peak, scale);
  }
}

/** size 1: independent noise per pixel — the calibrated default. */
function applyPerPixel(pixels: Uint8ClampedArray, peak: number): void {
  let state = SEED;
  for (let i = 0; i < pixels.length; i += 4) {
    // xorshift32, advanced for every pixel — skipped pixels too — so the
    // noise field is a function of pixel index alone.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // Fully transparent pixels stay byte-identical: grain on invisible RGB
    // would only bloat PNG/lossless output.
    if (pixels[i + 3] === 0) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const u = (state >>> 0) / 0x80000000 - 1; // [-1, 1)
    const noise = Math.sign(u) * Math.abs(u) ** SHAPE;
    const delta = peak * 4 * luma * (1 - luma) * noise;
    // Uint8ClampedArray rounds and clamps on write.
    pixels[i] = r + delta;
    pixels[i + 1] = g + delta;
    pixels[i + 2] = b + delta;
  }
}

/**
 * scale > 1 (fractional allowed): bilinear interpolation over a noise
 * lattice with `scale`-pixel spacing. Interpolation shrinks variance
 * position-dependently (blended lattice nodes are independent), so every
 * pixel gets an exact 1/√(Σwᵢ²) correction — per-pixel σ stays identical to
 * the per-pixel path and the Amount scale means the same thing at every
 * size. Σwᵢ² is separable, ((1−fx)²+fx²)·((1−fy)²+fy²), so the correction
 * is a precomputed per-column factor times a per-row factor. Lattice rows
 * are generated on demand (two-row window) to keep memory flat.
 */
function applyLattice(
  pixels: Uint8ClampedArray,
  width: number,
  peak: number,
  scale: number,
): void {
  const height = pixels.length / 4 / width;
  const cols = Math.floor((width - 1) / scale) + 2;

  let state = SEED;
  const nextShaped = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const u = (state >>> 0) / 0x80000000 - 1;
    return Math.sign(u) * Math.abs(u) ** SHAPE;
  };
  const fillRow = (row: Float64Array) => {
    for (let i = 0; i < cols; i++) row[i] = nextShaped();
  };

  const gxArr = new Int32Array(width);
  const fxArr = new Float64Array(width);
  const invColNorm = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const gx = Math.floor(x / scale);
    const fx = x / scale - gx;
    gxArr[x] = gx;
    fxArr[x] = fx;
    invColNorm[x] = 1 / Math.sqrt((1 - fx) * (1 - fx) + fx * fx);
  }

  let top = new Float64Array(cols);
  let bottom = new Float64Array(cols);
  fillRow(top);
  fillRow(bottom);
  let topRow = 0;

  for (let y = 0; y < height; y++) {
    const gy = Math.floor(y / scale);
    // scale > 1 means gy advances by at most 1 per row, but keep the loop —
    // it's the honest invariant, not a hot path.
    while (topRow < gy) {
      const swap = top;
      top = bottom;
      bottom = swap;
      fillRow(bottom);
      topRow++;
    }
    const fy = y / scale - gy;
    const invRowNorm = 1 / Math.sqrt((1 - fy) * (1 - fy) + fy * fy);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] === 0) continue;
      const gx = gxArr[x];
      const fx = fxArr[x];
      const noise =
        ((top[gx] * (1 - fx) + top[gx + 1] * fx) * (1 - fy) +
          (bottom[gx] * (1 - fx) + bottom[gx + 1] * fx) * fy) *
        invColNorm[x] *
        invRowNorm;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const delta = peak * 4 * luma * (1 - luma) * noise;
      pixels[i] = r + delta;
      pixels[i + 1] = g + delta;
      pixels[i + 2] = b + delta;
    }
  }
}

export function applyGrain(data: ImageData, options: Options): ImageData {
  const pixels = new Uint8ClampedArray(data.data);
  applyGrainToPixels(pixels, data.width, options.amount, options.size);
  return new ImageData(pixels, data.width, data.height);
}
