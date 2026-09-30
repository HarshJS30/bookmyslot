import { Check, X } from "@phosphor-icons/react";
import styles from "./BookingProgress.module.css";

const steps = ["Seats", "Payment", "Confirmation"];

export default function CheckoutProgress({
  step,
  cancelled = false,
}: {
  step: 1 | 2 | 3;
  cancelled?: boolean;
}) {
  return (
    <nav className={styles.progressNav} aria-label="Booking progress">
      <ol className={styles.progress}>
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const complete = stepNumber < step;
          const current = stepNumber === step;

          return (
            <li
              aria-current={current ? "step" : undefined}
              className={`${styles.progressStep} ${complete ? styles.complete : ""} ${current ? styles.current : ""} ${current && cancelled ? styles.cancelled : ""}`}
              key={label}
            >
              <span className={styles.marker}>
                {complete ? <Check size={13} weight="bold" /> : current && cancelled ? <X size={13} weight="bold" /> : stepNumber}
              </span>
              <span>{current && cancelled ? "Cancelled" : label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}