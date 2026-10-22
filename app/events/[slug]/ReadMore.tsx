"use client";

import { useState } from "react";
import styles from "./EventDetails.module.css";

export default function ReadMore({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 220;

  return (
    <div>
      <p className={`${styles.quickText} ${!open && isLong ? styles.clamped : ""}`}>{text}</p>
      {isLong && (
        <button
          aria-expanded={open}
          className={styles.readMore}
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}