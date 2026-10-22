"use client";

import { useEffect, useState, type ReactNode } from "react";
import styles from "./ScrollAwareHeader.module.css";

export default function ScrollAwareHeader({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let previousY = window.scrollY;
    let lastDirection = 0;
    let accumulatedDelta = 0;
    let frame = 0;

    const updateVisibility = () => {
      const currentY = window.scrollY;
      const delta = currentY - previousY;

      if (currentY < 96) {
        setHidden(false);
        accumulatedDelta = 0;
      } else if (delta !== 0) {
        const direction = Math.sign(delta);
        accumulatedDelta = direction === lastDirection ? accumulatedDelta + Math.abs(delta) : Math.abs(delta);
        lastDirection = direction;

        if (accumulatedDelta >= 12) {
          setHidden(direction > 0);
          accumulatedDelta = 0;
        }
      }

      previousY = currentY;
      frame = 0;
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateVisibility);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={styles.stickyHeader} data-hidden={hidden}>
      {children}
    </div>
  );
}
