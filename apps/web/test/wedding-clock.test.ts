import { describe, expect, it } from "vitest";
import { getWeddingClockState } from "../src/lib/wedding-clock";

const target = "2026-10-04T18:30:00+03:00";
const celebrationEnd = "2026-10-05T00:00:00+03:00";

describe("wedding clock boundaries", () => {
  it("counts down before the welcome", () => {
    expect(getWeddingClockState(Date.parse("2026-10-03T18:29:59+03:00"), target, celebrationEnd)).toEqual({
      phase: "countdown",
      days: 1,
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
  });

  it("switches to the wedding-day message at exactly 18:30", () => {
    expect(getWeddingClockState(Date.parse(target), target, celebrationEnd)).toEqual({ phase: "today" });
  });

  it("keeps the wedding-day message through 23:59:59", () => {
    expect(getWeddingClockState(Date.parse("2026-10-04T23:59:59+03:00"), target, celebrationEnd)).toEqual({
      phase: "today",
    });
  });

  it("switches to the permanent closing at Istanbul midnight", () => {
    expect(getWeddingClockState(Date.parse(celebrationEnd), target, celebrationEnd)).toEqual({ phase: "after" });
  });

  it("rejects invalid boundaries", () => {
    expect(() => getWeddingClockState(Date.now(), celebrationEnd, target)).toThrow(/invalid/);
  });
});
