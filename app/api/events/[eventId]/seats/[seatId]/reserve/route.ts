import { auth } from "@/auth"
import redis from "@/lib/redis";
import prisma from "@/lib/prisma";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ eventId: string, seatId: string }> }
) {
    const { eventId, seatId } = await params
    const session = await auth()

    if (!session) {
        return new Response("Unauthorized", { status: 401 })
    }

    const lockKey = `seat:lock:${seatId}`
    const lockResult = await redis.set(lockKey, session.user.id, "EX", 300, "NX")

    if (lockResult === null) {
        return new Response("Seat is currently being reserved by another user. Please try again later.", { status: 409 })
    }

    let updated
    try {
        updated = await prisma.seat.updateMany({
            where: { id: seatId, eventId: eventId,
                OR:[
                    {status: "AVAILABLE"},
                    {status: "HELD", holdExpiresAt: { lt: new Date() }}
                ]
            },
            data: { status: "HELD", reservedAt: new Date(), heldByUserId: session.user.id, holdExpiresAt: new Date(Date.now() + 5 * 60 * 1000) }
        })
        if (updated.count === 0) {
            await redis.del(lockKey)
            return new Response("Seat is no longer available", { status: 409 })
        }
    } catch {
        await redis.del(lockKey)
        return new Response("Seat is no longer available", { status: 409 })
    }

    try {
        await redis.publish('realtime', JSON.stringify({ eventId, seatId, status: "HELD" }))
    } catch (err) {
        console.error("Failed to publish seat update:", err)
    }

    return Response.json(updated)
}