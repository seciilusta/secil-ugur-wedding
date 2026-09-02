"use client";

import { useEffect, useState } from "react";
import { site } from "@/config/site";
import { getWeddingClockState, type WeddingClockState } from "@/lib/wedding-clock";

const { event, hero } = site;

const units = [
  ["days", hero.countdown.days],
  ["hours", hero.countdown.hours],
  ["minutes", hero.countdown.minutes],
  ["seconds", hero.countdown.seconds],
] as const;

export function Countdown() {
  const [clock, setClock] = useState<WeddingClockState | null>(null);

  useEffect(() => {
    const update = () => setClock(getWeddingClockState(Date.now(), event.countdownTarget, event.celebrationEnd));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!clock) {
    return (
      <div className="countdown-fallback" aria-label={`${event.date}, saat ${event.startTime}`}>
        <span>{event.date}</span>
        <span aria-hidden className="countdown-separator" />
        <span>{event.startTime}</span>
      </div>
    );
  }

  if (clock.phase !== "countdown") {
    return (
      <p className="countdown-message" role="timer" aria-live="polite">
        {clock.phase === "today" ? hero.countdown.today : hero.countdown.after}
      </p>
    );
  }

  return (
    <div className="countdown" role="timer" aria-live="off" aria-label={hero.countdown.overline}>
      {units.map(([key, label]) => (
        <div className="countdown-unit" key={key}>
          <span className="countdown-value">{String(clock[key]).padStart(2, "0")}</span>
          <span className="countdown-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
