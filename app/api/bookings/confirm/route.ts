import { auth } from '@/auth'
import { PrismaClient, Prisma } from '../../../generated/prisma/client'
import redis from '@/lib/redis'

const prisma = new PrismaClient()

export async function POST(request: Request) {
    const session = await auth()

    if (!session) {
        return new Response("Unauthorized Access", { status: 401 })
    }

    const body = await request.json()

    if (!Array.isArray(body.seatIds) || body.seatIds.length === 0) {
        return new Response("Missing Fields", { status: 400 })
    }

    // Verify that the current user owns the locks
    for (const seatId of body.seatIds) {
        const lockOwner = await redis.get(`seat:lock:${seatId}`)

        if (lockOwner !== session.user.id) {
            return new Response(
                "One or more selected seats are held by another user",
                { status: 409 }
            )
        }
    }

    try {
        const result = await prisma.$transaction(async (tx) => {

            // 1. Create booking
            const booking = await tx.booking.create({
                data: {
                    status: "PENDING",
                    userId: session.user.id,
                }
            })

            // 2. Create booking-seat records
            const bookingSeats = await tx.bookingSeat.createMany({
                data: body.seatIds.map((seatId: string) => ({
                    seatId,
                    bookingId: booking.id,
                }))
            })

            // 3. Fetch seats with pricing, inside the same transaction
            const seatsWithPricing = await tx.seat.findMany({
                where: { id: { in: body.seatIds } },
                include: { category: true }
            })

            // Prisma returns Decimal fields as Prisma.Decimal objects, not plain numbers —
            // summing with + would either fail or silently coerce incorrectly, so use
            // Decimal-aware arithmetic and convert to a number only at the end.
            const totalAmount = seatsWithPricing
                .reduce((sum, seat) => sum.plus(seat.category.price), new Prisma.Decimal(0))
                .toNumber()

            // 4. Convert HELD → BOOKED
            try {
                for (const seatId of body.seatIds) {
                    await tx.seat.update({
                        where: {
                            id: seatId,
                            status: "HELD"
                        },
                        data: {
                            status: "BOOKED"
                        }
                    })
                }
            } catch (err) {
                if (
                    err instanceof Prisma.PrismaClientKnownRequestError &&
                    err.code === "P2025"
                ) {
                    throw new Error(
                        "One or more seats are no longer available"
                    )
                }

                throw err
            }

            // 5. Confirm booking
            const confirmedBooking = await tx.booking.update({
                where: {
                    id: booking.id,
                    status: "PENDING"
                },
                data: {
                    status: "CONFIRMED"
                }
            })

            // 6. Create payment with real calculated amount
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
                payment
            }
        })

        await Promise.all(body.seatIds.map((seatId: string) => redis.del(`seat:lock:${seatId}`)))

        return Response.json(result)

    } catch (err) {
        if (
            err instanceof Error &&
            err.message === "One or more seats are no longer available"
        ) {
            return new Response(err.message, { status: 409 })
        }

        return new Response("Internal Server Error", { status: 500 })
    }
}