"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  MapPin,
  Ticket,
} from "@phosphor-icons/react";
import Link from "next/link";
import { eventHref } from "@/lib/event-url";
import HowItWorks from "./HowItWorks";
import styles from "./NowShowing.module.css";

type EventItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  category: "MOVIES" | "CONCERTS" | "COMEDY" | "THEATRE" | "SPORTS" | "OTHER";
  startsAt: string;
  venue: { name: string; location: string } | null;
  ticketCategories?: { price: number | string }[];
};

const cityArt: Record<string, string> = {
  Bengaluru: styles.cityBengaluru,
  Mumbai: styles.cityMumbai,
  Delhi: styles.cityDelhi,
  Pune: styles.cityPune,
};
const categoryFilters = [
  { label: "All", value: "ALL" },
  { label: "Movies", value: "MOVIES" },
  { label: "Concerts", value: "CONCERTS" },
  { label: "Comedy", value: "COMEDY" },
  { label: "Theatre", value: "THEATRE" },
  { label: "Sports", value: "SPORTS" },
  { label: "Other", value: "OTHER" },
] as const;

const categoryLabels: Record<EventItem["category"], string> = {
  MOVIES: "Movie",
  CONCERTS: "Concert",
  COMEDY: "Comedy",
  THEATRE: "Theatre",
  SPORTS: "Sports",
  OTHER: "Event",
};

function lowestPrice(event: EventItem): string | null {
  const prices = (event.ticketCategories ?? [])
    .map((category) => Number(category.price))
    .filter((price) => Number.isFinite(price));
  if (!prices.length) return null;
  return `From ₹${Math.min(...prices).toLocaleString("en-IN")}`;
}

type ScrollState = { canPrev: boolean; canNext: boolean; scrollable: boolean };

export default function NowShowing() {
  const reduceMotion = useReducedMotion();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState<(typeof categoryFilters)[number]["value"]>("ALL");
  const [scrollState, setScrollState] = useState<ScrollState>({
    canPrev: false,
    canNext: false,
    scrollable: false,
  });
  const eventsRef = useRef<HTMLDivElement>(null);

  const visibleEvents =
    activeCategory === "ALL"
      ? events
      : events.filter((event) => event.category === activeCategory);
  const places = Array.from(
    new Set(
      events
        .map((event) => event.venue?.location || event.venue?.name)
        .filter((place): place is string => Boolean(place)),
    ),
  ).slice(0, 4);

  const pillSpring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.8 };

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvents() {
      try {
        const response = await fetch("/api/events", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Could not load events.");
        const data: EventItem[] = await response.json();
        setEvents(data);
      } catch {
        if (!controller.signal.aborted) setError("Events are unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadEvents();
    return () => controller.abort();
  }, []);

  // Track scroll position so arrows disable and edge fades show only when useful
  const updateScrollState = useCallback(() => {
    const track = eventsRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const next: ScrollState = {
      canPrev: track.scrollLeft > 2,
      canNext: track.scrollLeft < max - 2,
      scrollable: max > 2,
    };
    setScrollState((prev) =>
      prev.canPrev === next.canPrev &&
      prev.canNext === next.canNext &&
      prev.scrollable === next.scrollable
        ? prev
        : next,
    );
  }, []);

  useEffect(() => {
    const track = eventsRef.current;
    if (!track) return;
    updateScrollState();
    track.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, activeCategory, isLoading, visibleEvents.length]);

  function scrollTrack(track: HTMLDivElement | null, direction: -1 | 1) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track?.scrollBy({
      left: direction * track.clientWidth * 0.82,
      behavior: reducedMotion ? "instant" : "smooth",
    });
  }

  return (
    <section className={styles.section} id="now-showing">
      <div className={styles.content}>

        <section className={styles.liveSection} aria-labelledby="live-title">
          <div className={styles.liveHeading}>
            <h2 id="live-title">Available to book now.</h2>
            <div className={styles.liveControls}>
              {scrollState.scrollable && !isLoading && !error && (
                <div className={styles.liveArrows}>
                  <button className={styles.carouselButton} type="button" aria-label="Previous live events" disabled={!scrollState.canPrev} onClick={() => scrollTrack(eventsRef.current, -1)}><ArrowLeft size={16} aria-hidden="true" /></button>
                  <button className={styles.carouselButton} type="button" aria-label="Next live events" disabled={!scrollState.canNext} onClick={() => scrollTrack(eventsRef.current, 1)}><ArrowRight size={16} aria-hidden="true" /></button>
                </div>
              )}
              <Link className={styles.viewAll} href="/events">Browse events <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </div>
          <div className={styles.categoryFilters} role="group" aria-label="Filter events by category">
            {categoryFilters.map((filter) => {
              const isActive = activeCategory === filter.value;
              return (
                <button
                  aria-pressed={isActive}
                  className={`${styles.categoryFilter} ${isActive ? styles.categoryFilterActive : ""}`}
                  key={filter.value}
                  onClick={() => setActiveCategory(filter.value)}
                  type="button"
                >
                  {isActive && (
                    <motion.span
                      aria-hidden="true"
                      className={styles.categoryPill}
                      layoutId="category-pill"
                      transition={pillSpring}
                    />
                  )}
                  <span className={styles.categoryLabel}>{filter.label}</span>
                </button>
              );
            })}
          </div>
          <div
            className={styles.liveTrack}
            data-can-next={scrollState.canNext}
            data-can-prev={scrollState.canPrev}
            key={activeCategory}
            ref={eventsRef}
          >
            {isLoading ? (
              Array.from({ length: 4 }, (_, index) => <div className={styles.liveSkeleton} key={index} aria-hidden="true" />)
            ) : error ? (
              <p className={styles.message} role="status">{error}</p>
            ) : visibleEvents.length ? (
              visibleEvents.map((event, index) => {
                const eventDate = new Date(event.startsAt);
                return (
                  <Link
                    className={styles.liveCard}
                    data-press
                    href={eventHref(event)}
                    key={event.id}
                    style={{ "--i": Math.min(index, 8) } as CSSProperties}
                  >
                    <div className={styles.posterFrame}>
                      {event.imageUrl ? (
                        <div className={styles.livePoster} role="img" aria-label={`${event.name} event poster`} style={{ backgroundImage: `url("${event.imageUrl}")` }} />
                      ) : (
                        <div className={`${styles.livePoster} ${styles.liveFallback}`} aria-hidden="true"><Ticket size={28} /></div>
                      )}
                    </div>
                    <span className={styles.cardCategory}>{categoryLabels[event.category]}</span>
                    <div className={styles.liveInfo}>
                      <h3>{event.name}</h3>
                      <div className={styles.cardMeta}>
                        <p><MapPin size={14} aria-hidden="true" />{event.venue?.location || event.venue?.name || "Live event"}</p>
                        <time dateTime={event.startsAt}>
                          <CalendarBlank size={14} aria-hidden="true" />
                          {eventDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
                        </time>
                      </div>
                      <div className={styles.cardFooter}>
                        <span className={styles.cardPrice}>{lowestPrice(event) ?? "Book now"}</span>
                        <span className={styles.cardGo} aria-hidden="true"><ArrowRight size={16} /></span>
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className={styles.message}>
                {events.length ? "No events in this category yet." : "No live event listings are available yet."}
              </p>
            )}
          </div>
        </section>

        <Link className={styles.featureBanner} href="/events">
          <span className={styles.featureArtwork} aria-hidden="true" />
          <span className={styles.featureCopy}>
            <span className={styles.featureEyebrow}>This is your moment</span>
            <strong>Feel the story.<br />Live the moment.</strong>
            <span className={styles.featureDescription}>Movies, music, and nights worth remembering.</span>
            <span className={styles.featureLink}>Explore events <ArrowRight size={14} aria-hidden="true" /></span>
          </span>
        </Link>

        <section className={styles.citySection} id="popular-venues" aria-labelledby="cities-title">
          <div className={styles.cityIntro}>
            <h2 id="cities-title">Find your next night out.</h2>
            <p>Top cities. Bigger experiences.</p>
          </div>
          <div className={styles.cityTrack}>
            {places.map((city) => (
              <Link className={`${styles.cityCard} ${cityArt[city] ?? styles.cityDefault}`} href={`/events?city=${encodeURIComponent(city)}`} key={city}>
                <span>{city}</span><ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <HowItWorks />

      </div>
    </section>
  );
}
