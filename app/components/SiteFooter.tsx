import HoverFillLink from "./HoverFillLink";
import Link from "next/link";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.panel}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <p className={styles.tagline}>Make plans. Find your seat. Be there.</p>
            <p className={styles.small}>© {new Date().getFullYear()} BookMySlot</p>
            <p className={styles.small}>
              Event details and seat availability are shown as provided by event organisers.
            </p>
          </div>

          <nav className={styles.links} aria-label="Footer navigation">
            <div>
              <h2>Discover</h2>
              <HoverFillLink href="/events">Browse events</HoverFillLink>
              <HoverFillLink href="/#popular-venues">Explore venues</HoverFillLink>
            </div>
            <div>
              <h2>Your account</h2>
              <HoverFillLink href="/bookings">My bookings</HoverFillLink>
              <HoverFillLink href="/#how-booking-works">How booking works</HoverFillLink>
            </div>
          </nav>

          <div className={styles.proof}>
            <h2>Built for fair booking</h2>
            <ul>
              <li>Live seat availability</li>
              <li>Timed seat holds</li>
              <li>One seat, one buyer</li>
            </ul>
            <p className={styles.built}>
              Built by{" "}
              <a href="https://helloharsh.me" target="_blank" rel="noopener noreferrer">
                Harsh
              </a>{" "}
              ·{" "}
              <a
                href="https://github.com/harshjs30/bookmyslot"
                target="_blank"
                rel="noopener noreferrer"
              >
                Source code
              </a>
            </p>
          </div>
        </div>

        <Link href="/" className={styles.wordmark} aria-label="BookMySlot home">
          book<span>my</span>slot
        </Link>
      </div>
    </footer>
  );
}