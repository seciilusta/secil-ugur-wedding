"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

const EASE = [0.22, 0.61, 0.36, 1] as const;

type Entrance = "hero-title" | "hero-meta" | "hero-nav" | "from-left" | "from-right" | "soft-scale" | "quiet";

const initialByEntrance: Record<Entrance, { opacity: number; x?: number; y?: number; scale?: number }> = {
  "hero-title": { opacity: 0, x: -18, y: 10 },
  "hero-meta": { opacity: 0, x: 18 },
  /* The absolutely positioned top navigation may fade in, but must not be
     transformed: transforms create a new containing block and disturb its
     centre alignment during the animation. */
  "hero-nav": { opacity: 0 },
  "from-left": { opacity: 0, x: -24 },
  "from-right": { opacity: 0, x: 24 },
  "soft-scale": { opacity: 0, scale: 0.975 },
  quiet: { opacity: 0, y: 10 },
};

export function EntranceMotion({
  children,
  entrance,
  className,
  delay = 0,
  trigger = "view",
}: {
  children: ReactNode;
  entrance: Entrance;
  className?: string;
  delay?: number;
  trigger?: "mount" | "view";
}) {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : initialByEntrance[entrance];
  const animate = entrance === "hero-nav" ? { opacity: 1 } : { opacity: 1, x: 0, y: 0, scale: 1 };
  const transition = { duration: entrance === "soft-scale" ? 1.45 : entrance === "hero-nav" ? 0.45 : 0.95, delay, ease: EASE };

  if (trigger === "mount") {
    return (
      <motion.div data-choreography className={className} initial={initial} animate={animate} transition={transition}>
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      data-choreography
      className={className}
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, amount: 0.22, margin: "0px 0px -10% 0px" }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

export function LineDraw({ className, delay = 0 }: { className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      data-choreography
      className={className}
      initial={reduceMotion ? false : { opacity: 0, scaleX: 0 }}
      whileInView={{ opacity: 1, scaleX: 1 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ duration: 1.15, delay, ease: EASE }}
    />
  );
}

export function BotanicalDrift({ children, className, direction = 1 }: { children: ReactNode; className?: string; direction?: 1 | -1 }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [18 * direction, -18 * direction]);
  const rotate = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [-1.5 * direction, 1.5 * direction]);

  return (
    <motion.div ref={ref} className={className} style={{ y, rotate }}>
      {children}
    </motion.div>
  );
}
