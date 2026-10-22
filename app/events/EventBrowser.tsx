"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarBlank,
  MapPin,
  MagnifyingGlass,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import { eventHref } from "@/lib/event-url";
import styles from "./Events.module.css";

export type BrowserEvent = {
  id: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  startsAt: string;
  category: string;
  organizerName: string | null;
  isSoldOut: boolean;
  popularityCount: number;
  lowestPrice: number | null;
  venue: { name: string; location: string };
};

type DateChoice = "any" | "today" | "tomorrow" | "week" | "month";
type SortChoice = "popular" | "soonest" | "price-low" | "price-high";

const categories = [
  ["ALL", "All"], ["MOVIES", "Movies"], ["CONCERTS", "Concerts"],
  ["THEATRE", "Theatre"], ["COMEDY", "Comedy"], ["SPORTS", "Sports"], ["OTHER", "More"],
] as const;

const categoryNames: Record<string, string> = {
  MOVIES: "Movies", CONCERTS: "Concert", COMEDY: "Comedy",
  THEATRE: "Theatre", SPORTS: "Sports", OTHER: "Event",
};

function dateKey(date: Date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function getDateChoice(date: Date): DateChoice {
  const today = dateKey(new Date());
  const target = dateKey(date);
  if (target === today) return "today";
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  if (target === dateKey(tomorrowDate)) return "tomorrow";

  const todayUtc = new Date(`${today}T00:00:00Z`);
  const targetUtc = new Date(`${target}T00:00:00Z`);
  const day = todayUtc.getUTCDay();
  const weekStart = new Date(todayUtc);
  weekStart.setUTCDate(todayUtc.getUTCDate() - day);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 7);
  if (targetUtc >= weekStart && targetUtc < weekEnd) return "week";
  if (target.slice(0, 7) === today.slice(0, 7)) return "month";
  return "any";
}

function formatEventDate(date: string) {
  const value = new Date(date);
  const dateLabel = value.toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
  const timeLabel = value.toLocaleTimeString("en-IN", {
    hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
  return `${dateLabel} · ${timeLabel}`;
}

export default function EventBrowser({
  events,
  initialCity,
}: {
  events: BrowserEvent[];
  initialCity: string;
}) {
  const [city, setCity] = useState(initialCity);
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [dateChoice, setDateChoice] = useState<DateChoice>("any");
  const [venueSearch, setVenueSearch] = useState("");
  const [query, setQuery] = useState("");
  const [maxPrice, setMaxPrice] = useState(10000);
  const [sort, setSort] = useState<SortChoice>("popular");
  const [moreFilters, setMoreFilters] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);

  const cities = useMemo(() => [...new Set(events.map((event) => event.venue.location))].sort(), [events]);
  const visibleEvents = useMemo(() => {
    const searchTerm = query.trim().toLocaleLowerCase();
    const venueTerm = venueSearch.trim().toLocaleLowerCase();
    return events.filter((event) => {
      const cityMatches = !city || event.venue.location.toLocaleLowerCase() === city.toLocaleLowerCase();
      const searchMatches = !searchTerm || `${event.name} ${event.venue.name} ${event.venue.location} ${event.organizerName ?? ""}`.toLocaleLowerCase().includes(searchTerm);
      const venueMatches = !venueTerm || `${event.venue.name} ${event.venue.location}`.toLocaleLowerCase().includes(venueTerm);
      const dateMatches = dateChoice === "any" || getDateChoice(new Date(event.startsAt)) === dateChoice;
      const priceMatches = maxPrice >= 10000 || event.lowestPrice === null || event.lowestPrice <= maxPrice;
      return cityMatches && searchMatches && venueMatches && dateMatches && priceMatches &&
        (activeCategory === "ALL" || event.category === activeCategory) && (!availableOnly || !event.isSoldOut);
    }).sort((a, b) => {
      if (sort === "soonest") return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      if (sort === "price-low") return (a.lowestPrice ?? Infinity) - (b.lowestPrice ?? Infinity);
      if (sort === "price-high") return (b.lowestPrice ?? -1) - (a.lowestPrice ?? -1);
      return b.popularityCount - a.popularityCount || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }, [events, city, activeCategory, dateChoice, venueSearch, query, maxPrice, sort, availableOnly]);

  const resetFilters = () => {
    setCity(""); setActiveCategory("ALL"); setDateChoice("any"); setVenueSearch("");
    setQuery(""); setMaxPrice(10000); setSort("popular"); setAvailableOnly(false);
  };

  return (
    <div className={styles.browser}>
      <header className={styles.discoverHeader}>
        <div>
          <p className={styles.eyebrow}>Discover events</p>
          <h1>{city ? `What’s on in ${city}?` : "Find something great to do."}</h1>
          <p className={styles.intro}>Movies, concerts, theatre, sports and more — all in one place.</p>
        </div>
        <label className={styles.globalSearch}>
          <MagnifyingGlass size={18} aria-hidden="true" />
          <span className={styles.srOnly}>Search events</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, artists, venues…" type="search" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button>}
        </label>
      </header>

      <div className={styles.categoryBar}>
        <div className={styles.categoryPills} role="group" aria-label="Filter by event type">
          {categories.map(([value, label]) => <button type="button" key={value}
            className={`${styles.categoryPill} ${activeCategory === value ? styles.categoryPillActive : ""}`}
            aria-pressed={activeCategory === value} onClick={() => setActiveCategory(value)}>{label}</button>)}
        </div>
        <label className={styles.sortControl}>Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value as SortChoice)} aria-label="Sort events">
            <option value="popular">Popular</option><option value="soonest">Soonest</option>
            <option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option>
          </select>
        </label>
      </div>

      <div className={styles.resultsLayout}>
        <aside className={styles.filters} aria-label="Event filters">
          <div className={styles.filterHeading}><h2>Filters</h2><button type="button" onClick={resetFilters}>Clear all</button></div>
          <section className={styles.filterSection}>
            <h3><CalendarBlank size={17} /> Date</h3>
            <div className={styles.dateChoices}>
              {([["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "This week"], ["month", "This month"]] as const).map(([value, label]) =>
                <button type="button" key={value} aria-pressed={dateChoice === value}
                  className={dateChoice === value ? styles.choiceActive : ""}
                  onClick={() => setDateChoice(dateChoice === value ? "any" : value)}>{label}</button>)}
            </div>
          </section>
          <section className={styles.filterSection}>
            <h3><MapPin size={17} /> Location</h3>
            <select className={styles.locationSelect} value={city} onChange={(event) => setCity(event.target.value)} aria-label="Filter by city">
              <option value="">All cities</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <label className={styles.venueSearch}><MagnifyingGlass size={16} /><span className={styles.srOnly}>Search venues</span>
              <input value={venueSearch} onChange={(event) => setVenueSearch(event.target.value)} placeholder="Search venues…" /></label>
          </section>
          <section className={styles.filterSection}>
            <h3><SlidersHorizontal size={17} /> Event type</h3>
            <div className={styles.typeChecks}>
              {categories.slice(1).map(([value, label]) => <label key={value}>
                <input type="checkbox" checked={activeCategory === value} onChange={() => setActiveCategory(activeCategory === value ? "ALL" : value)} />
                <span>{label}</span>
              </label>)}
            </div>
          </section>
          <section className={styles.filterSection}>
            <h3>₹ Price range</h3>
            <input className={styles.priceSlider} type="range" min="0" max="10000" step="100" value={maxPrice}
              onChange={(event) => setMaxPrice(Number(event.target.value))} aria-label="Maximum ticket price" />
            <div className={styles.priceBounds}><span>₹0</span><span>{maxPrice >= 10000 ? "₹10,000+" : `₹${maxPrice.toLocaleString("en-IN")}`}</span></div>
          </section>
          <button className={styles.moreFilters} type="button" aria-expanded={moreFilters} onClick={() => setMoreFilters(!moreFilters)}>
            More filters <span aria-hidden="true">{moreFilters ? "−" : "+"}</span>
          </button>
          {moreFilters && <label className={styles.availableCheck}><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Only events with tickets available</label>}
        </aside>

        <section className={styles.results} aria-live="polite">
          <div className={styles.resultsHeading}><h2>{visibleEvents.length} {visibleEvents.length === 1 ? "event" : "events"} found</h2>
            {city && <span className={styles.cityBadge}>{city}<button type="button" aria-label="Clear city filter" onClick={() => setCity("")}><X size={13} /></button></span>}
          </div>
          {visibleEvents.length ? <div className={styles.eventGrid}>
            {visibleEvents.map((event) => {
              return <article className={styles.eventCard} key={event.id}>
                <Link className={styles.eventLink} href={eventHref(event)} aria-label={`View ${event.name}`}>
                  <div className={styles.eventArt} style={event.imageUrl ? { backgroundImage: `url("${event.imageUrl}")` } : undefined}>
                    <span className={styles.eventType}>{categoryNames[event.category] ?? "Event"}</span>
                  </div>
                  <div className={styles.eventDetails}>
                    <div className={styles.titleRow}><h3>{event.name}</h3>
                      {event.lowestPrice !== null && <span className={styles.priceTag}>₹{event.lowestPrice.toLocaleString("en-IN")}</span>}
                    </div>
                    <p className={styles.eventDescription}>{event.description || `${event.organizerName ? `Join ${event.organizerName}` : "Join us"} for an unforgettable ${categoryNames[event.category]?.toLowerCase() ?? "event"} experience.`}</p>
                    <p className={styles.eventDate}><CalendarBlank size={16} />{formatEventDate(event.startsAt)}</p>
                    <p className={styles.eventVenue}><MapPin size={16} />{event.venue.name}, {event.venue.location}</p>
                    <div className={styles.cardTags}>
                      {event.isSoldOut && <span className={styles.soldOutTag}>Sold out</span>}
                    </div>
                    <div className={styles.eventFooter}>
                      <span className={styles.reserveButton}>Reserve <ArrowRight size={16} aria-hidden="true" /></span>
                    </div>
                  </div>
                </Link>
              </article>;
            })}
          </div> : <div className={styles.emptyState}><MagnifyingGlass size={25} /><h3>No events match these filters</h3>
            <p>Try another city, event type, date or price range.</p><button type="button" onClick={resetFilters}>Clear filters</button></div>}
        </section>
      </div>
    </div>
  );
}
