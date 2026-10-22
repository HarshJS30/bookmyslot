import type { ReactNode } from "react";
import styles from "./Iconstile.module.css";

const IST = "Asia/Kolkata";

export function IconTile({
  children,
  size = "md",
  tone = "neutral",
}: {
  children: ReactNode;
  size?: "md" | "sm";
  tone?: "neutral" | "accent";
}) {
  return (
    <span className={`${styles.tile} ${size === "sm" ? styles.small : ""} ${tone === "accent" ? styles.accent : ""}`}>
      {children}
    </span>
  );
}

export function DateTile({
  date,
  size = "md",
  className = "",
}: {
  date: string | Date;
  size?: "md" | "sm";
  className?: string;
}) {
  const value = typeof date === "string" ? new Date(date) : date;
  const month = value.toLocaleDateString("en-IN", { month: "short", timeZone: IST }).toUpperCase();
  const day = value.toLocaleDateString("en-IN", { day: "numeric", timeZone: IST });
  const spoken = value.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: IST,
  });

  return (
    <time
      className={`${styles.dateTile} ${size === "sm" ? styles.dateSmall : ""} ${className}`}
      dateTime={value.toISOString()}
    >
      <span className={styles.srOnly}>{spoken}</span>
      <span aria-hidden="true" className={styles.dateMonth}>
        {month}
      </span>
      <span aria-hidden="true" className={styles.dateDay}>
        {day}
      </span>
    </time>
  );
}
