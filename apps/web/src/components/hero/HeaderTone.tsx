"use client";

import { useEffect } from "react";

const regions = [
  { selector: ".hero-artwork", tone: "paper" },
  { selector: "#davet", tone: "invitation" },
  { selector: "#program", tone: "program" },
  { selector: "#mekan", tone: "venue" },
  { selector: "#katilim", tone: "rsvp" },
  { selector: "footer", tone: "footer" },
] as const;

/** Keeps the persistent navigation on the same colour journey as the canvas. */
export function HeaderTone() {
  useEffect(() => {
    const updateTone = () => {
      const referenceY = 72;
      const active = regions.reduce<(typeof regions)[number] | undefined>((current, region) => {
        const element = document.querySelector<HTMLElement>(region.selector);
        return element && element.getBoundingClientRect().top <= referenceY ? region : current;
      }, undefined);

      let tone: string = active?.tone ?? "paper";
      const element = active && document.querySelector<HTMLElement>(active.selector);
      const bounds = element?.getBoundingClientRect();
      const progress = bounds ? Math.max(0, Math.min(1, (referenceY - bounds.top) / bounds.height)) : 0;

      if (tone === "invitation") {
        document.documentElement.style.setProperty("--header-invitation-ivory", `${100 - progress * 100}%`);
      } else if (tone === "program") {
        // Mirror the three colour stops in the Program canvas: beige → mist.
        const beigeShare = progress <= 0.35
          ? 100 - (28 * progress) / 0.35
          : progress <= 0.65
            ? 72 - (36 * (progress - 0.35)) / 0.3
            : 36 - (36 * (progress - 0.65)) / 0.35;
        document.documentElement.style.setProperty("--header-program-beige", `${beigeShare}%`);
      } else if (tone === "venue") {
        document.documentElement.style.setProperty("--header-venue-mist", `${100 - Math.min(progress / 0.78, 1) * 100}%`);
      } else if (tone === "rsvp") {
        const firstHalf = progress <= 0.55;
        tone = firstHalf ? "rsvp-olive" : "rsvp-mocha";
        const stageProgress = firstHalf ? progress / 0.55 : (progress - 0.55) / 0.45;
        document.documentElement.style.setProperty("--header-rsvp-leading", `${100 - stageProgress * 100}%`);
      } else if (tone === "footer") {
        document.documentElement.style.setProperty("--header-footer-mocha", `${100 - progress * 100}%`);
      }

      document.documentElement.dataset.headerTone = tone;
    };

    updateTone();
    window.addEventListener("scroll", updateTone, { passive: true });
    window.addEventListener("resize", updateTone);

    return () => {
      window.removeEventListener("scroll", updateTone);
      window.removeEventListener("resize", updateTone);
    };
  }, []);

  return null;
}
