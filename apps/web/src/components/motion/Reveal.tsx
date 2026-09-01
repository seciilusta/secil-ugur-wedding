"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ElementType, ReactNode } from "react";

/**
 * The one animation primitive used across the page.
 *
 * Wrapping a piece of content in this keeps the surrounding sections as Server
 * Components — only the wrapper itself is a client island. Animation is limited
 * to opacity and transform so it stays cheap, and anyone who has asked for
 * reduced motion simply gets the finished state immediately.
 */

type RevealProps = {
  children: ReactNode;
  /** Seconds of delay, used to stagger a group of lines. */
  delay?: number;
  /** Distance in pixels the element rises from. `0` gives a pure fade. */
  y?: number;
  /** `mount` plays once on load (hero), `inView` waits for the scroll. */
  trigger?: "mount" | "inView";
  as?: ElementType;
  className?: string;
};

const DURATION = 1.1;
const EASE = [0.22, 0.61, 0.36, 1] as const;

export function Reveal({
  children,
  delay = 0,
  y = 16,
  trigger = "inView",
  as = "div",
  className,
}: RevealProps) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div;

  if (reduceMotion) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  const hidden = { opacity: 0, y };
  const shown = { opacity: 1, y: 0 };
  const transition = { duration: DURATION, delay, ease: EASE };

  // `data-reveal` is what the <noscript> rule in layout.tsx targets, so the
  // prerendered `opacity: 0` cannot leave the copy invisible if JavaScript
  // never runs.
  if (trigger === "mount") {
    return (
      <MotionTag data-reveal className={className} initial={hidden} animate={shown} transition={transition}>
        {children}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      data-reveal
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, amount: 0.25, margin: "0px 0px -12% 0px" }}
      transition={transition}
    >
      {children}
    </MotionTag>
  );
}
