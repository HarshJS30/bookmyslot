// app/api/events/[eventId]/seats/[seatId]/reserve/route.ts
import { auth } from "@/auth"
import { PrismaClient } from "../../../../../../generated/prisma/client";
import redis from "@/lib/redis";

const prisma = new PrismaClient()

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
        updated = await prisma.seat.update({
            where: { id: seatId, status: "AVAILABLE" },
            data: { status: "HELD", reservedAt: new Date() }
        })
    } catch (err) {
        await redis.del(lockKey)
        return new Response("Seat is no longer available", { status: 409 })
    }

    try {
        await redis.publish('realtime', JSON.stringify({ eventId, seatId, status: "HELD" }))
    } catch (err) {
        console.error("Failed to publish seat update:", err)
        // don't fail the request — the reservation itself succeeded
    }

    return Response.json(updated)
}