#!/usr/bin/env node
// Compare two codec benchmark reports (before vs after a codec upgrade), per
// image fixture and per codec.
// Usage: node benchmarks/compare.mjs <before.json> <after.json>
// Defaults: before = benchmarks/baseline.json, after = benchmarks/results/current.json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const beforePath = process.argv[2] ?? here('./baseline.json');
const afterPath = process.argv[3] ?? here('./results/current.json');

const load = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Could not read benchmark report: ${p}\n  ${e.message}`);
    process.exit(1);
  }
};

const before = load(beforePath);
const after = load(afterPath);

const pct = (b, a) => (b ? ((a - b) / b) * 100 : 0);
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
// Size is exact and reproduces to the byte on one machine, so any real move is a
// regression and a tight tolerance is right.
const SIZE_TOL = 0.5;
// Time is not. Two back-to-back runs of this suite on the same machine, with no
// code change between them, drifted +10% to +60% per codec purely on machine
// state (thermal, whatever else is running). A tight timing gate therefore only
// ever fires on noise, so ONLY SIZE AND RELIABILITY DECIDE THE EXIT CODE. Timing
// is printed, and anything past the second threshold is called out loudly for a
// human to judge; deliberately, because a codec upgrade that halves the speed
// should not slip past unmentioned just because the gate cannot be automated.
const TIME_TOL = 12;
const TIME_SHOUT_TOL = 25;
const verdict = (v, tol) => {
  if (Math.abs(v) < tol) return '≈';
  return v < 0 ? '✓ better' : '✗ WORSE'; // lower (smaller/faster) is better
};

console.log(`\nCodec benchmark comparison`);
console.log(`  before: ${before.label}  (${before.generatedAt ?? '?'})`);
console.log(`  after:  ${after.label}  (${after.generatedAt ?? '?'})`);
if (before.machine?.cores !== after.machine?.cores) {
  console.log(
    `  ⚠ different machines (cores ${before.machine?.cores} vs ${after.machine?.cores}); timing not comparable`,
  );
}

let regressions = 0;
const slowdowns = [];

for (const af of after.fixtures ?? []) {
  const bf = (before.fixtures ?? []).find((x) => x.name === af.name);
  console.log(`\n[${af.name}]`);
  const header = [
    '  Codec'.padEnd(11),
    'size before'.padStart(11),
    'size after'.padStart(11),
    'size Δ'.padStart(9),
    ''.padEnd(9),
    'ms before'.padStart(10),
    'ms after'.padStart(9),
    'ms Δ'.padStart(8),
  ].join(' ');
  console.log(header);

  for (const a of af.codecs) {
    const b = bf?.codecs?.find((x) => x.format === a.format);
    if (!b) {
      console.log(`  ${a.label.padEnd(9)}  (new; no baseline)`);
      continue;
    }
    const sizePct = pct(b.outputBytes, a.outputBytes);
    const timePct = pct(b.medianMs, a.medianMs);
    const sv = verdict(sizePct, SIZE_TOL);
    const tv = verdict(timePct, TIME_TOL);
    if (sv.includes('WORSE') || !a.ok) regressions++;
    if (timePct > TIME_SHOUT_TOL) {
      slowdowns.push(
        `${af.name} / ${a.label}: ${b.medianMs}ms → ${a.medianMs}ms (${fmtPct(timePct)})`,
      );
    }
    console.log(
      [
        `  ${a.label.padEnd(9)}`,
        String(b.outputBytes).padStart(11),
        String(a.outputBytes).padStart(11),
        fmtPct(sizePct).padStart(9),
        sv.padEnd(9),
        String(b.medianMs).padStart(10),
        String(a.medianMs).padStart(9),
        fmtPct(timePct).padStart(8),
        !a.ok ? ' ✗ ENCODE FAILED' : '',
      ].join(' '),
    );
  }
}

console.log('');
if (slowdowns.length) {
  console.log(`⚠ ${slowdowns.length} timing(s) more than ${TIME_SHOUT_TOL}% slower:`);
  for (const line of slowdowns) console.log(`    ${line}`);
  console.log(
    '  Timing does not fail this check; the same suite drifts this much on machine\n' +
      '  state alone. Re-run on a quiet machine before believing any of it.',
  );
  console.log('');
}
console.log(
  regressions === 0
    ? '✓ No size or reliability regressions across any image type.'
    : `✗ ${regressions} codec/fixture pair(s) regressed; review above before shipping.`,
);
console.log('  (smaller bytes = better compression; lower ms = faster.)\n');
process.exit(regressions === 0 ? 0 : 1);
