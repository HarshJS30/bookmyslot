"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import styles from "./EventDetails.module.css";

/* Must be rendered inside the <form> that uses the server action. */
export default function BookSubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className={styles.bookButton}
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          Redirecting…
        </>
      ) : (
        children
      )}
    </button>
  );
}