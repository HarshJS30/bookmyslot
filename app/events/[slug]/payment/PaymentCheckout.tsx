"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Bank, CreditCard, LockKey, QrCode } from "@phosphor-icons/react";
import CheckoutProgress from "../CheckoutProgress";
import styles from "./PaymentCheckout.module.css";

function PaymentBrandMarks({ type }: { type: "upi" | "card" }) {
  const marks = type === "upi"
    ? [
        ["/payment-logos/google-pay.svg", "Google Pay"],
        ["/payment-logos/phonepe.svg", "PhonePe"],
        ["/payment-logos/paytm.svg", "Paytm"],
      ]
    : [
        ["/payment-logos/visa.svg", "Visa"],
        ["/payment-logos/mastercard.svg", "Mastercard"],
      ];
  if (type === "upi") {
    return (
      <span className={styles.methodLogos} aria-hidden="true">
        {marks.map(([src, name]) => <span key={name}><img src={src} alt={name} /></span>)}
      </span>
    );
  }
  return (
    <span className={styles.methodLogos} aria-hidden="true">
      {marks.map(([src, name]) => <span key={name}><img src={src} alt={name} /></span>)}
      <span><em>RuPay</em></span>
    </span>
  );
}

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
  eventImageUrl,
  eventName,
  eventTime,
  venueName,
  seats,
}: {
  holdExpiresAt: string;
  eventId: string;
  eventPath: string;
  eventImageUrl: string | null;
  eventName: string;
  eventTime: string;
  venueName: string;
  seats: CheckoutSeat[];
}) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [leftSeconds, setLeftSeconds] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const paidRef = useRef(false);
  const total = seats.reduce((sum, seat) => sum + Number(seat.price), 0);
  const formattedTotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(total);

  const releaseSeats = useCallback((keepalive = false) => {
    return fetch(`/api/events/${eventId}/holds`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatIds: seats.map((seat) => seat.id) }),
      keepalive,
    });
  }, [eventId, seats]);

  useEffect(() => {
    function onPageHide() {
      if (!paidRef.current) releaseSeats(true).catch(() => {});
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [releaseSeats]);

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
      <section className={styles.eventSummary} aria-label="Event for this booking">
        {eventImageUrl ? (
          <Image
            alt={`${eventName} poster`}
            className={styles.eventPoster}
            height={88}
            src={eventImageUrl}
            unoptimized
            width={70}
          />
        ) : (
          <div className={`${styles.eventPoster} ${styles.eventPosterFallback}`} aria-hidden="true">
            {eventName.slice(0, 1)}
          </div>
        )}
        <div className={styles.eventSummaryText}>
          <strong>{eventName}</strong>
          <span>{venueName}</span>
          <time>{eventTime}</time>
          <small>{seats.length} {seats.length === 1 ? "seat" : "seats"} selected</small>
        </div>
      </section>
      <div className={styles.checkoutGrid}>
        <section className={styles.paymentPanel}>
          <div className={styles.panelHeading}>
            <CreditCard size={20} aria-hidden="true" />
            <h2>Payment method</h2>
          </div>
          <div className={styles.methodList} role="radiogroup" aria-label="Payment method">
            <button type="button" role="radio" aria-checked={paymentMethod === "upi"} className={`${styles.methodOption} ${paymentMethod === "upi" ? styles.methodSelected : ""}`} onClick={() => setPaymentMethod("upi")}>
              <span className={styles.radio} aria-hidden="true" />
              <QrCode size={19} weight="bold" aria-hidden="true" />
              <span className={styles.methodName}><strong>UPI</strong><small>Google Pay, PhonePe, Paytm</small></span>
              <PaymentBrandMarks type="upi" />
            </button>
            <button type="button" role="radio" aria-checked={paymentMethod === "card"} className={`${styles.methodOption} ${paymentMethod === "card" ? styles.methodSelected : ""}`} onClick={() => setPaymentMethod("card")}>
              <span className={styles.radio} aria-hidden="true" /><CreditCard size={19} weight="bold" aria-hidden="true" />
              <span className={styles.methodName}><strong>Credit or debit card</strong><small>Visa, Mastercard, RuPay</small></span>
              <PaymentBrandMarks type="card" />
            </button>
            <button type="button" role="radio" aria-checked={paymentMethod === "bank"} className={`${styles.methodOption} ${paymentMethod === "bank" ? styles.methodSelected : ""}`} onClick={() => setPaymentMethod("bank")}>
              <span className={styles.radio} aria-hidden="true" /><Bank size={19} weight="bold" aria-hidden="true" />
              <span className={styles.methodName}><strong>Net banking</strong><small>Choose your bank</small></span>
              <span className={styles.bankMark}><Bank size={18} aria-hidden="true" /></span>
            </button>
          </div>
          <div className={styles.simulatedNote}><span className={styles.demoBadge}>DEMO</span><span>Payment is simulated. No payment details are collected and no charge is made.</span></div>
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
          <button
            aria-busy={isBusy}
            className={styles.payButton}
            disabled={isBusy || leftSeconds === 0 || leftSeconds === null}
            onClick={simulatePayment}
            type="button"
          >
            {isBusy ? "Processing demo..." : `Pay ${formattedTotal}`}
          </button>
          <p className={styles.secureNote}><LockKey size={12} weight="bold" aria-hidden="true" /> Secure simulated payment</p>
          <button className={styles.clearButton} disabled={isBusy} onClick={cancelCheckout} type="button">
            Cancel and release seats
          </button>
        </aside>
      </div>
    </>
  );
}
