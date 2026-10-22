import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { auth, signIn } from "@/auth";
import { eventHref } from "@/lib/event-url";
import prisma from "@/lib/prisma";
import SeatPicker from "./SeatPicker";
import CheckoutProgress from "../CheckoutProgress";
import styles from "./SeatSelection.module.css";

export default async function SeatSelectionPage({
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
      seats: {
        include: { category: true },
        orderBy: { seatLabel: "asc" },
      },
    },
  });

  if (!event) notFound();

  const session = await auth();
  const returnPath = `${eventHref(event)}/seats`;

  async function loginToChooseSeats() {
    "use server";
    await signIn("github", { redirectTo: returnPath });
  }

  const seats = event.seats.map((seat) => ({
    id: seat.id,
    seatLabel: seat.seatLabel,
    status: seat.status,
    category: {
      id: seat.category.id,
      name: seat.category.name,
      price: seat.category.price.toString(),
    },
  }));

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href={eventHref(event)}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to event
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Booking</p>
          <h1>Select seats</h1>
        </div>
      </header>
      <CheckoutProgress step={1} />
      <section className={styles.eventSummary} aria-label="Selected event">
        {event.imageUrl ? (
          <Image
            alt={`${event.name} poster`}
            className={styles.eventPoster}
            height={92}
            src={event.imageUrl}
            unoptimized
            width={72}
          />
        ) : (
          <div className={`${styles.eventPoster} ${styles.eventPosterFallback}`} aria-hidden="true">
            {event.name.slice(0, 1)}
          </div>
        )}
        <div className={styles.eventSummaryText}>
          <strong>{event.name}</strong>
          <span>{event.venue.name}, {event.venue.location}</span>
          <time dateTime={event.startsAt.toISOString()}>
            {event.startsAt.toLocaleString(undefined, {
              weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
            })}
          </time>
        </div>
      </section>
      <SeatPicker
        canBook={Boolean(session)}
        eventId={event.id}
        eventPath={eventHref(event)}
        seats={seats}
      />
      {!session && (
        <section className={styles.signInPrompt}>
          <p>Sign in to select seats and continue to booking.</p>
          <form action={loginToChooseSeats}>
            <button className={styles.primaryButton} type="submit">
              Sign in with GitHub <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
