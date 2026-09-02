export type WeddingClockState =
  | { phase: "countdown"; days: number; hours: number; minutes: number; seconds: number }
  | { phase: "today" }
  | { phase: "after" };

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Pure on purpose: boundary behavior can be verified without rendering React. */
export function getWeddingClockState(now: number, targetIso: string, celebrationEndIso: string): WeddingClockState {
  const target = Date.parse(targetIso);
  const celebrationEnd = Date.parse(celebrationEndIso);

  if (!Number.isFinite(target) || !Number.isFinite(celebrationEnd) || celebrationEnd <= target) {
    throw new Error("Wedding clock configuration is invalid.");
  }

  if (now >= celebrationEnd) return { phase: "after" };
  if (now >= target) return { phase: "today" };

  let remaining = target - now;
  const days = Math.floor(remaining / DAY);
  remaining -= days * DAY;
  const hours = Math.floor(remaining / HOUR);
  remaining -= hours * HOUR;
  const minutes = Math.floor(remaining / MINUTE);
  remaining -= minutes * MINUTE;
  const seconds = Math.floor(remaining / SECOND);

  return { phase: "countdown", days, hours, minutes, seconds };
}
