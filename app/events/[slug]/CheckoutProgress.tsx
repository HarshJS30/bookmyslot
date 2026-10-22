import { Check, X } from "@phosphor-icons/react/dist/ssr";
import styles from "./BookingProgress.module.css";

const steps = ["Seats", "Payment", "Confirmation"];

export default function CheckoutProgress({
  step,
  cancelled = false,
}: {
  step: 1 | 2 | 3;
  cancelled?: boolean;
}) {
  const currentLabel = cancelled ? "Cancelled" : steps[step - 1];

  return (
    <nav
      aria-label="Booking progress"
      className={`${styles.progressNav} ${cancelled ? styles.navCancelled : ""}`}
    >
      {/* phones: compact "Step 2 of 3" with three segments */}
      <p className={styles.compact}>
        <span>
          Step {step} of {steps.length}
        </span>
        <strong>{currentLabel}</strong>
      </p>
      <div className={styles.compactBar} aria-hidden="true">
        {steps.map((label, index) => (
          <span
            className={`${styles.segment} ${index < step - 1 ? styles.segmentDone : ""} ${index === step - 1 ? styles.segmentCurrent : ""}`}
            key={label}
          />
        ))}
      </div>

      {/* larger screens: full stepper */}
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
                {complete ? (
                  <Check size={13} weight="bold" aria-hidden="true" />
                ) : current && cancelled ? (
                  <X size={13} weight="bold" aria-hidden="true" />
                ) : (
                  stepNumber
                )}
              </span>
              <span>{current && cancelled ? "Cancelled" : label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}