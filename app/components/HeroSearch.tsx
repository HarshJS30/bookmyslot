"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import Link from "next/link";
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

export default function HeroSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventSearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const searchControllerRef = useRef<AbortController | null>(null);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const searchTerm = query.trim().toLowerCase();
    if (!searchTerm) return;

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setIsSearching(true);
    setError("");

    try {
      const response = await fetch("/api/events", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Search is temporarily unavailable.");

      const events: EventSearchResult[] = await response.json();
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
        setError("Search is temporarily unavailable. Please try again.");
        setResults(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
        searchControllerRef.current = null;
      }
    }
  }

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    setIsSearching(false);
    setResults(null);
    setError("");
  }

  return (
    <div className={styles.searchWrap}>
      <form className={styles.searchForm} onSubmit={handleSearch} role="search">
        <MagnifyingGlass className={styles.searchIcon} size={20} weight="regular" aria-hidden="true" />
        <input
          aria-label="Search movies and events"
          autoComplete="off"
          onChange={handleQueryChange}
          placeholder="Search for movies, concerts, events..."
          value={query}
        />
        <button type="submit" disabled={isSearching || !query.trim()}>
          {isSearching ? "Searching" : "Search"}
        </button>
      </form>
      {(results !== null || error) && (
        <div className={styles.searchResults} aria-live="polite">
          {error ? (
            <p>{error}</p>
          ) : results?.length ? (
            results.map((item) => {
              const venueDetails = [item.venue?.name, item.venue?.location]
                .filter((value): value is string => Boolean(value))
                .join(" · ");

              return (
                <Link className={styles.searchResult} href={eventHref(item)} key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{venueDetails || "Venue details unavailable"}</span>
                  <time dateTime={item.startsAt}>
                    {new Date(item.startsAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </Link>
              );
            })
          ) : (
            <p>No events match “{query}”. Try another search.</p>
          )}
        </div>
      )}
    </div>
  );
}