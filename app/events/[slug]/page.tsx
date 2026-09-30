import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  CalendarBlank,
  Clock,
  MapPinIcon,
  ShieldCheck,
  Timer,
} from "@phosphor-icons/react/dist/ssr";
import { signIn } from "@/auth";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { eventHref } from "@/lib/event-url";
import styles from "./EventDetails.module.css";

export default async function EventDetails({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const separatorIndex = slug.lastIndexOf("--");
  const eventId = separatorIndex >= 0 ? slug.slice(separatorIndex + 2) : "";

  if (!eventId) notFound();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      venue: true,
      ticketCategories: {
        orderBy: { price: "asc" },
        include: {
          seats: {
            where: { status: "AVAILABLE" },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!event) notFound();

  const availableCategories = event.ticketCategories.filter((category) => category.seats.length > 0);
  const startingPrice = availableCategories[0]?.price ?? event.ticketCategories[0]?.price;
  const availableSeats = event.ticketCategories.reduce(
    (total, category) => total + category.seats.length,
    0,
  );

  const session = await auth();
  const seatSelectionHref = `${eventHref(event)}/seats`;

  async function loginToBook() {
    "use server";
    await signIn("github", { redirectTo: seatSelectionHref });
  }

  const formattedDuration = event.durationMinutes
    ? `${Math.floor(event.durationMinutes / 60)}h${event.durationMinutes % 60 ? ` ${event.durationMinutes % 60}m` : ""}`
    : null;

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/#now-showing">
        <ArrowLeft size={17} weight="bold" aria-hidden="true" />
        Back to events
      </Link>
      <h1 className={styles.pageTitle}>{event.name}</h1>
      <div className={styles.content}>
        <section className={styles.posterFrame}>
          <div
            className={`${styles.poster} ${event.imageUrl ? "" : styles.posterFallback}`}
            role={event.imageUrl ? "img" : undefined}
            aria-label={event.imageUrl ? `${event.name} event poster` : undefined}
            style={event.imageUrl ? { backgroundImage: `url("${event.imageUrl}")` } : undefined}
          >
            {!event.imageUrl && <span>{event.name}</span>}
          </div>
        </section>
        <aside className={styles.details} aria-label="Event details">
          <h2>Event details</h2>
          <div className={styles.detailRow}>
            <span className={`${styles.iconTile} ${styles.dateIcon}`}>
              <CalendarBlank size={17} aria-hidden="true" />
            </span>
            <div className={styles.detailText}>
              <span className={styles.detailLabel}>Date</span>
              <time dateTime={event.startsAt.toISOString()}>
                {event.startsAt.toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </time>
            </div>
          </div>
          <div className={styles.detailRow}>
            <span className={`${styles.iconTile} ${styles.timeIcon}`}>
              <Clock size={17} aria-hidden="true" />
            </span>
            <div className={styles.detailText}>
              <span className={styles.detailLabel}>Time</span>
              <time dateTime={event.startsAt.toISOString()}>
                {event.startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </time>
            </div>
          </div>
          <div className={styles.detailRow}>
            <span className={`${styles.iconTile} ${styles.venueIcon}`}>
              <Buildings size={17} aria-hidden="true" />
            </span>
            <div className={styles.detailText}>
              <span className={styles.detailLabel}>Venue</span>
              <span>{event.venue.name}</span>
            </div>
          </div>
          <div className={styles.detailRow}>
            <span className={`${styles.iconTile} ${styles.locationIcon}`}>
              <MapPinIcon size={17} aria-hidden="true" />
            </span>
            <div className={styles.detailText}>
              <span className={styles.detailLabel}>Location</span>
              <span>{event.venue.location}</span>
            </div>
          </div>
          {formattedDuration && (
            <div className={styles.detailRow}>
              <span className={`${styles.iconTile} ${styles.durationIcon}`}>
                <Timer size={17} aria-hidden="true" />
              </span>
              <div className={styles.detailText}>
                <span className={styles.detailLabel}>Duration</span>
                <span>Approx. {formattedDuration}</span>
              </div>
            </div>
          )}
          <div className={styles.bookingBlock}>
            <div className={styles.priceLine}>
              <strong>
                {startingPrice
                  ? `${new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    }).format(Number(startingPrice))} onwards`
                  : "Pricing unavailable"}
              </strong>
            </div>
            {availableSeats > 0 ? (
              <p className={styles.availability}>
                <span aria-hidden="true" />
                {availableSeats <= 10 ? "Filling fast" : "Tickets available"}
              </p>
            ) : (
              <p className={styles.unavailable}>Tickets currently unavailable</p>
            )}
            {availableSeats > 0 && (
              session ? (
                <Link className={styles.bookButton} href={seatSelectionHref}>
                  Choose seats <ArrowRight size={15} aria-hidden="true" />
                </Link>
              ) : (
                <form action={loginToBook}>
                  <button className={styles.bookButton} type="submit">
                    Login to book <ArrowRight size={15} aria-hidden="true" />
                  </button>
                </form>
              )
            )}
            <p className={styles.secureNote}>
              <ShieldCheck size={13} aria-hidden="true" />
              Secure booking · Seat availability updates live
            </p>
          </div>
        </aside>
        <section className={styles.eventCopy}>
          <section className={styles.copySection}>
            <h2>About this event</h2>
            <p className={styles.description}>
              {event.description ||
                `${event.name} takes place at ${event.venue.name} in ${event.venue.location}. Check the date, time, and venue details before planning your visit.`}
            </p>
            <p className={styles.description}>
              Find the event schedule and venue information here, then use BookMySlot to review
              the seats available for this event. Seat availability can change as other guests
              make their bookings.
            </p>
          </section>
          <section className={styles.copySection}>
            <h2>Booking with BookMySlot</h2>
            <p className={styles.description}>
              Select from the seats currently available. When you reserve a seat, it is held for
              up to five minutes while you complete your booking. Confirm within that window to
              secure your seats.
            </p>
            <p className={styles.description}>
              A successful confirmation records your booking and payment details. If a seat
              becomes unavailable before confirmation, choose another available seat and try
              again.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}