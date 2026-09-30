import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarBlank, MapPinIcon, Ticket } from "@phosphor-icons/react/dist/ssr";
import { auth, signIn } from "@/auth";
import { eventHref } from "@/lib/event-url";
import prisma from "@/lib/prisma";
import styles from "./Bookings.module.css";

export default async function BookingsPage() {
  const session = await auth();

  async function signInToViewBookings() {
    "use server";
    await signIn("github", { redirectTo: "/bookings" });
  }

  if (!session?.user?.id) {
    return (
      <main className={styles.page}>
        <Link className={styles.backLink} href="/">
          <ArrowLeft size={16} aria-hidden="true" /> Back to home
        </Link>
        <section className={styles.signInPrompt}>
          <Ticket size={28} aria-hidden="true" />
          <h1>My bookings</h1>
          <p>Sign in to view your booking history.</p>
          <form action={signInToViewBookings}>
            <button className={styles.primaryButton} type="submit">
              Sign in with GitHub <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
        </section>
      </main>
    );
  }

  const bookings = await prisma.booking.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      payment: true,
      bookingSeats: {
        include: {
          seat: {
            include: {
              category: true,
              event: { include: { venue: true } },
            },
          },
        },
      },
    },
  });

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/">
        <ArrowLeft size={16} aria-hidden="true" /> Back to home
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your account</p>
          <h1>My bookings</h1>
        </div>
        <p className={styles.bookingCount}>
          {bookings.length} {bookings.length === 1 ? "booking" : "bookings"}
        </p>
      </header>

      {bookings.length ? (
        <div className={styles.bookingList}>
          {bookings.map((booking) => {
            const firstSeat = booking.bookingSeats[0]?.seat;
            const sameEvent = firstSeat && booking.bookingSeats.every(
              ({ seat }) => seat.eventId === firstSeat.eventId,
            );
            const total = booking.payment?.amount.toNumber() ?? booking.bookingSeats.reduce(
              (sum, { seat }) => sum + Number(seat.category.price),
              0,
            );
            const statusClass = booking.status === "CONFIRMED"
              ? styles.confirmed
              : booking.status === "CANCELLED"
                ? styles.cancelled
                : styles.pending;
            const confirmationHref = sameEvent && firstSeat
              ? `${eventHref(firstSeat.event)}/confirmation/${booking.id}`
              : null;

            return (
              <article className={styles.booking} key={booking.id}>
                {firstSeat?.event.imageUrl ? (
                  <Image
                    alt={`${firstSeat.event.name} poster`}
                    className={styles.poster}
                    height={112}
                    src={firstSeat.event.imageUrl}
                    unoptimized
                    width={84}
                  />
                ) : (
                  <div className={`${styles.poster} ${styles.posterFallback}`} aria-hidden="true">
                    {firstSeat?.event.name.slice(0, 1) ?? <Ticket size={25} />}
                  </div>
                )}
                <div className={styles.bookingDetails}>
                  <div className={styles.bookingHeading}>
                    <div>
                      <h2>{firstSeat?.event.name ?? "Booking details unavailable"}</h2>
                      <p className={styles.venue}>
                        <MapPinIcon size={14} aria-hidden="true" />
                        {firstSeat
                          ? `${firstSeat.event.venue.name}, ${firstSeat.event.venue.location}`
                          : "Event information unavailable"}
                      </p>
                    </div>
                    <span className={`${styles.status} ${statusClass}`}>
                      {booking.status.toLowerCase()}
                    </span>
                  </div>
                  <p className={styles.meta}>
                    <CalendarBlank size={14} aria-hidden="true" />
                    Booked {booking.createdAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    <span aria-hidden="true">·</span>
                    {booking.bookingSeats.length} {booking.bookingSeats.length === 1 ? "seat" : "seats"}
                  </p>
                  {booking.bookingSeats.length > 0 && (
                    <p className={styles.seatNames}>
                      {booking.bookingSeats
                        .map(({ seat }) => `${seat.category.name} · ${seat.seatLabel}`)
                        .join(", ")}
                    </p>
                  )}
                  <div className={styles.bookingFooter}>
                    <strong>
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                        maximumFractionDigits: 0,
                      }).format(total)}
                    </strong>
                    {confirmationHref && (
                      <Link className={styles.detailsLink} href={confirmationHref}>
                        Booking details <ArrowRight size={15} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className={styles.emptyState}>
          <Ticket size={25} aria-hidden="true" />
          <h2>No bookings yet</h2>
          <p>Your confirmed and cancelled bookings will appear here.</p>
          <Link className={styles.detailsLink} href="/events">
            Browse events <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      )}
    </main>
  );
}