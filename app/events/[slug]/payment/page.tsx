import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { auth } from "@/auth";
import { eventHref } from "@/lib/event-url";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import PaymentCheckout from "./PaymentCheckout";
import styles from "./PaymentCheckout.module.css";

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ seatIds?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const separatorIndex = slug.lastIndexOf("--");
  const eventId = separatorIndex >= 0 ? slug.slice(separatorIndex + 2) : "";

  if (!eventId) notFound();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { venue: true },
  });

  if (!event) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const seatIdsValue = Array.isArray(query.seatIds) ? query.seatIds[0] : query.seatIds;
  const requestedSeatIds = seatIdsValue?.split(",").filter(Boolean) ?? [];
  const seatIds = Array.from(new Set(requestedSeatIds));
  const seatsPath = `${eventHref(event)}/seats`;

  if (
    !seatIds.length ||
    seatIds.length !== requestedSeatIds.length ||
    seatIds.some((seatId) => !/^[a-zA-Z0-9_-]+$/.test(seatId))
  ) {
    redirect(seatsPath);
  }

  const seats = await prisma.seat.findMany({
    where: { id: { in: seatIds }, eventId, status: "HELD" },
    include: { category: true },
    orderBy: { seatLabel: "asc" },
  });
  const lockOwners = await Promise.all(
    seats.map((seat) => redis.get(`seat:lock:${seat.id}`)),
  );

  if (
    seats.length !== seatIds.length ||
    lockOwners.some((owner) => owner !== session.user.id)
  ) {
    redirect(seatsPath);
  }

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href={eventHref(event)}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to event
      </Link>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{event.venue.name} · {event.venue.location}</p>
        <h1>Demo checkout</h1>
        <p>{event.name}</p>
      </header>
      <PaymentCheckout
        eventPath={eventHref(event)}
        seats={seats.map((seat) => ({
          id: seat.id,
          seatLabel: seat.seatLabel,
          categoryName: seat.category.name,
          price: seat.category.price.toString(),
        }))}
      />
    </main>
  );
}