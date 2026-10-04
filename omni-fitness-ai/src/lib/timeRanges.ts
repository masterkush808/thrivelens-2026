/**
 * Single source of truth for the Tracking screen's time filters.
 *
 * Both the calorie chart and the Strength section used to carry their own
 * inline `label === "7D" ? 7 : label === "30D" ? 30 : 90` ternary. Those copies
 * silently drifted: "6M" resolved to 90 days in both, and any unrecognised
 * label also fell through to 90 days. Keeping the mapping here means a new
 * filter is added in exactly one place and an unknown label fails loudly
 * instead of quietly returning a wrong window.
 */

export const TIME_FILTERS = ["7D", "30D", "3M", "6M"] as const;

export type TimeFilter = (typeof TIME_FILTERS)[number];

/** Inclusive day counts. "3M" and "6M" are calendar months, not 90-day guesses. */
const FILTER_DAYS: Record<TimeFilter, number> = {
  "7D": 7,
  "30D": 30,
  "3M": 92,
  "6M": 183,
};

export function isTimeFilter(value: string): value is TimeFilter {
  return Object.prototype.hasOwnProperty.call(FILTER_DAYS, value);
}

/**
 * Number of day-buckets a filter spans, including today.
 * Throws on an unknown label so a typo cannot silently become a 3-month window.
 */
export function daysForRange(label: string): number {
  if (!isTimeFilter(label)) {
    throw new Error(`Unknown time filter "${label}". Expected one of ${TIME_FILTERS.join(", ")}.`);
  }
  return FILTER_DAYS[label];
}

/**
 * Start of the window as local midnight, `days - 1` days before today.
 * Returns exactly `days` buckets when walked forward day by day, which is what
 * the chart renders and what the Strength window is measured against.
 */
export function rangeStartMs(label: string, now: Date = new Date()): number {
  const days = daysForRange(label);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
}
