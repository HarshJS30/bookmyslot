"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "@phosphor-icons/react";
import CheckoutProgress from "../CheckoutProgress";
import styles from "./PaymentCheckout.module.css";

type CheckoutSeat = {
  id: string;
  seatLabel: string;
  categoryName: string;
  price: string;
};

export default function PaymentCheckout({
  holdExpiresAt,
  eventId,
  eventPath,
  seats,
}: {
  holdExpiresAt: string;
  eventId: string;
  eventPath: string;
  seats: CheckoutSeat[];
}) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [leftSeconds, setLeftSeconds] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const paidRef = useRef(false);
  const total = seats.reduce((sum, seat) => sum + Number(seat.price), 0);
  const formattedTotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(total);

  function releaseSeats(keepalive = false) {
    return fetch(`/api/events/${eventId}/holds`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatIds: seats.map((seat) => seat.id) }),
      keepalive,
    });
  }

  useEffect(() => {
    function onPageHide() {
      if (!paidRef.current) releaseSeats(true).catch(() => {});
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [eventId, seats]);

  useEffect(()=>{
    function updateLeftSeconds() {
      const remaining = Math.floor(
        (new Date(holdExpiresAt).getTime() - Date.now()) / 1000
      );
      setLeftSeconds(Math.max(0, remaining));
    }
    updateLeftSeconds();
    const interval = setInterval(updateLeftSeconds, 1000);
    return () => clearInterval(interval);
  },[holdExpiresAt])

  async function cancelCheckout() {
    setIsBusy(true);
    try {
      await releaseSeats();
    } catch {
      // seats will expire on their own if this fails
    } finally {
      router.push(`${eventPath}/seats`);
    }
  }

  async function simulatePayment() {
    setIsBusy(true);
    setError("");

    try {
      const response = await fetch("/api/bookings/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ seatIds: seats.map((seat) => seat.id) }),
      });
      if (!response.ok) throw new Error(await response.text());

      paidRef.current = true;
      const result = (await response.json()) as { booking: { id: string } };
      router.push(`${eventPath}/confirmation/${result.booking.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demo payment could not be completed.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <CheckoutProgress step={2} />
      <div className={styles.checkoutGrid}>
        <section className={styles.paymentPanel}>
          <div className={styles.panelHeading}>
            <CreditCard size={20} aria-hidden="true" />
            <h2>Payment method</h2>
          </div>
          <div className={styles.demoMethod}>
            <span className={styles.radio} aria-hidden="true" />
            <span>
              <strong>Simulated payment</strong>
              <small>No card details required</small>
            </span>
            <span className={styles.demoBadge}>DEMO</span>
          </div>
          <p className={styles.disclaimer}>
            This checkout is for demonstration only. No payment provider is contacted, no real payment method is collected, and no real charge is made.
          </p>
          <p className={styles.holdNote}>
            {leftSeconds === null
              ? "Checking your hold..."
              : leftSeconds === 0
                ? "Your hold has expired"
                : `Your selected seats are held for ${Math.floor(leftSeconds / 60)}:${String(leftSeconds % 60).padStart(2, "0")}`}
          </p>
        </section>
        <aside className={styles.orderPanel} aria-label="Order summary">
          <h2>Order summary</h2>
          <div className={styles.seatList}>
            {seats.map((seat) => (
              <div className={styles.seatLine} key={seat.id}>
                <span>
                  <strong>{seat.seatLabel}</strong>
                  <small>{seat.categoryName}</small>
                </span>
                <span>{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(seat.price))}</span>
              </div>
            ))}
          </div>
          <div className={styles.totalLine}>
            <strong>Total</strong>
            <strong>{formattedTotal}</strong>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.payButton} disabled={isBusy|| leftSeconds === 0 || leftSeconds === null} onClick={simulatePayment} type="button">
            {isBusy ? "Processing demo..." : `Simulate payment · ${formattedTotal}`}
          </button>
          <button className={styles.clearButton} disabled={isBusy} onClick={cancelCheckout} type="button">
            Cancel and release seats
          </button>
        </aside>
      </div>
    </>
  );
}