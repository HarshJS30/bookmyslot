import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import prisma from "@/lib/prisma";
import { eventHref } from "@/lib/event-url";
import styles from "./Events.module.css";

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    include: { venue: true },
    orderBy: { startsAt: "asc" },
  });

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/#now-showing">
        <ArrowLeft size={16} aria-hidden="true" /> Back to home
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>BookMySlot</p>
          <h1>All events</h1>
        </div>
        <p className={styles.count}>{events.length} {events.length === 1 ? "event" : "events"}</p>
      </header>
      {events.length ? (
        <div className={styles.eventGrid}>
          {events.map((event) => (
            <Link className={styles.eventCard} href={eventHref(event)} key={event.id}>
              {event.imageUrl ? (
                <div
                  className={styles.poster}
                  role="img"
                  aria-label={`${event.name} event poster`}
                  style={{ backgroundImage: `url("${event.imageUrl}")` }}
                />
              ) : (
                <div className={`${styles.poster} ${styles.posterFallback}`}>
                  <span>{event.name}</span>
                </div>
              )}
              <div className={styles.eventInfo}>
                <h2>{event.name}</h2>
                <p>{event.venue.name} · {event.venue.location}</p>
                <time dateTime={event.startsAt.toISOString()}>
                  {event.startsAt.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className={styles.emptyState}>No events are listed yet.</p>
      )}
    </main>
  );
}