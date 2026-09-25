// app/api/bookings/[bookingId]/cancel/route.ts
import { auth } from "@/auth";
import { PrismaClient, Prisma } from "../../../../generated/prisma/client";
import redis from "@/lib/redis";
import prisma from "@/lib/prisma";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ bookingId: string }> }
) {
    const session = await auth();

    if (!session) {
        return new Response("Unauthorized Access", { status: 401 });
    }

    const { bookingId } = await params;

    const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
    });

    if (!booking) {
        return new Response("Not found", { status: 404 });
    }

    if (booking.userId !== session.user.id) {
        return new Response("Not allowed", { status: 403 });
    }

    if (booking.status !== "CONFIRMED") {
        return new Response("This booking cannot be cancelled", { status: 409 });
    }

    let revertedSeats: { id: string; eventId: string }[] = []

    try {
        revertedSeats = await prisma.$transaction(async (tx) => {
            const bookingSeats = await tx.bookingSeat.findMany({
                where: { bookingId },
            });

            const seatIds = bookingSeats.map((bs) => bs.seatId)

            const seats = await tx.seat.findMany({
                where: { id: { in: seatIds } },
                select: { id: true, eventId: true }
            })

            for (const seatId of seatIds) {
                await tx.seat.update({
                    where: {
                        id: seatId,
                        status: "BOOKED",
                    },
                    data: {
                        status: "AVAILABLE",
                        reservedAt: null,
                    },
                });
            }

            await tx.booking.update({
                where: {
                    id: bookingId,
                    status: "CONFIRMED",
                },
                data: {
                    status: "CANCELLED",
                },
            });

            return seats
        });
    } catch (err) {
        if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2025"
        ) {
            return new Response("Booking was already cancelled", { status: 409 });
        }

        console.error("Booking cancellation failed:", err);
        return new Response("Failed to cancel booking", { status: 500 });
    }

    try {
        await Promise.all(
            revertedSeats.map((seat) =>
                redis.publish('realtime', JSON.stringify({
                    eventId: seat.eventId,
                    seatId: seat.id,
                    status: "AVAILABLE"
                }))
            )
        )
    } catch (err) {
        console.error("Failed to publish seat updates:", err)
    }

    return new Response("Booking cancelled successfully", { status: 200 });
}