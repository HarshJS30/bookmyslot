import { auth } from "@/auth"
import { PrismaClient } from "../../../../../../generated/prisma/client";
import { corsOptions, withCors } from "@/lib/cors";
import redis from "@/lib/redis";
import prisma from "@/lib/prisma";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ eventId: string, seatId: string }> }
) {
    const { eventId, seatId } = await params
    const session = await auth()

    if (!session) {
        return withCors(request, new Response("Unauthorized", { status: 401 }))
    }

    const lockKey = `seat:lock:${seatId}`
    const lockResult = await redis.set(lockKey, session.user.id, "EX", 300, "NX")

    if (lockResult === null) {
        return withCors(
            request,
            new Response("Seat is currently being reserved by another user. Please try again later.", { status: 409 }),
        )
    }

    let updated
    try {
        updated = await prisma.seat.update({
            where: { id: seatId, status: "AVAILABLE" },
            data: { status: "HELD", reservedAt: new Date() }
        })
    } catch (err) {
        await redis.del(lockKey)
        return withCors(request, new Response("Seat is no longer available", { status: 409 }))
    }

    try {
        await redis.publish('realtime', JSON.stringify({ eventId, seatId, status: "HELD" }))
    } catch (err) {
        console.error("Failed to publish seat update:", err)
    }

    return withCors(request, Response.json(updated))
}

export async function OPTIONS(request: Request) {
    return corsOptions(request)
}