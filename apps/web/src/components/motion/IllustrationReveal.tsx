"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Reveals the venue illustration by wiping a clip upwards while it fades in.
 *
 * The illustration is a single raster image and is treated as one object: no
 * individual part of it is animated, transformed or moved. Under reduced motion
 * it is simply present from the first frame.
 */
export function IllustrationReveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      data-reveal
      className={className}
      initial={{ opacity: 0, clipPath: "inset(0% 0% 22% 0%)" }}
      animate={{ opacity: 1, clipPath: "inset(0% 0% 0% 0%)" }}
      transition={{
        opacity: { duration: 1.8, delay: 0.35, ease: [0.22, 0.61, 0.36, 1] },
        clipPath: { duration: 2.1, delay: 0.35, ease: [0.22, 0.61, 0.36, 1] },
      }}
    >
      {children}
    </motion.div>
  );
}
