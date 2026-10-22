"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MagnifyingGlass, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eventHref } from "@/lib/event-url";
import styles from "./Hero.module.css";

type EventSearchResult = {
  id: string;
  name: string;
  startsAt: string;
  venue?: {
    name?: string | null;
    location?: string | null;
  } | null;
};

const DEBOUNCE_MS = 250; // wait this long after the last keystroke
const MIN_SEARCH_MS = 300; // keep the "searching" state up at least this long so it never flashes

export default function HeroSearch() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.8 };

  const hasPanel = results !== null || Boolean(error);
  const panelVisible = isOpen && (isSearching || hasPanel);
  const showSkeleton = isSearching && !results?.length && !error;
  const hasOptions = panelVisible && !error && Boolean(results?.length);
  const canSubmit = Boolean(query.trim());
  const optionId = (index: number) => `${listId}-option-${index}`;

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const runSearch = useCallback(async (rawTerm: string) => {
    const searchTerm = rawTerm.trim().toLowerCase();
    if (!searchTerm) return;

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    const startedAt = performance.now();
    setIsSearching(true);
    setIsOpen(true);
    setError("");
    setActiveIndex(-1);

    try {
      const response = await fetch("/api/events", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Search is temporarily unavailable.");

      const events: EventSearchResult[] = await response.json();

      const remaining = MIN_SEARCH_MS - (performance.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (controller.signal.aborted) return;

      setResults(
        events
          .filter((item) =>
            `${item.name} ${item.venue?.name ?? ""} ${item.venue?.location ?? ""}`
              .toLowerCase()
              .includes(searchTerm),
          )
          .slice(0, 4),
      );
    } catch {
      if (!controller.signal.aborted) {
        setError("Search is temporarily unavailable.");
        setResults(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
        searchControllerRef.current = null;
      }
    }
  }, []);

  // Close on outside press
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) closePanel();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, closePanel]);

  // Clean up timers and in-flight requests on unmount
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchControllerRef.current?.abort();
    },
    [],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const active = hasOptions && activeIndex >= 0 ? results?.[activeIndex] : undefined;
    if (active) {
      closePanel();
      router.push(eventHref(active));
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runSearch(query);
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQuery(value);
    setError("");
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;

    if (!value.trim()) {
      setIsSearching(false);
      setResults(null);
      setIsOpen(false);
      return;
    }

    // Show feedback on the very first keystroke, search once typing pauses
    setIsSearching(true);
    setIsOpen(true);
    debounceRef.current = setTimeout(() => void runSearch(value), DEBOUNCE_MS);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const { key } = event;

    if (key === "Escape") {
      if (panelVisible) {
        event.preventDefault();
        closePanel();
      }
      return;
    }

    if (key !== "ArrowDown" && key !== "ArrowUp") return;
    const count = results?.length ?? 0;
    if (!count || error) return;

    event.preventDefault();
    if (!isOpen) {
      setIsOpen(true);
      return;
    }
    setActiveIndex((current) =>
      key === "ArrowDown"
        ? (current + 1) % count
        : current <= 0
          ? count - 1
          : current - 1,
    );
  }

  const iconSwap = {
    initial: { opacity: 0, scale: reduceMotion ? 1 : 0.6 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: reduceMotion ? 1 : 0.6 },
    transition: { duration: reduceMotion ? 0 : 0.12 },
  };

  return (
    <div className={styles.searchWrap} ref={wrapRef}>
      <form className={styles.searchForm} onSubmit={handleSubmit} role="search">
        <MagnifyingGlass className={styles.searchIcon} size={20} weight="regular" aria-hidden="true" />
        <input
          aria-label="Search movies and events"
          aria-autocomplete="list"
          aria-controls={hasOptions ? listId : undefined}
          aria-activedescendant={hasOptions && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-expanded={hasOptions}
          autoComplete="off"
          onChange={handleQueryChange}
          onFocus={() => {
            if (hasPanel || isSearching) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search for movies, concerts, events..."
          role="combobox"
          value={query}
        />
        <motion.button
          aria-label={isSearching ? "Searching events" : "Search events"}
          aria-busy={isSearching}
          disabled={!canSubmit}
          transition={spring}
          type="submit"
          whileTap={canSubmit && !reduceMotion ? { scale: 0.9 } : undefined}
        >
          <AnimatePresence initial={false} mode="wait">
            {isSearching ? (
              <motion.span className={styles.spinner} key="spinner" {...iconSwap} />
            ) : (
              <motion.span key="icon" style={{ display: "grid" }} {...iconSwap}>
                <MagnifyingGlass size={19} weight="regular" aria-hidden="true" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* sweeping line along the bottom of the bar while a search is running */}
        <AnimatePresence>
          {isSearching && (
            <motion.span
              aria-hidden="true"
              className={styles.searchProgress}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.15 }}
            />
          )}
        </AnimatePresence>
      </form>

      <p className={styles.srOnly} role="status">
        {isSearching
          ? "Searching events"
          : error
            ? error
            : results
              ? `${results.length} ${results.length === 1 ? "result" : "results"} found`
              : ""}
      </p>

      <AnimatePresence>
        {panelVisible && (
          <motion.div
            className={styles.searchResults}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0, y: -4, scale: 0.99, transition: { duration: 0.12 } }
            }
            transition={spring}
          >
            {error ? (
              <div className={styles.searchState}>
                <WarningCircle size={22} weight="regular" aria-hidden="true" />
                <div>
                  <strong>Search is unavailable</strong>
                  <span>Check your connection and try again.</span>
                </div>
                <button className={styles.retryChip} onClick={() => void runSearch(query)} type="button">
                  Retry
                </button>
              </div>
            ) : showSkeleton ? (
              <div className={styles.searchLoading} aria-hidden="true">
                <p className={styles.searchLoadingLabel}>
                  <span className={styles.spinnerSmall} />
                  <span className={styles.searchLoadingText}>Searching for “{query.trim()}”</span>
                </p>
                {[0, 1, 2].map((row) => (
                  <div className={styles.skeletonRow} key={row}>
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : results?.length ? (
              <ul
                className={`${styles.searchList} ${isSearching ? styles.searchListStale : ""}`}
                id={listId}
                role="listbox"
                aria-label="Search results"
              >
                {results.map((item, index) => {
                  const venueDetails = [item.venue?.name, item.venue?.location]
                    .filter((value): value is string => Boolean(value))
                    .join(" · ");
                  const isActive = index === activeIndex;

                  return (
                    <motion.li
                      key={item.id}
                      role="presentation"
                      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...spring, delay: reduceMotion ? 0 : index * 0.035 }}
                    >
                      <Link
                        aria-selected={isActive}
                        className={styles.searchResult}
                        href={eventHref(item)}
                        id={optionId(index)}
                        onClick={closePanel}
                        onFocus={() => setActiveIndex(index)}
                        onPointerMove={() => {
                          if (!isActive) setActiveIndex(index);
                        }}
                        role="option"
                      >
                        {isActive && (
                          <motion.span
                            className={styles.searchActive}
                            layoutId={`${listId}-active`}
                            transition={spring}
                          />
                        )}
                        <strong>{item.name}</strong>
                        <span>{venueDetails || "Venue details unavailable"}</span>
                        <time dateTime={item.startsAt}>
                          {new Date(item.startsAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </time>
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.searchState}>
                <MagnifyingGlass size={22} weight="regular" aria-hidden="true" />
                <div>
                  <strong>No events match “{query.trim()}”</strong>
                  <span>Try a movie, a venue or a city.</span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}