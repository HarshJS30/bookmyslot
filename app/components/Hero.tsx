import Image from "next/image";
import Link from "next/link";
import { SignOut, Ticket, UserCircle } from "@phosphor-icons/react/dist/ssr";
import styles from "../components/Hero.module.css";
import ScrollAwareHeader from "./ScrollAwareHeader";
import heroImg from "../../public/hero-image1.png";
import logoImg from "../../public/logo.png";
import HeroSearch from "./HeroSearch";

type HeroProps = {
  isSignedIn: boolean;
  userName: string | null;
  userEmail: string | null;
  signInAction: (formData: FormData) => void | Promise<void>;
  signOutAction: (formData: FormData) => void | Promise<void>;
};

export default function Hero({
  isSignedIn,
  userName,
  userEmail,
  signInAction,
  signOutAction,
}: HeroProps) {
  const displayName = userName || userEmail?.split("@")[0] || "there";
  const firstName = displayName.split(" ")[0];
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <>
      <ScrollAwareHeader>
      <header className={styles.navbar}>
        <nav className={styles.navGroup} aria-label="Primary navigation">
          <Link href="#now-showing" aria-current="true" aria-label="Browse events" data-label="Events"><span>Events</span></Link>
          <Link href="#popular-venues" aria-label="Explore venues" data-label="Venues"><span>Venues</span></Link>
          <Link href="#how-booking-works" aria-label="How booking works" data-label="How it works"><span>How it works</span></Link>
        </nav>
        <details className={styles.mobileMenu}>
          <summary aria-label="Navigation menu">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </summary>
          <nav className={styles.mobileNavGroup} aria-label="Primary navigation">
            <Link href="#now-showing">Events</Link>
            <Link href="#popular-venues">Venues</Link>
            <Link href="#how-booking-works">How it works</Link>
          </nav>
        </details>
        <Link className={styles.logo} href="/" aria-label="BookMySlot home">
          <Image src={logoImg} alt="BookMySlot" priority />
        </Link>
        <div className={styles.accountActions}>
          {isSignedIn ? (
            <>
              <div className={styles.accountIdentity}>
                <div className={styles.avatar} aria-hidden="true">{initial}</div>
                <span>Hi, {firstName}</span>
              </div>
              <Link className={styles.bookingsLink} href="/bookings">
                <Ticket size={17} aria-hidden="true" />
                <span>My bookings</span>
              </Link>
              <form action={signOutAction}>
                <button className={styles.signOutButton} type="submit" aria-label="Sign out" title="Sign out">
                  <SignOut size={22} weight="regular" aria-hidden="true" />
                </button>
              </form>
            </>
          ) : (
            <form className={styles.accountSignIn} action={signInAction}>
              <button className={styles.callToAction} type="submit" aria-label="Sign in with GitHub" data-label="Sign in">
                <span>Sign in</span>
              </button>
              <button className={styles.accountIcon} type="submit" aria-label="Sign in to your account" title="Sign in">
                <UserCircle size={23} weight="regular" aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
      </header>
      </ScrollAwareHeader>
      <div className={styles.hero}>
        <Image src={heroImg} alt="Cinema" fill priority />
        <div className={styles.heroShade} aria-hidden="true" />
      <main className={styles.heroContent}>
        <h1>
          Don&apos;t just watch,
          <br />
          <span>be there.</span>
        </h1>
        <p>Book movie tickets, events and more — all in one place.</p>
        <HeroSearch />
      </main>
    </div>
    </>
  );
}
