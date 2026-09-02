"use client";

import { motion, useReducedMotion, useScroll, useSpring } from "motion/react";
import { useRef } from "react";
import { site } from "@/config/site";

const EASE = [0.22, 0.61, 0.36, 1] as const;

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
        <motion.li
          data-timeline-stop
          key={item.time}
          className="timeline-stop"
          initial={reduceMotion ? false : { opacity: 0, x: index % 2 === 0 ? 16 : -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.62, margin: "0px 0px -8% 0px" }}
          transition={{ duration: 0.78, ease: EASE }}
        >
          <span aria-hidden className="timeline-dot" />
          <time className="timeline-time" dateTime={`${site.event.isoDate}T${item.time.replace(".", ":")}:00+03:00`}>
            {item.time}
          </time>
          <div className="timeline-copy">
            <h3>{item.label}</h3>
            <p>{item.detail}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}
