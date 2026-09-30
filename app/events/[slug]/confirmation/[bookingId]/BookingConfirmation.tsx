"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, X, XCircle } from "@phosphor-icons/react";
import CheckoutProgress from "../../CheckoutProgress";
import styles from "./BookingConfirmation.module.css";

type BookingStatus = "CONFIRMED" | "CANCELLED";

type ConfirmationSeat = {
  id: string;
  seatLabel: string;
  categoryName: string;
  price: string;
};

export default function BookingConfirmation({
  bookingId,
  eventImageUrl,
  eventName,
  eventPath,
  eventTime,
  initialStatus,
  location,
  seats,
  total,
}: {
  bookingId: string;
  eventImageUrl: string | null;
  eventName: string;
  eventPath: string;
  eventTime: string;
  initialStatus: BookingStatus;
  location: string;
  seats: ConfirmationSeat[];
  total: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState("");
  const formattedTotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(total));

  async function cancelBooking() {
    if (status !== "CONFIRMED" || isCancelling) return;
    setIsCancelling(true);
    setError("");

    try {
      const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(await response.text());
      setStatus("CANCELLED");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Booking could not be cancelled.");
    } finally {
      setIsCancelling(false);
    }
  }

  const cancelled = status === "CANCELLED";

  return (
    <>
      <CheckoutProgress step={3} cancelled={cancelled} />
      <main className={styles.confirmation}>
        <header className={`${styles.statusHeader} ${cancelled ? styles.cancelled : ""}`}>
          {cancelled ? <XCircle size={42} /> : <CheckCircle size={42} />}
          <h1>{cancelled ? "Booking cancelled" : "Booking confirmed"}</h1>
          <p>
            {cancelled
              ? "The booking is cancelled and the seats have been released."
              : "Your demo payment was successful. No real payment was taken."}
          </p>
        </header>
        <section className={styles.reference} aria-label="Booking reference">
          <span>Booking reference</span>
          <strong>{bookingId}</strong>
        </section>
        <section className={styles.ticket} aria-label="Booked event and seats">
          <div className={styles.eventSummary}>
            <div
              aria-label={eventImageUrl ? `${eventName} poster` : undefined}
              className={`${styles.poster} ${eventImageUrl ? "" : styles.posterFallback}`}
              role={eventImageUrl ? "img" : undefined}
              style={eventImageUrl ? { backgroundImage: `url("${eventImageUrl}")` } : undefined}
            >
              {!eventImageUrl && eventName.slice(0, 1)}
            </div>
            <div>
              <h2>{eventName}</h2>
              <p>{location}</p>
              <time>{eventTime}</time>
            </div>
          </div>
          <div className={styles.ticketRows}>
            {seats.map((seat) => (
              <div className={styles.ticketRow} key={seat.id}>
                <span>{seat.categoryName} · {seat.seatLabel}</span>
                <strong>
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0,
                  }).format(Number(seat.price))}
                </strong>
              </div>
            ))}
          </div>
          <div className={styles.totalRow}>
            <span>{cancelled ? "Booking total" : "Demo total"}</span>
            <strong>{formattedTotal}</strong>
          </div>
        </section>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <footer className={styles.actions}>
          {!cancelled && (
            <button
              className={styles.cancelButton}
              disabled={isCancelling}
              onClick={cancelBooking}
              type="button"
            >
              {isCancelling ? "Cancelling..." : "Cancel booking"} <X size={15} aria-hidden="true" />
            </button>
          )}
          <Link className={styles.eventButton} href={eventPath}>
            Back to event <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </footer>
      </main>
    </>
  );
}