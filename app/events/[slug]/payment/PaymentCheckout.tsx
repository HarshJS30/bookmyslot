"use client";

import { useState } from "react";
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
  eventPath,
  seats,
}: {
  eventPath: string;
  seats: CheckoutSeat[];
}) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const total = seats.reduce((sum, seat) => sum + Number(seat.price), 0);
  const formattedTotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(total);

  async function simulatePayment() {
    setIsBusy(true);
    setError("");

    try {
      const response = await fetch("/api/bookings/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatIds: seats.map((seat) => seat.id) }),
      });
      if (!response.ok) throw new Error(await response.text());

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
          <p className={styles.holdNote}>Your selected seats are held for up to five minutes.</p>
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
          <button className={styles.payButton} disabled={isBusy} onClick={simulatePayment} type="button">
            {isBusy ? "Processing demo..." : `Simulate payment · ${formattedTotal}`}
          </button>
        </aside>
      </div>
    </>
  );
}