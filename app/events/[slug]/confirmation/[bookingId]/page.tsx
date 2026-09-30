import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { eventHref } from "@/lib/event-url";
import BookingConfirmation from "./BookingConfirmation";

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; bookingId: string }>;
}) {
  const { slug, bookingId } = await params;
  const separatorIndex = slug.lastIndexOf("--");
  const eventId = separatorIndex >= 0 ? slug.slice(separatorIndex + 2) : "";
  if (!eventId) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      bookingSeats: {
        include: {
          seat: {
            include: {
              category: true,
              event: { include: { venue: true } },
            },
          },
        },
      },
    },
  });

  if (
    !booking ||
    booking.userId !== session.user.id ||
    !["CONFIRMED", "CANCELLED"].includes(booking.status) ||
    booking.bookingSeats.length === 0 ||
    booking.bookingSeats.some(({ seat }) => seat.eventId !== eventId)
  ) {
    notFound();
  }

  const event = booking.bookingSeats[0].seat.event;
  const total = booking.payment?.amount.toString() ?? booking.bookingSeats
    .reduce((sum, { seat }) => sum + Number(seat.category.price), 0)
    .toString();

  return (
    <BookingConfirmation
      bookingId={booking.id}
      eventImageUrl={event.imageUrl}
      eventName={event.name}
      eventPath={eventHref(event)}
      eventTime={event.startsAt.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
      initialStatus={booking.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}
      location={`${event.venue.name}, ${event.venue.location}`}
      seats={booking.bookingSeats.map(({ seat }) => ({
        id: seat.id,
        seatLabel: seat.seatLabel,
        categoryName: seat.category.name,
        price: seat.category.price.toString(),
      }))}
      total={total}
    />
  );
}