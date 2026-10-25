import { auth } from '@/auth'
import { Prisma } from '../../../generated/prisma/client'
import redis from '@/lib/redis'
import prisma from '@/lib/prisma'
import { seatIdsSchema } from '@/lib/validation'
import { SeatsUnavailableError } from '@/lib/errors'
import { releaseLock } from '@/lib/redis-locks'

// If this user already used this idempotency key, answer from the saved booking.
//   same key, same seats      -> a safe retry, return the booking (200)
//   same key, different seats -> the client reused a key by mistake (422)
//   key never used            -> null, the caller carries on
async function findReplay(userId: string, key: string, seatIds: string[]) {
    const existing = await prisma.booking.findUnique({
        where: {
            userId_key: {
                userId,
                key
            }
        }
    })

    if (!existing) {
        return null
    }

    const bookedSeats = await prisma.bookingSeat.findMany({
        where: { bookingId: existing.id },
        select: { seatId: true }
    })

    const requested = new Set(seatIds)
    const sameSeats =
        bookedSeats.length === requested.size &&
        bookedSeats.every((seat) => requested.has(seat.seatId))

    if (!sameSeats) {
        return new Response(
            "Idempotency key was already used for different seats",
            { status: 422 }
        )
    }

    return Response.json({ booking: existing }, { status: 200 })
}

export async function POST(request: Request) {
    const session = await auth()

    if (!session) {
        return new Response("Unauthorized Access", { status: 401 })
    }

    const key = request.headers.get("idempotency-key")

    if (!key) {
        return new Response("Missing Idempotency Key", { status: 400 })
    }

    let body: unknown

    try {
        body = await request.json()
    } catch {
        return new Response("Invalid JSON", { status: 400 })
    }

    const parsed = seatIdsSchema.safeParse(body)

    if (!parsed.success) {
        return new Response("Invalid seat IDs", { status: 400 })
    }

    const seatIds = [...new Set(parsed.data.seatIds)]
    const userId = session.user.id

    // A retry of a request that already finished gets the saved booking back.
    // This runs before the event-start check on purpose: a replay must still work.
    const replay = await findReplay(userId, key, seatIds)

    if (replay) {
        return replay
    }

    const startedSeat = await prisma.seat.findFirst({
        where: {
            id: { in: seatIds },
            event: { startsAt: { lte: new Date() } },
        },
        select: { id: true },
    })

    if (startedSeat) {
        return new Response("This event has already started", { status: 400 })
    }

    try {
        const result = await prisma.$transaction(
            async (tx) => {
                const updated = await tx.seat.updateMany({
                    where: {
                        id: { in: seatIds },
                        status: "HELD",
                        heldByUserId: userId,
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
                    throw new SeatsUnavailableError()
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
                        userId,
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
            },
            {
                maxWait: 10_000,
                timeout: 10_000,
            }
        )

        // The booking is committed. Nothing in Redis below may change the response.
        try {
            await Promise.all(
                seatIds.map((seatId) =>
                    releaseLock(seatId,userId)
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
        const isSeatConflict = err instanceof SeatsUnavailableError
        const isDuplicateKey =
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"

        if (isSeatConflict || isDuplicateKey) {
            // A request with the same key may have won the race a moment ago.
            // If a booking exists for this key, answer from it.
            try {
                const raced = await findReplay(userId, key, seatIds)

                if (raced) {
                    return raced
                }
            } catch (lookupError) {
                console.error("Replay lookup failed:", lookupError)
            }

            if (isSeatConflict) {
                return new Response(
                    "One or more seats are no longer available",
                    { status: 409 }
                )
            }
        }

        if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2028"
        ) {
            console.error("Booking transaction timed out:", err)

            return new Response("Server Busy. Please retry.", {
                status: 503,
                headers: {
                    "Retry-After": "1",
                },
            })
        }

        console.error("Error confirming booking:", err)

        return new Response(
            "Internal Server Error",
            { status: 500 }
        )
    }
}