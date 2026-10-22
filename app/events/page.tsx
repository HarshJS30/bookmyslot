import prisma from "@/lib/prisma";
import styles from "./Events.module.css";
import EventBrowser, { type BrowserEvent } from "./EventBrowser";
import PageHeader from "../components/PageHeader";
export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string | string[] }>;
}) {
  const params = await searchParams;
  const selectedCity = Array.isArray(params.city) ? params.city[0] : params.city;
  const events = await prisma.event.findMany({
    include: {
      venue: true,
      organizer: { select: { name: true } },
      ticketCategories: { select: { price: true } },
      seats: { select: { status: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  const browserEvents: BrowserEvent[] = events.map((event) => ({
    id: event.id,
    name: event.name,
    imageUrl: event.imageUrl,
    description: event.description,
    startsAt: event.startsAt.toISOString(),
    category: event.category,
    organizerName: event.organizer.name,
    isSoldOut: event.seats.length > 0 && event.seats.every((seat) => seat.status === "BOOKED"),
    popularityCount: event.seats.filter((seat) => seat.status === "BOOKED").length,
    lowestPrice: event.ticketCategories.length
      ? Math.min(...event.ticketCategories.map((category) => Number(category.price)))
      : null,
    venue: {
      name: event.venue.name,
      location: event.venue.location,
    },
  }));

  return (
    <>
    <PageHeader />
    <main className={styles.page}>
      <EventBrowser events={browserEvents} initialCity={selectedCity ?? ""} />
    </main>
    </>
  );
}
