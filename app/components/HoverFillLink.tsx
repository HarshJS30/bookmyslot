"use client";

import Link from "next/link";
import { useRef, type MouseEvent, type ReactNode } from "react";
import styles from "./HoverFillLink.module.css";

type Side = "left" | "right" | "top" | "bottom";

// clip-path inset(top right bottom left): hidden means one edge is pushed all the way across.
const HIDDEN: Record<Side, string> = {
  left: "inset(0 100% 0 0)",
  right: "inset(0 0 0 100%)",
  top: "inset(0 0 100% 0)",
  bottom: "inset(100% 0 0 0)",
};
const SHOWN = "inset(0 0 0 0)";

// Which edge of the link box is the cursor closest to?
function nearestSide(event: MouseEvent<HTMLElement>): Side {
  const box = event.currentTarget.getBoundingClientRect();
  const distances: Record<Side, number> = {
    left: event.clientX - box.left,
    right: box.right - event.clientX,
    top: event.clientY - box.top,
    bottom: box.bottom - event.clientY,
  };
  return (Object.keys(distances) as Side[]).reduce((best, side) =>
    distances[side] < distances[best] ? side : best
  );
}

type Props = {
  href: string;
  label?: string;
  children: ReactNode;
};

export default function HoverFillLink({ href, label, children }: Props) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);

  // If an animation is still running, continue from its current shape.
  function currentShape(fallback: string) {
    const fill = fillRef.current;
    if (!fill || animationRef.current?.playState !== "running") return fallback;
    return getComputedStyle(fill).clipPath;
  }

  function play(from: string, to: string) {
    const fill = fillRef.current;
    if (!fill) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animationRef.current?.cancel();
    animationRef.current = fill.animate(
      [{ clipPath: from }, { clipPath: to }],
      { duration: reduceMotion ? 0 : 260, easing: "ease", fill: "forwards" }
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={styles.link}
      onMouseEnter={(event) => {
        const side = nearestSide(event);
        play(currentShape(HIDDEN[side]), SHOWN);
      }}
      onMouseLeave={(event) => {
        const side = nearestSide(event);
        play(currentShape(SHOWN), HIDDEN[side]);
      }}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) {
          play(currentShape(HIDDEN.left), SHOWN);
        }
      }}
      onBlur={() => play(currentShape(SHOWN), HIDDEN.left)}
    >
      <span ref={fillRef} className={styles.fill} aria-hidden="true">
        {children}
      </span>
      {children}
    </Link>
  );
}