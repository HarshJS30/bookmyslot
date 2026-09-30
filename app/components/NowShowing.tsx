"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { eventHref } from "@/lib/event-url";
import styles from "./NowShowing.module.css";

type EventItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  startsAt: string;
  venue: {
    name: string;
    location: string;
  } | null;
};

export default function NowShowing() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvents() {
      try {
        const response = await fetch("/api/events", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Could not load events.");

        const data: EventItem[] = await response.json();
        setEvents(data);
      } catch {
        if (!controller.signal.aborted) {
          setError("Events are unavailable right now.");
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadEvents();
    return () => controller.abort();
  }, []);

  function scrollCarousel(direction: -1 | 1) {
    carouselRef.current?.scrollBy({
      left: direction * carouselRef.current.clientWidth * 0.8,
      behavior: "smooth",
    });
  }

  return (
    <section className={styles.section} id="now-showing" aria-labelledby="now-showing-title">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="now-showing-title">Now Showing</h2>
          <p>Catch the latest events happening near you.</p>
        </div>
        <Link className={styles.viewAll} href="/events">
          View all <ArrowRight size={15} weight="regular" aria-hidden="true" />
        </Link>
      </div>

      <div className={styles.carouselFrame}>
        <div className={styles.eventList} ref={carouselRef}>
          {isLoading ? (
            Array.from({ length: 5 }, (_, index) => (
              <div className={styles.skeletonCard} key={index} aria-hidden="true">
                <div className={styles.skeletonPoster} />
                <div className={styles.skeletonTitle} />
                <div className={styles.skeletonMeta} />
              </div>
            ))
          ) : error ? (
            <p className={styles.message}>{error}</p>
          ) : events.length ? (
            events.map((event) => {
              const venue = event.venue;
              const eventDate = new Date(event.startsAt);
              const dateLabel = eventDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              const timeLabel = eventDate.toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              });

              return (
                <Link className={styles.eventCard} href={eventHref(event)} key={event.id}>
                  {event.imageUrl ? (
                    <div
                      className={styles.poster}
                      role="img"
                      aria-label={`${event.name} event poster`}
                      style={{ backgroundImage: `url("${event.imageUrl}")` }}
                    >
                      <span className={styles.posterBadge}>Event</span>
                    </div>
                  ) : (
                    <div className={`${styles.poster} ${styles.posterFallback}`}>
                      <span>{event.name}</span>
                      <span className={styles.posterBadge}>Event</span>
                    </div>
                  )}
                  <h3 title={event.name}>{event.name}</h3>
                  <p className={styles.eventMeta}>
                    <span>{venue?.location || venue?.name || "Live event"}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={event.startsAt}>{dateLabel}</time>
                    <span aria-hidden="true">·</span>
                    <span>{timeLabel}</span>
                  </p>
                </Link>
              );
            })
          ) : (
            <p className={styles.message}>No events are listed yet.</p>
          )}
        </div>
        {events.length > 3 && !isLoading && !error && (
          <>
            <button
              className={`${styles.carouselButton} ${styles.previousButton}`}
              type="button"
              aria-label="Previous events"
              onClick={() => scrollCarousel(-1)}
            >
              <ArrowLeft size={19} aria-hidden="true" />
            </button>
            <button
              className={`${styles.carouselButton} ${styles.nextButton}`}
              type="button"
              aria-label="Next events"
              onClick={() => scrollCarousel(1)}
            >
              <ArrowRight size={19} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </section>
  );
}