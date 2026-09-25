import { PrismaClient } from "../../../generated/prisma/client";
import redis from "@/lib/redis";

const prisma = new PrismaClient()

export async function GET(request: Request) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000)

    const staleSeats = await prisma.seat.findMany({
        where: {
            status: "HELD",
            reservedAt: { lt: fiveMinAgo }
        },
        select: { id: true, eventId: true }
    })

    if (staleSeats.length === 0) {
        return Response.json({ swept: 0 })
    }

    await prisma.seat.updateMany({
        where: {
            id: { in: staleSeats.map((s) => s.id) }
        },
        data: {
            status: "AVAILABLE",
            reservedAt: null
        }
    })

    try {
        await Promise.all(
            staleSeats.map((seat) =>
                redis.publish('realtime', JSON.stringify({
                    eventId: seat.eventId,
                    seatId: seat.id,
                    status: "AVAILABLE"
                }))
            )
        )
    } catch (err) {
        console.error("Failed to publish expiry updates:", err)
    }

    return Response.json({ swept: staleSeats.length })
}