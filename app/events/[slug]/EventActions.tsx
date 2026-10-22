"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Heart, ShareNetwork } from "@phosphor-icons/react";
import styles from "./EventDetails.module.css";

/* ------------------------------ save (device only) ------------------------------ */

const SAVED_KEY = "bms:saved-events";
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot() {
  try {
    return localStorage.getItem(SAVED_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function getServerSnapshot() {
  return "[]";
}

function parseIds(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function SaveButton({ eventId }: { eventId: string }) {
  const reduceMotion = useReducedMotion();
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const saved = parseIds(raw).includes(eventId);

  function toggle() {
    const ids = parseIds(getSnapshot());
    const next = ids.includes(eventId) ? ids.filter((id) => id !== eventId) : [...ids, eventId];
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <button
      aria-label={saved ? "Remove from saved events" : "Save event"}
      aria-pressed={saved}
      className={`${styles.iconButton} ${saved ? styles.iconButtonSaved : ""}`}
      onClick={toggle}
      type="button"
    >
      <motion.span
        animate={{ scale: saved && !reduceMotion ? [1, 1.3, 1] : 1 }}
        initial={false}
        style={{ display: "grid" }}
        transition={{ duration: 0.34, ease: "easeOut" }}
      >
        <Heart size={19} weight={saved ? "fill" : "regular"} aria-hidden="true" />
      </motion.span>
    </button>
  );
}

/* ------------------------------ share ------------------------------ */

export function ShareButton({
  title,
  url,
  variant = "icon",
  children,
}: {
  title: string;
  url?: string;
  variant?: "icon" | "pill";
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function share() {
    const target = url ?? window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url: target });
        return;
      }
      await navigator.clipboard.writeText(target);
      setCopied(true);
    } catch {
      /* share sheet dismissed or clipboard blocked */
    }
  }

  if (variant === "pill") {
    return (
      <button className={styles.locationButton} onClick={share} type="button">
        {copied ? "Link copied" : children}
      </button>
    );
  }

  return (
    <button aria-label="Share event" className={styles.iconButton} onClick={share} type="button">
      <ShareNetwork size={19} aria-hidden="true" />
      <AnimatePresence>
        {copied && (
          <motion.span
            animate={{ opacity: 1, y: 0 }}
            className={styles.copiedTip}
            exit={{ opacity: 0 }}
            initial={{ opacity: 0, y: 4 }}
            role="status"
            transition={{ duration: 0.16 }}
          >
            Link copied
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}