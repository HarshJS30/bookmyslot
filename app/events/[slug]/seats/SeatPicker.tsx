"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { io } from "socket.io-client";
import { realtimeServerUrl } from "@/lib/service-urls";
import styles from "./SeatSelection.module.css";

type SeatData = {
  id: string;
  seatLabel: string;
  status: "AVAILABLE" | "HELD" | "BOOKED";
  category: {
    id: string;
    name: string;
    price: string;
  };
};

type SeatUpdate = {
  eventId: string;
  seatId: string;
  status: SeatData["status"];
};

function getRowAndNumber(seatLabel: string) {
  const match = seatLabel.match(/^(.*?)(\d+)$/);
  return match
    ? { row: match[1] || "Seats", number: Number(match[2]) }
    : { row: "Seats", number: null };
}

export default function SeatPicker({
  canBook,
  eventId,
  eventPath,
  seats,
}: {
  canBook: boolean;
  eventId: string;
  eventPath: string;
  seats: SeatData[];
}) {
  const router = useRouter();
  const [currentSeats, setCurrentSeats] = useState(seats);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [heldIds, setHeldIds] = useState<string[]>([]);
  const [focusedCategoryId, setFocusedCategoryId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "offline">("connecting");
  const heldIdsRef = useRef(new Set<string>());
  const reservingIdsRef = useRef(new Set<string>());
  const selectedSeats = currentSeats.filter((seat) => selectedIds.includes(seat.id));
  const total = selectedSeats.reduce((sum, seat) => sum + Number(seat.category.price), 0);
  const lowestPrice = Math.min(...currentSeats.map((seat) => Number(seat.category.price)));
  const availableCount = currentSeats.filter((seat) => seat.status === "AVAILABLE").length;
  const groupedRows = new Map<string, SeatData[]>();

  for (const seat of currentSeats) {
    const { row } = getRowAndNumber(seat.seatLabel);
    groupedRows.set(row, [...(groupedRows.get(row) ?? []), seat]);
  }

  const rows = Array.from(groupedRows, ([label, rowSeats]) => ({
    label,
    seats: rowSeats.sort((first, second) => {
      const firstNumber = getRowAndNumber(first.seatLabel).number;
      const secondNumber = getRowAndNumber(second.seatLabel).number;
      if (firstNumber !== null && secondNumber !== null) return firstNumber - secondNumber;
      return first.seatLabel.localeCompare(second.seatLabel, undefined, { numeric: true });
    }),
  })).sort((first, second) =>
    first.label.localeCompare(second.label, undefined, { numeric: true }),
  );

  // One card per ticket category: name, price and how many seats are still free
  const categoryMap = new Map<
    string,
    { id: string; name: string; price: number; available: number; total: number }
  >();
  for (const seat of currentSeats) {
    const entry = categoryMap.get(seat.category.id) ?? {
      id: seat.category.id,
      name: seat.category.name,
      price: Number(seat.category.price),
      available: 0,
      total: 0,
    };
    entry.total += 1;
    if (seat.status === "AVAILABLE") entry.available += 1;
    categoryMap.set(seat.category.id, entry);
  }
  const categories = Array.from(categoryMap.values()).sort((a, b) => a.price - b.price);

  useEffect(() => {
    const socket = io(realtimeServerUrl);

    socket.on("connect", () => {
      setConnectionState("live");
      socket.emit("join-event", eventId);
      fetch(`/api/events/${eventId}/seats`)
        .then((res)=>res.json())
        .then((data: SeatData[]) => setCurrentSeats(data))
        .catch(() => {});
    });
    socket.on("disconnect", () => setConnectionState("offline"));
    socket.on("connect_error", () => setConnectionState("offline"));
    socket.on("seat-update", (update: SeatUpdate) => {
      if (update.eventId !== eventId) return;

      setCurrentSeats((current) =>
        current.map((seat) =>
          seat.id === update.seatId ? { ...seat, status: update.status } : seat,
        ),
      );

      if (update.status === "AVAILABLE") {
        heldIdsRef.current.delete(update.seatId);
        setHeldIds(Array.from(heldIdsRef.current));
        return;
      }

      if (
        !heldIdsRef.current.has(update.seatId) &&
        !reservingIdsRef.current.has(update.seatId)
      ) {
        setSelectedIds((current) => current.filter((id) => id !== update.seatId));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [eventId]);

  const money = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);

  function toggleSeat(seat: SeatData) {
    if (!canBook || seat.status !== "AVAILABLE" || isSubmitting) return;
    setSelectedIds((current) =>
      current.includes(seat.id)
        ? current.filter((id) => id !== seat.id)
        : [...current, seat.id],
    );
    setError("");
  }

  async function continueToPayment() {
    if (!selectedIds.length || isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    const toHold = selectedIds.filter((id) => !heldIdsRef.current.has(id));
    toHold.forEach((id) => reservingIdsRef.current.add(id));

    try {
      if (toHold.length) {
        const response = await fetch(`/api/events/${eventId}/holds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatIds: toHold }),
        });
        if (!response.ok) {
          setSelectedIds([]);
          throw new Error(await response.text());
        }
        toHold.forEach((id) => heldIdsRef.current.add(id));
        setHeldIds(Array.from(heldIdsRef.current));
      }

      const query = new URLSearchParams({ seatIds: selectedIds.join(",") });
      router.push(`${eventPath}/payment?${query.toString()}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Booking could not be completed.");
    } finally {
      toHold.forEach((id) => reservingIdsRef.current.delete(id));
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.bookingLayout}>
      <section className={styles.seatPanel} aria-label="Event seat map">
        <div className={styles.mapHeader}>
          <div className={styles.mapTitle}>
            <h2>Choose your seats</h2>
            <p className={styles.availableCount}>
              {availableCount}/{currentSeats.length} available
            </p>
          </div>
          <p className={`${styles.connection} ${styles[connectionState]}`}>
            <span aria-hidden="true" />
            {connectionState === "live" ? "Live seat updates" : connectionState === "connecting" ? "Connecting" : "Reconnecting"}
          </p>
        </div>
        {categories.length > 0 && (
          <div className={styles.categoryRow} role="group" aria-label="Ticket categories">
            {categories.map((category) => (
              <button
                aria-pressed={focusedCategoryId === category.id}
                className={styles.categoryCard}
                data-active={focusedCategoryId === category.id}
                key={category.id}
                onClick={() =>
                  setFocusedCategoryId((current) => (current === category.id ? null : category.id))
                }
                disabled={!canBook}
                type="button"
              >
                <span className={styles.categoryName}>{category.name}</span>
                <strong className={styles.categoryPrice}>{money(category.price)}</strong>
                <span className={styles.categorySeats}>{category.available} seats left</span>
              </button>
            ))}
          </div>
        )}
        {rows.length ? (
          <div className={styles.mapViewport}>
            <div className={styles.seatMap}>
              <div className={styles.stage}><span>Stage</span></div>
              <div className={styles.cabin}>
                <div className={styles.seatRows}>
                  {rows.map((row) => (
                    <div className={styles.seatRow} key={row.label}>
                      <span className={styles.rowLabel}>{row.label}</span>
                      <div className={styles.rowSeats}>
                        {row.seats.map((seat) => {
                          const unavailable = seat.status !== "AVAILABLE";
                          const selected = selectedIds.includes(seat.id);
                          const { number } = getRowAndNumber(seat.seatLabel);
                          const isPremium = Number(seat.category.price) > lowestPrice;
                          const dimmed =
                            focusedCategoryId !== null && seat.category.id !== focusedCategoryId;
                          const statusStyle =
                            seat.status === "BOOKED"
                              ? styles.bookedSeat
                              : seat.status === "HELD"
                                ? styles.heldSeat
                                : "";
                          return (
                            <button
                              aria-label={`${seat.seatLabel}, ${unavailable ? seat.status.toLowerCase() : `${seat.category.name}, ${money(Number(seat.category.price))}`}`}
                              aria-pressed={selected}
                              className={`${styles.seat} ${isPremium ? styles.premiumSeat : ""} ${unavailable ? styles.unavailableSeat : ""} ${statusStyle} ${selected ? styles.selectedSeat : ""} ${number === 7 || number === 15 ? styles.aisleSeat : ""}`}
                              data-dim={dimmed}
                              disabled={unavailable || isSubmitting || !canBook}
                              key={seat.id}
                              onClick={() => toggleSeat(seat)}
                              type="button"
                            >
                              {number ?? seat.seatLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className={styles.emptyState}>Seats have not been added for this event yet.</p>
        )}
        <div className={styles.legend}>
          <span><i className={styles.availableKey} /> Available</span>
          <span><i className={styles.selectedKey} /> Selected</span>
          <span><i className={styles.heldKey} /> Held</span>
          <span><i className={styles.unavailableKey} /> Occupied</span>
          <span><i className={styles.premiumKey} /> Premium</span>
        </div>
      </section>
      <aside className={styles.summary} aria-label="Booking summary">
        <div className={styles.summaryHeading}>
          <h2>Selected seats</h2>
          {selectedSeats.length > 0 && (
            <button
              className={styles.clearButton}
              disabled={isSubmitting || selectedIds.some((id) => heldIds.includes(id))}
              onClick={() => setSelectedIds([])}
              type="button"
            >
              Clear
            </button>
          )}
        </div>
        {selectedSeats.length ? (
          <div className={styles.selectedList}>
            {selectedSeats.map((seat) => (
              <button
                aria-label={`Remove seat ${seat.seatLabel}`}
                className={styles.selectedChip}
                disabled={isSubmitting || heldIds.includes(seat.id)}
                key={seat.id}
                onClick={() => setSelectedIds((current) => current.filter((id) => id !== seat.id))}
                type="button"
              >
                {seat.seatLabel} <X size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.selectionHint}>{canBook ? "Select seats from the map." : "Sign in to select seats."}</p>
        )}
        <div className={styles.priceDetails}>
          <span>Ticket price ({selectedSeats.length})</span>
          <strong>{money(total)}</strong>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {canBook && (
          <button
            className={styles.primaryButton}
            disabled={!selectedIds.length || isSubmitting}
            onClick={continueToPayment}
            type="button"
          >
            {isSubmitting ? "Preparing checkout..." : "Continue to payment"}
          </button>
        )}
        {heldIds.length > 0 && (
          <p className={styles.holdNote}>Your selected seats are held for up to five minutes.</p>
        )}
      </aside>

      {/* phones: the total and button stay on screen while you pick seats */}
      {canBook && <div className={styles.mobileBar}>
        <div className={styles.mobileTotal}>
          <strong>{money(total)}</strong>
          <small>
            {selectedSeats.length
              ? `${selectedSeats.length} ${selectedSeats.length === 1 ? "seat" : "seats"} selected`
              : "No seats selected"}
          </small>
        </div>
        <button
          className={styles.primaryButton}
          disabled={!selectedIds.length || isSubmitting}
          onClick={continueToPayment}
          type="button"
        >
          {isSubmitting ? "Preparing..." : "Continue"}
        </button>
      </div>}
    </div>
  );
}
