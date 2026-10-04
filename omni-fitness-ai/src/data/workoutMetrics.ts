/**
 * Canonical strength metrics.
 *
 * Every training-volume, estimated-1RM and personal-record figure in the app must
 * come from this module. The previous implementation computed volume twice with two
 * different formulas (one omitting repetitions entirely), so the headline total
 * could never reconcile with the per-session figures shown beneath it.
 *
 * Data model note: `workout_logs` stores one row per exercise per session, holding a
 * single weight plus a sets count and a repetitions string. Individual sets are not
 * persisted, so set-level detail ("60x8, 60x8, 65x6") cannot be reconstructed. All
 * figures below are derived from that per-exercise record and nothing more.
 */

export interface RepsSource {
  weight?: number | null;
  setsCompleted?: number | null;
  reps?: string | null;
}

const RANGE_PATTERN = /(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)/i;
const PAIR_PATTERN = /(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i;
const SINGLE_PATTERN = /(\d+(?:\.\d+)?)/;

/**
 * Repetitions performed per set.
 *
 * `logWorkout` writes `"<repsPerSet> x <sets>"`, so the first number is reps per set.
 * Ranges such as "8-12" (the plan default) resolve to their midpoint. Unparseable
 * text returns 0 rather than guessing, so volume is never silently overstated.
 */
export function repsPerSet(reps: string | null | undefined): number {
  if (reps === null || reps === undefined) return 0;
  const text = String(reps).trim();
  if (text.length === 0) return 0;

  const range = text.match(RANGE_PATTERN);
  if (range) return (Number.parseFloat(range[1]) + Number.parseFloat(range[2])) / 2;

  const pair = text.match(PAIR_PATTERN);
  if (pair) return Number.parseFloat(pair[1]);

  const single = text.match(SINGLE_PATTERN);
  if (single) return Number.parseFloat(single[1]);

  return 0;
}

/** Reps in a single set, only meaningful when at least one set was completed. */
export function repsInBestSet(log: RepsSource): number {
  return (log.setsCompleted ?? 0) > 0 ? repsPerSet(log.reps) : 0;
}

/**
 * Training volume for one logged exercise, in kilograms.
 *
 * load x repetitions x sets. Returns 0 for bodyweight work or unparseable rep
 * counts rather than inventing a number.
 */
export function logVolumeKg(log: RepsSource): number {
  const weight = log.weight ?? 0;
  const sets = log.setsCompleted ?? 0;
  const reps = repsPerSet(log.reps);
  if (!(weight > 0) || !(sets > 0) || !(reps > 0)) return 0;
  return weight * reps * sets;
}

/** Volume of the single best set, used for "best set" comparisons. */
export function setVolumeKg(log: RepsSource): number {
  const weight = log.weight ?? 0;
  const reps = repsInBestSet(log);
  if (!(weight > 0) || !(reps > 0)) return 0;
  return weight * reps;
}

/**
 * Estimated one-rep max via the Epley formula: weight x (1 + reps / 30).
 *
 * Returns null above 15 reps, where the estimate stops being meaningful, and for
 * bodyweight work.
 */
export function estimateOneRepMax(weightKg: number | null, reps: number): number | null {
  if (weightKg === null || !(weightKg > 0) || !(reps > 0) || reps > 15) return null;
  return weightKg * (1 + reps / 30);
}

/** Estimated 1RM for a logged exercise, or null when it cannot be estimated. */
export function logEstimatedOneRepMax(log: RepsSource): number | null {
  return estimateOneRepMax(log.weight ?? null, repsInBestSet(log));
}

/**
 * Formats kilograms as a tonnage once the figure stops being intuitively large.
 * 3000 kg reads as a training metric; "3.00 t" reads as one.
 */
export function formatVolume(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return "0 kg";
  if (kg >= 1000) {
    const tonnes = kg / 1000;
    return `${tonnes >= 10 ? tonnes.toFixed(1) : tonnes.toFixed(2)} t`;
  }
  return `${Math.round(kg).toLocaleString()} kg`;
}

/** Percentage change, or null when there is no comparable baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

export function formatPercent(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded === 0) return null;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export interface StrengthPoint {
  at: string;
  e1rm: number;
}

/**
 * Personal records for a single exercise: every point that beat the best
 * estimated 1RM achieved before it.
 *
 * A 0.5 kg tolerance keeps floating-point noise from manufacturing fake records
 * when the same performance is logged twice.
 */
export function personalRecords(points: StrengthPoint[]): StrengthPoint[] {
  const ordered = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const records: StrengthPoint[] = [];
  let best = 0;
  for (const point of ordered) {
    if (point.e1rm > best + 0.5) {
      best = point.e1rm;
      records.push(point);
    }
  }
  return records;
}

export const VOLUME_EXPLANATION =
  "Training volume = load x repetitions across completed sets. It measures training performed, not weight lifted in one go.";
