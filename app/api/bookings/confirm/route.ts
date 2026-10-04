import { auth } from '@/auth'
import { Prisma } from '../../../generated/prisma/client'
import redis from '@/lib/redis'
import prisma from '@/lib/prisma'
import { seatIdsSchema } from '@/lib/validation'

export async function POST(request: Request) {
    const session = await auth()

    if (!session) {
        return new Response("Unauthorized Access", { status: 401 })
    }

    const key = request.headers.get("idempotency-key")

    if (!key) {
        return new Response("Missing Idempotency Key", { status: 400 })
    }

    const existingBooking = await prisma.booking.findUnique({
        where: {
            userId_key: {
                userId: session.user.id,
                key
            }
        }
    })

    if (existingBooking) {
        return new Response(JSON.stringify({
            booking: existingBooking
        }), { status: 200 })
    }

    let body: unknown;
        
        try{
            body = await request.json();
        }catch(err){
            return new Response("Invalid JSON", { status: 400 });
        }
    
        const result = seatIdsSchema.safeParse(body);
    
        if(!result.success) {
            return new Response("Invalid seat IDs", { status: 400 });
        }
    
        const { seatIds: validatedSeatIds } = result.data;
        const seatIds = [...new Set(validatedSeatIds)];

        const startedSeat = await prisma.seat.findFirst({
            where: {
                id: { in: seatIds },
                event: { startsAt: { lte: new Date() } },
            },
            select: { id: true },
        });

        if (startedSeat) {
            return new Response("This event has already started", { status: 400 });
        }

    
    try {
        const result = await prisma.$transaction(async (tx) => {

            const updated = await tx.seat.updateMany({
                where: {
                    id: { in: seatIds },
                    status: "HELD",
                    heldByUserId: session.user.id,
                    holdExpiresAt: {
                        gt: new Date()
                    }
                },
                data: {
                    status: "BOOKED",
                    heldByUserId: null,
                    holdExpiresAt: null
                }
            })

            if (updated.count !== seatIds.length) {
                throw new Error(
                    "One or more seats are no longer available"
                )
            }

            const seatsWithPricing = await tx.seat.findMany({
                where: {
                    id: { in: seatIds }
                },
                include: {
                    category: true
                }
            })

            const totalAmount = seatsWithPricing
                .reduce(
                    (sum, seat) =>
                        sum.plus(seat.category.price),
                    new Prisma.Decimal(0)
                )
                .toNumber()

            const booking = await tx.booking.create({
                data: {
                    status: "PENDING",
                    userId: session.user.id,
                    key,
                }
            })

            const bookingSeats = await tx.bookingSeat.createMany({
                data: seatIds.map((seatId) => ({
                    seatId,
                    bookingId: booking.id,
                }))
            })

            const confirmedBooking = await tx.booking.update({
                where: {
                    id: booking.id,
                    status: "PENDING"
                },
                data: {
                    status: "CONFIRMED"
                }
            })

            const payment = await tx.payment.create({
                data: {
                    amount: totalAmount,
                    status: "SUCCESS",
                    bookingId: booking.id,
                }
            })

            return {
                booking: confirmedBooking,
                bookingSeats,
                payment,
                seatsWithPricing
            }
        })

        // The booking is committed. Nothing in Redis below may change the response.
        try {
            await Promise.all(
                seatIds.map((seatId) =>
                    redis.del(`seat:lock:${seatId}`)
                )
            )
        } catch (err) {
            console.error("Failed to release seat locks:", err)
        }

        try {
            await Promise.all(
                result.seatsWithPricing.map((seat) =>
                    redis.publish(
                        'realtime',
                        JSON.stringify({
                            eventId: seat.eventId,
                            seatId: seat.id,
                            status: "BOOKED"
                        })
                    )
                )
            )
        } catch (err) {
            console.error("Failed to publish seat updates:", err)
        }

        return Response.json(result)

    } catch (err) {
        if (
            err instanceof Error &&
            err.message === "One or more seats are no longer available"
        ) {
            const existingBooking = await prisma.booking.findUnique({
                where: {
                    userId_key: {
                        userId: session.user.id,
                        key
                    }
                }
            })

            if (existingBooking) {
                return Response.json(
                    { booking: existingBooking },
                    { status: 200 }
                )
            }

            return new Response(
                "One or more seats are no longer available",
                { status: 409 }
            )
        }
        console.error("Error confirming booking:", err)
        return new Response(
            "Internal Server Error",
            { status: 500 }
        )
    }
}