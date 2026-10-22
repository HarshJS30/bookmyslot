import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowsClockwise,
  Clock,
  EnvelopeSimple,
  MapPin,
  NavigationArrow,
  SealCheck,
  ShareNetwork,
  ShieldCheck,
  Ticket,
  Timer,
} from "@/app/components/Icons";
import prisma from "@/lib/prisma";
import { eventHref } from "@/lib/event-url";
import styles from "./EventDetails.module.css";
import PageHeader from "../../components/PageHeader";
import { DateTile, IconTile } from "@/app/components/Iconstile";
import { SaveButton, ShareButton } from "./EventActions";
import ReadMore from "./ReadMore";
import VenueMapSection from "./VenueMapSection";

const categoryLabels: Record<string, string> = {
  MOVIES: "Movie",
  CONCERTS: "Concert",
  COMEDY: "Comedy",
  THEATRE: "Theatre",
  SPORTS: "Sports",
  OTHER: "Event",
};

const priceFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function firstSentence(text: string) {
  const match = text.match(/^[\s\S]{20,160}?[.!?](\s|$)/);
  return (match ? match[0] : text.slice(0, 140)).trim();
}

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

  const seatSelectionHref = `${eventHref(event)}/seats`;

  const formattedDuration = event.durationMinutes
    ? `${Math.floor(event.durationMinutes / 60)}h${event.durationMinutes % 60 ? ` ${event.durationMinutes % 60}m` : ""}`
    : null;

  const IST = "Asia/Kolkata";
  const longDate = event.startsAt.toLocaleDateString("en-IN", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: IST,
  });
  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: IST }).toUpperCase();
  const timeLabel = formatTime(event.startsAt);
  const endsAt = event.durationMinutes
    ? new Date(event.startsAt.getTime() + event.durationMinutes * 60_000)
    : null;
  const timeRange = endsAt ? `${timeLabel} – ${formatTime(endsAt)} IST` : `${timeLabel} IST`;

  const description =
    event.description?.trim() ||
    `${event.name} takes place at ${event.venue.name} in ${event.venue.location}. Check the date, time and venue before you plan your visit.`;
  const tagline = description.length > 120 ? firstSentence(description) : null;

  const rawCategory = (event as unknown as { category?: string }).category;
  const category = rawCategory ? categoryLabels[rawCategory] : undefined;
  const venueCoords = event.venue as unknown as { latitude?: number | null; longitude?: number | null };

  const priceText = startingPrice ? priceFormatter.format(Number(startingPrice)) : null;
  const mapQuery = encodeURIComponent(`${event.venue.name}, ${event.venue.location}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`;

  const bookLabel = (
    <>
      <Ticket size={19} weight="fill" aria-hidden="true" />
      Book
      {priceText && <span className={styles.ctaPrice}>· from {priceText}</span>}
    </>
  );

  const bookCta =
    availableSeats === 0 ? (
      <button className={styles.bookButton} disabled type="button">
        Sold out
      </button>
    ) : (
      <Link className={styles.bookButton} href={seatSelectionHref}>
        {bookLabel}
      </Link>
    );

  return (
    <>
      <PageHeader />
      <main className={styles.page}>
        <div className={styles.shell}>
          <section className={styles.hero}>
            <div
              aria-hidden="true"
              className={`${styles.heroBackdrop} ${event.imageUrl ? "" : styles.heroBackdropFallback}`}
              style={event.imageUrl ? { backgroundImage: `url("${event.imageUrl}")` } : undefined}
            />
            <div className={styles.heroShade} aria-hidden="true" />

            <div className={styles.heroBar}>
              <Link className={styles.iconButton} href="/events" aria-label="Back to events">
                <ArrowLeft size={19} aria-hidden="true" />
              </Link>
              <div className={styles.heroActions}>
                <ShareButton title={event.name} />
                <SaveButton eventId={event.id} />
              </div>
            </div>

            <div className={styles.heroBody}>
              <div
                aria-label={event.imageUrl ? `${event.name} poster` : undefined}
                className={`${styles.posterCard} ${event.imageUrl ? "" : styles.posterFallback}`}
                role={event.imageUrl ? "img" : undefined}
                style={event.imageUrl ? { backgroundImage: `url("${event.imageUrl}")` } : undefined}
              >
                {!event.imageUrl && <span>{event.name}</span>}
              </div>

              <div className={styles.heroCopy}>
                <div className={styles.badges}>
                  {category && <span className={styles.badge}>{category}</span>}
                  {availableSeats > 0 && availableSeats <= 10 && (
                    <span className={`${styles.badge} ${styles.badgeHot}`}>Filling fast</span>
                  )}
                  {availableSeats === 0 && <span className={styles.badge}>Sold out</span>}
                </div>
                <h1 className={styles.pageTitle}>{event.name}</h1>
                {tagline && <p className={styles.tagline}>{tagline}</p>}
                <div className={styles.metaRows}>
                  <div className={styles.metaRow}>
                    <DateTile date={event.startsAt} />
                    <div className={styles.metaText}>
                      <strong>{longDate}</strong>
                      <time dateTime={event.startsAt.toISOString()}>{timeRange}</time>
                    </div>
                  </div>
                  <div className={styles.metaRow}>
                    <IconTile>
                      <MapPin size={20} aria-hidden="true" />
                    </IconTile>
                    <div className={styles.metaText}>
                      <a className={styles.venueLink} href={mapsUrl} rel="noopener noreferrer" target="_blank">
                        {event.venue.name}
                        <ArrowUpRight size={15} aria-hidden="true" />
                      </a>
                      <span>{event.venue.location}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className={styles.columns}>
            <div className={styles.mainCol}>
              <section className={styles.section} aria-labelledby="quick-info">
                <h2 id="quick-info">Quick info</h2>
                <ReadMore text={description} />
                <ul className={styles.facts}>
                  <li>
                    <IconTile size="sm" tone="accent"><Clock size={18} aria-hidden="true" /></IconTile>
                    Starts at {timeLabel}
                  </li>
                  {formattedDuration && (
                    <li>
                      <IconTile size="sm" tone="accent"><Timer size={18} aria-hidden="true" /></IconTile>
                      Approx. {formattedDuration}
                    </li>
                  )}
                  <li>
                    <IconTile size="sm" tone="accent"><Ticket size={18} aria-hidden="true" /></IconTile>
                    {availableSeats > 0 ? `${availableSeats} seats available` : "No seats available"}
                  </li>
                  <li>
                    <IconTile size="sm" tone="accent"><ShieldCheck size={18} aria-hidden="true" /></IconTile>
                    Seats held for up to 5 minutes
                  </li>
                </ul>
              </section>

              <section className={styles.section} aria-labelledby="sold-by">
                <h2 id="sold-by">Booked through</h2>
                <div className={styles.providerCard}>
                  <div className={styles.providerHead}>
                    <span className={styles.providerLogo}>
                      <Ticket size={24} weight="fill" aria-hidden="true" />
                    </span>
                    <strong className={styles.providerName}>
                      BookMySlot
                      <SealCheck className={styles.verified} size={18} weight="fill" aria-label="Verified" />
                    </strong>
                  </div>
                  <div className={styles.stats}>
                    <div className={styles.stat}>
                      <span>Seat hold</span>
                      <strong>5 min</strong>
                    </div>
                    <div className={styles.stat}>
                      <span>Tickets</span>
                      <strong>Instant</strong>
                    </div>
                    <div className={styles.stat}>
                      <span>Checkout</span>
                      <strong>Secure</strong>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="location">
                <h2 id="location">Location</h2>
                <p className={styles.locationLine}>
                  {event.venue.name} · {event.venue.location}
                </p>
                <div className={styles.locationActions}>
                  <ShareButton title={`${event.venue.name} location`} url={mapsUrl} variant="pill">
                    <ShareNetwork size={17} aria-hidden="true" />
                    Share Location
                  </ShareButton>
                  <a
                    className={`${styles.locationButton} ${styles.locationButtonPrimary}`}
                    href={directionsUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <NavigationArrow size={17} weight="fill" aria-hidden="true" />
                    Get Directions
                  </a>
                </div>
                <Suspense fallback={<div className={styles.mapSkeleton} aria-hidden="true" />}>
                  <VenueMapSection
                    latitude={venueCoords.latitude}
                    location={event.venue.location}
                    longitude={venueCoords.longitude}
                    name={event.venue.name}
                  />
                </Suspense>
              </section>

              <section className={styles.section} aria-labelledby="tips">
                <h2 id="tips">Tips before you go</h2>
                <div className={styles.tips}>
                  <div className={styles.tip}>
                    <span className={styles.tipIcon}><Timer size={18} aria-hidden="true" /></span>
                    <strong>Pick quickly</strong>
                    <p>Seats are held for up to five minutes while you complete your booking.</p>
                  </div>
                  <div className={styles.tip}>
                    <span className={styles.tipIcon}><ArrowsClockwise size={18} aria-hidden="true" /></span>
                    <strong>Seats can change</strong>
                    <p>If a seat is taken before you confirm, choose another available seat and try again.</p>
                  </div>
                  <div className={styles.tip}>
                    <span className={styles.tipIcon}><EnvelopeSimple size={18} aria-hidden="true" /></span>
                    <strong>Keep your ticket handy</strong>
                    <p>Your ticket is emailed to you and saved in My bookings.</p>
                  </div>
                </div>
              </section>
            </div>

            <aside className={styles.bookPanel} aria-label="Book tickets">
              <div className={styles.bookMeta}>
                <span className={styles.priceLabel}>{priceText ? "Starting from" : "Pricing"}</span>
                <strong className={styles.price}>{priceText ?? "Unavailable"}</strong>
                {availableSeats > 0 ? (
                  <p className={styles.availability}>
                    <span className={styles.availabilityDot} aria-hidden="true" />
                    {availableSeats <= 10 ? "Filling fast" : "Tickets available"}
                  </p>
                ) : (
                  <p className={styles.availability}>Tickets currently unavailable</p>
                )}
              </div>
              <div className={styles.bookActions}>
                {bookCta}
                <ShareButton title={event.name} />
                <SaveButton eventId={event.id} />
              </div>
              <p className={styles.secureNote}>
                <ShieldCheck size={13} aria-hidden="true" />
                Secure checkout · Live seat map on the next step
              </p>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
