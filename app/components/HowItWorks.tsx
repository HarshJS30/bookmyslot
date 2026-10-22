"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useReducedMotion } from "motion/react";
import { Check, EnvelopeSimple, Lock, MagnifyingGlass, Ticket, Timer } from "@phosphor-icons/react";
import styles from "./HowItWorks.module.css";

const steps = [
  {
    id: "find",
    title: "Find your event",
    body: "Search movies, concerts and comedy shows, or browse by category.",
  },
  {
    id: "seats",
    title: "Pick your seats",
    body: "Choose from a live seat map that updates as other people book.",
  },
  {
    id: "pay",
    title: "Pay securely",
    body: "Your payment is safe and encrypted, and your seats stay held while you check out.",
  },
  {
    id: "ticket",
    title: "Get your ticket",
    body: "It lands in your email and in My bookings the moment you pay.",
  },
] as const;

const spring = { type: "spring", stiffness: 420, damping: 34 } as const;

/* ------------------------------ helpers ------------------------------ */

function AnimatedNumber({ value, prefix = "" }: { value: number; prefix?: string }) {
  const reduce = useReducedMotion();
  const [animated, setAnimated] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    if (reduce) {
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: 0.6,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (latest) => setAnimated(Math.round(latest)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  const display = reduce ? value : animated;

  return (
    <span className={styles.number}>
      {prefix}
      {display.toLocaleString("en-IN")}
    </span>
  );
}

/* ------------------------------ scenes ------------------------------ */

function FindScene() {
  const reduce = useReducedMotion();
  const query = "Coldplay";
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (reduce) return;
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      setTyped(query.slice(0, count));
      if (count >= query.length) clearInterval(id);
    }, 110);
    return () => clearInterval(id);
  }, [reduce]);

  const shown = reduce ? query : typed;
  const done = shown.length === query.length;

  return (
    <div className={styles.scene}>
      <div className={styles.miniSearch}>
        <MagnifyingGlass size={16} aria-hidden="true" />
        <span>
          {shown}
          <i className={styles.caret} />
        </span>
      </div>
      <AnimatePresence>
        {done && (
          <motion.div
            className={styles.miniResult}
            initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring}
          >
            <strong>Coldplay — Music of the Spheres</strong>
            <span>Bengaluru</span>
            <time>6 Dec</time>
          </motion.div>
        )}
      </AnimatePresence>
      {done && (
        <motion.span
          className={styles.miniChip}
          initial={reduce ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: reduce ? 0 : 0.18 }}
        >
          Book seats
        </motion.span>
      )}
    </div>
  );
}

const SEAT_ROWS = ["..xx...x.", ".x.....xx", "x.......x", "..x.xx...", ".x.....x."];
const PICK_ORDER = ["2-3", "2-4", "2-5"];
const SEAT_PRICE = 1500;

function SeatsScene() {
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const timers = PICK_ORDER.map((_, index) => setTimeout(() => setPicked(index + 1), 600 + index * 380));
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  const count = reduce ? PICK_ORDER.length : picked;
  const pickedKeys = new Set(PICK_ORDER.slice(0, count));

  return (
    <div className={styles.scene}>
      <div className={styles.seatHeader}>
        <span className={styles.live}>
          <i className={styles.pulseDot} /> Live
        </span>
        <span>Row C</span>
      </div>
      <div className={styles.screen} />
      <div className={styles.seatGrid}>
        {SEAT_ROWS.flatMap((row, r) =>
          row.split("").map((cell, c) => {
            const key = `${r}-${c}`;
            const isPicked = pickedKeys.has(key);
            return (
              <motion.span
                key={key}
                className={`${styles.seat} ${cell === "x" ? styles.seatTaken : ""} ${isPicked ? styles.seatPicked : ""}`}
                animate={isPicked && !reduce ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
              />
            );
          }),
        )}
      </div>
      <div className={styles.seatSummary}>
        <span>
          {count} {count === 1 ? "seat" : "seats"}
        </span>
        <AnimatedNumber value={count * SEAT_PRICE} prefix="₹" />
      </div>
    </div>
  );
}

type PayPhase = "idle" | "press" | "busy" | "done";

function PayScene() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<PayPhase>("idle");

  useEffect(() => {
    if (reduce) return;
    const timers = [
      setTimeout(() => setPhase("press"), 900),
      setTimeout(() => setPhase("busy"), 1050),
      setTimeout(() => setPhase("done"), 2100),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduce]);

  const current: PayPhase = reduce ? "done" : phase;

  const label =
    current === "busy" ? (
      <span className={styles.btnSpinner} />
    ) : current === "done" ? (
      <span className={styles.btnDone}>
        <Check size={18} weight="bold" aria-hidden="true" /> Payment successful
      </span>
    ) : (
      <span>Pay ₹4,500</span>
    );

  return (
    <div className={styles.scene}>
      <div className={styles.payCard}>
        <div className={styles.payTop}>
          <span className={styles.payTag}>
            <Timer size={14} aria-hidden="true" /> Seats held for you
          </span>
          <span className={styles.payTag}>
            <Lock size={14} aria-hidden="true" /> Encrypted
          </span>
        </div>
        <div className={styles.payRow}>
          <span>3 seats × ₹1,500</span>
          <span className={styles.number}>₹4,500</span>
        </div>
        <motion.div
          className={`${styles.payButton} ${current === "done" ? styles.payButtonDone : ""}`}
          animate={{ scale: current === "press" ? 0.94 : 1 }}
          transition={spring}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={current === "press" ? "idle" : current}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.1 } }}
              transition={{ duration: 0.16 }}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

const QR = ["1110111", "1010101", "1110111", "0001000", "1101011", "0111010", "1010111"];

function TicketScene() {
  const reduce = useReducedMotion();

  return (
    <div className={styles.scene}>
      <motion.div
        className={styles.ticket}
        initial={reduce ? false : { opacity: 0, y: -36, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={spring}
      >
        <div className={styles.ticketMain}>
          <span className={styles.ticketLabel}>Admit 3</span>
          <strong>Coldplay — Music of the Spheres</strong>
          <span>Bengaluru · 6 Dec</span>
          <span className={styles.ticketSeats}>Row C · Seats 4, 5, 6</span>
        </div>
        <div className={styles.ticketStub}>
          <div className={styles.qr}>
            {QR.flatMap((row, r) =>
              row.split("").map((cell, c) => <i data-on={cell === "1"} key={`${r}-${c}`} />),
            )}
          </div>
        </div>
      </motion.div>
      <div className={styles.toasts}>
        <motion.span
          className={styles.toast}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: reduce ? 0 : 0.55 }}
        >
          <EnvelopeSimple size={14} aria-hidden="true" /> Sent to your email
        </motion.span>
        <motion.span
          className={styles.toast}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: reduce ? 0 : 0.8 }}
        >
          <Ticket size={14} aria-hidden="true" /> Saved in My bookings
        </motion.span>
      </div>
    </div>
  );
}

const scenes = [FindScene, SeatsScene, PayScene, TicketScene];

/* ------------------------------ section ------------------------------ */

export default function HowItWorks() {
  const reduce = useReducedMotion();
  const layoutRef = useRef<HTMLDivElement>(null);
  const inView = useInView(layoutRef, { amount: 0.5 });
  const [active, setActive] = useState(0);
  const Scene = scenes[active];

  return (
    <section className={styles.section} id="how-booking-works" aria-labelledby="how-title">
      <div className={styles.intro}>
        <h2 id="how-title">From search to seat in four steps.</h2>
        <p>No queues and no guesswork.</p>
      </div>

      <div className={styles.layout} data-playing={inView} ref={layoutRef}>
        <ol className={styles.steps}>
          {steps.map((step, index) => {
            const isActive = index === active;
            return (
              <li key={step.id}>
                <button
                  aria-current={isActive ? "step" : undefined}
                  className={`${styles.step} ${isActive ? styles.stepActive : ""}`}
                  onClick={() => setActive(index)}
                  type="button"
                >
                  <span className={styles.rail} aria-hidden="true">
                    {isActive && (
                      <span
                        className={styles.progress}
                        key={step.id}
                        onAnimationEnd={() => setActive((current) => (current + 1) % steps.length)}
                      />
                    )}
                  </span>
                  <span className={styles.stepHead}>
                    <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.stepTitle}>{step.title}</span>
                  </span>
                  <span className={styles.stepBody}>
                    <span>{step.body}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className={styles.stage} aria-hidden="true">
          <div className={styles.stageGrid} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className={styles.sceneWrap}
              key={steps[active].id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
              transition={spring}
            >
              <Scene />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}