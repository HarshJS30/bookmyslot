import Image from "next/image";
import Link from "next/link";
import { SignOut, Ticket, UserCircle } from "@phosphor-icons/react/dist/ssr";
import styles from "../components/Hero.module.css";
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

  return (
    <div className={styles.hero}>
      <Image src={heroImg} alt="Cinema" fill priority />
      <div className={styles.heroShade} aria-hidden="true" />
      <header className={styles.navbar}>
        <nav className={styles.navGroup} aria-label="Event categories">
          <a href="#movies" aria-label="Movies" data-label="Movies"><span>Movies</span></a>
          <a href="#concerts" aria-label="Concerts" data-label="Concerts"><span>Concerts</span></a>
          <a href="#sports" aria-label="Sports" data-label="Sports"><span>Sports</span></a>
          <a href="#theatre" aria-label="Theatre" data-label="Theatre"><span>Theatre</span></a>
        </nav>
        <Link className={styles.logo} href="/" aria-label="BookMySlot home">
          <Image src={logoImg} alt="BookMySlot" priority />
        </Link>
        <div className={styles.accountActions}>
          {isSignedIn ? (
            <>
              <div className={styles.accountIdentity}>
                <UserCircle size={26} weight="regular" aria-hidden="true" />
                <span>Hi, {displayName}</span>
              </div>
              <Link className={styles.bookingsLink} href="/bookings">
                <Ticket size={17} aria-hidden="true" />
                <span>My bookings</span>
              </Link>
              <form action={signOutAction}>
                <button className={styles.accountIcon} type="submit" aria-label="Sign out" title="Sign out">
                  <SignOut size={21} weight="regular" aria-hidden="true" />
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
      <main className={styles.heroContent}>
        <h1>
          Dont Just watch,
          <br />
          <span>be there.</span>
        </h1>
        <p>Book movie tickets, events and more — all in one place.</p>
        <HeroSearch />
      </main>
    </div>
  );
}