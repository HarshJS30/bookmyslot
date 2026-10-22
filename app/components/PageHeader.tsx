import Image from "next/image";
import Link from "next/link";
import { MagnifyingGlass, Ticket } from "@phosphor-icons/react/dist/ssr";
import logoImg from "../../public/logo.png";
import styles from "./PageHeader.module.css";
import ScrollAwareHeader from "./ScrollAwareHeader";

export default function PageHeader({ showMobileMenu = true }: { showMobileMenu?: boolean }) {
  return (
    <ScrollAwareHeader>
      <header className={`${styles.header} ${showMobileMenu ? "" : styles.headerWithoutMenu}`}>
      <Link className={styles.logo} href="/" aria-label="BookMySlot home">
        <Image src={logoImg} alt="BookMySlot" priority />
      </Link>
      <nav className={styles.navigation} aria-label="Primary navigation">
        <Link href="/events">Movies &amp; events</Link>
        <Link href="/bookings">My bookings</Link>
      </nav>
      {showMobileMenu && (
        <details className={styles.mobileMenu}>
          <summary aria-label="Navigation menu">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </summary>
          <nav className={styles.mobileNavigation} aria-label="Primary navigation">
            <Link href="/events">Movies &amp; events</Link>
            <Link href="/bookings">My bookings</Link>
          </nav>
        </details>
      )}
      <div className={styles.actions}>
        <Link href="/events" aria-label="Search events" title="Search events">
          <MagnifyingGlass size={20} aria-hidden="true" />
        </Link>
        <Link href="/bookings" aria-label="My bookings" title="My bookings">
          <Ticket size={20} aria-hidden="true" />
        </Link>
      </div>
      </header>
    </ScrollAwareHeader>
  );
}
