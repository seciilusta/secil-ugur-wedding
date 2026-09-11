"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, type MotionValue } from "motion/react";
import { useRef, useState } from "react";
import { site } from "@/config/site";

const EASE = [0.22, 0.61, 0.36, 1] as const;
const MILESTONE_THRESHOLDS = [0.04, 0.31, 0.58, 0.84] as const;

const iconVariants = {
  waiting: {
    backgroundColor: "var(--color-beige)",
    borderColor: "var(--color-date-accent)",
    boxShadow: "0 0 0 0.42rem color-mix(in srgb, var(--color-beige) 82%, transparent)",
    color: "var(--color-date-accent)",
  },
  passed: {
    backgroundColor: "var(--color-date-accent)",
    borderColor: "var(--color-beige)",
    boxShadow: "0 0 0 0.42rem color-mix(in srgb, var(--color-date-accent) 28%, transparent)",
    color: "var(--color-beige)",
  },
};

function TimelineIcon({ index }: { index: number }) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
  };

  if (index === 0) {
    return (
      <svg viewBox="0 0 32 32" aria-hidden focusable="false">
        <path {...shared} d="M12.5 4h7v9a3.5 3.5 0 0 1-7 0V4Zm0 4h7M16 16.5V25M13 25h6" />
      </svg>
    );
  }

  if (index === 1) {
    return (
      <svg viewBox="0 0 32 32" aria-hidden focusable="false">
        <circle {...shared} cx="12.2" cy="17" r="6.2" />
        <circle {...shared} cx="19.8" cy="17" r="6.2" />
        <path {...shared} d="M16 10.8V7m-2.2 0h4.4" />
      </svg>
    );
  }

  if (index === 2) {
    return (
      <svg viewBox="0 0 32 32" aria-hidden focusable="false">
        <path {...shared} d="M7 21h18M9 19.5a7 7 0 0 1 14 0M8 23h16M16 12.5V9.5m-2.5 0h5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" aria-hidden focusable="false">
      <path {...shared} d="M21.5 6v14.2M21.5 7.5l-9 2.3v13.7" />
      <path {...shared} d="M21.5 7.5 26 9v5.2" />
      <circle {...shared} cx="9.5" cy="23" r="3" />
      <circle {...shared} cx="18.5" cy="20" r="3" />
    </svg>
  );
}

type TimelineItem = (typeof site.event.schedule)[number];

function TimelineStop({
  item,
  index,
  progress,
  reduceMotion,
}: {
  item: TimelineItem;
  index: number;
  progress: MotionValue<number>;
  reduceMotion: boolean | null;
}) {
  // The rail ends after the final milestone's copy, not at its centre. These
  // calibrated points align each colour swap with the matching ring instead
  // of making the final icon wait for the rail's empty tail to finish.
  const threshold = MILESTONE_THRESHOLDS[index] ?? 1;
  const [hasProgressedPast, setHasProgressedPast] = useState(reduceMotion);

  useMotionValueEvent(progress, "change", (latest) => {
    if (!reduceMotion) setHasProgressedPast(latest >= threshold);
  });

  return (
    <motion.li
      data-timeline-stop
      className="timeline-stop"
      initial={reduceMotion ? false : { opacity: 0, x: index % 2 === 0 ? 16 : -12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.62, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.78, ease: EASE }}
    >
      <motion.span
        aria-hidden
        className="timeline-icon"
        initial={false}
        animate={hasProgressedPast ? "passed" : "waiting"}
        variants={iconVariants}
        transition={{ duration: 0.35, ease: EASE }}
      >
        <TimelineIcon index={index} />
      </motion.span>
      <time className="timeline-time" dateTime={`${site.event.isoDate}T${item.time.replace(".", ":")}:00+03:00`}>
        {item.time}
      </time>
      <div className="timeline-copy">
        <h3>{item.label}</h3>
        <p>{item.detail}</p>
      </div>
    </motion.li>
  );
}

export function WeddingTimeline() {
  const ref = useRef<HTMLOListElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 72%", "end 44%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 86, damping: 24, mass: 0.28 });

  return (
    <ol ref={ref} className="wedding-timeline" aria-label="Düğün günü programı">
      <span aria-hidden className="timeline-rail" />
      <motion.span
        aria-hidden
        data-timeline-progress
        className="timeline-progress"
        style={{ scaleY: reduceMotion ? 1 : progress }}
      />

      {site.event.schedule.map((item, index) => (
        <TimelineStop
          key={item.time}
          item={item}
          index={index}
          progress={progress}
          reduceMotion={reduceMotion}
        />
      ))}
    </ol>
  );
}
