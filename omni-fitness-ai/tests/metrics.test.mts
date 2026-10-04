/**
 * Regression tests for the canonical strength metrics and the Tracking screen's
 * shared time ranges.
 *
 * These run with Node's built-in test runner - no test framework dependency:
 *   node --test --experimental-strip-types tests/
 *
 * Every assertion here corresponds to a bug that was actually found during the
 * pre-release audit, or to a business rule the app depends on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  estimateOneRepMax,
  formatPercent,
  formatVolume,
  logVolumeKg,
  percentChange,
  personalRecords,
  repsPerSet,
  type RepsSource,
  type StrengthPoint,
} from "../src/data/workoutMetrics.ts";
import {
  TIME_FILTERS,
  daysForRange,
  isTimeFilter,
  rangeStartMs,
} from "../src/lib/timeRanges.ts";

const log = (over: Partial<RepsSource> = {}): RepsSource => ({
  weight: 60,
  setsCompleted: 3,
  reps: "10 x 3",
  ...over,
});

test("volume = weight x repsPerSet x setsCompleted", () => {
  assert.equal(logVolumeKg(log()), 1800); // 60 * 10 * 3
  assert.equal(logVolumeKg(log({ weight: 100, setsCompleted: 5, reps: "5 x 5" })), 2500);
});

test("3000 kg formats as 3.00 t (rule: canonical tonnage)", () => {
  assert.equal(formatVolume(3000), "3.00 t");
  assert.equal(formatVolume(1000), "1.00 t");
  assert.equal(formatVolume(2500), "2.50 t");
});

test("volume/format never emit NaN or Infinity", () => {
  for (const bad of [NaN, Infinity, -Infinity, -5]) {
    assert.equal(formatVolume(bad), "0 kg");
    assert.equal(logVolumeKg(log({ weight: bad })), 0);
  }
  assert.equal(logVolumeKg(log({ reps: null })), 0);
  assert.equal(logVolumeKg(log({ reps: "abc" })), 0);
  assert.equal(logVolumeKg(log({ setsCompleted: 0 })), 0);
  assert.equal(logVolumeKg(log({})), 1800);
});

test("bodyweight rows contribute zero volume", () => {
  assert.equal(logVolumeKg(log({ weight: 0 })), 0);
});

test("repsPerSet parses the stored '<reps> x <sets>' format", () => {
  assert.equal(repsPerSet("10 x 3"), 10);
  assert.equal(repsPerSet("8 x 12"), 8);
  assert.equal(repsPerSet("3 x 1"), 3);
  // The range pattern must not false-positive on the literal "x" separator,
  // which would silently turn a 10-rep set into a 5.5-rep set.
  assert.equal(repsPerSet("10 x 20"), 10);
  assert.equal(repsPerSet("8-12"), 10); // documented midpoint approximation
  assert.equal(repsPerSet(null), 0);
});

test("e1RM uses Epley and guards impossible inputs", () => {
  assert.ok(Math.abs(estimateOneRepMax(100, 5)! - 100 * (1 + 5 / 30)) < 1e-9);
  assert.equal(estimateOneRepMax(60, 10), 80);
  // >15 reps is excluded rather than producing a nonsense number.
  assert.equal(estimateOneRepMax(100, 16), null);
  assert.equal(estimateOneRepMax(100, 0), null);
  assert.equal(estimateOneRepMax(100, -3), null);
  assert.equal(estimateOneRepMax(NaN, 5), null);
  // Bodyweight has no meaningful 1RM.
  assert.equal(estimateOneRepMax(0, 5), null);
  assert.equal(estimateOneRepMax(null, 5), null);
  // `weight > 0` accepts Infinity, which used to leak an Infinity 1RM.
  assert.equal(estimateOneRepMax(Infinity, 5), null);
  assert.equal(estimateOneRepMax(100, Infinity), null);
});

test("personal records only count genuine improvements", () => {
  const points: StrengthPoint[] = [
    { at: "2026-09-01T00:00:00.000Z", e1rm: 133.33 },
    { at: "2026-09-08T00:00:00.000Z", e1rm: 140 },
    { at: "2026-09-15T00:00:00.000Z", e1rm: 133 }, // regression: not a PR
    { at: "2026-09-22T00:00:00.000Z", e1rm: 146.67 },
    { at: "2026-09-29T00:00:00.000Z", e1rm: 146.67 }, // repeat: not a PR
  ];
  assert.equal(personalRecords(points).length, 3);
  // Input order must not matter.
  assert.equal(personalRecords([...points].reverse()).length, 3);
  assert.deepEqual(personalRecords([]), []);
});

test("percentChange is null rather than Infinity when previous is 0", () => {
  assert.equal(percentChange(100, 0), null);
  assert.equal(percentChange(100, -5), null);
  assert.equal(formatPercent(null), null);
  assert.equal(percentChange(110, 100), 10);
});

test("BUG: '6M' is 6 months, not 90 days (it silently matched '3M')", () => {
  assert.equal(daysForRange("7D"), 7);
  assert.equal(daysForRange("30D"), 30);
  assert.equal(daysForRange("3M"), 92);
  assert.equal(daysForRange("6M"), 183);

  const now = new Date(2026, 9, 4);
  assert.notEqual(rangeStartMs("3M", now), rangeStartMs("6M", now));
});

test("each range spans exactly as many day-buckets as it reports", () => {
  const now = new Date(2026, 9, 4);
  for (const label of TIME_FILTERS) {
    const days = daysForRange(label);
    const start = rangeStartMs(label, now);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const buckets = Math.round((today - start) / 86400000) + 1;
    assert.equal(buckets, days, `${label} window and bucket count disagree`);
  }
});

test("BUG: an unknown period label fails loudly instead of becoming 90 days", () => {
  assert.equal(isTimeFilter("1Y"), false);
  for (const bad of ["1M", "1Y", "ALL", ""]) {
    assert.throws(() => daysForRange(bad), /Unknown time filter/);
  }
});
