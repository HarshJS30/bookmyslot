import redis from "@/lib/redis"
import prisma from "@/lib/prisma"

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
        return new Response("Unauthorized", { status: 401 })
    }

    const now = new Date()

    const expired = await prisma.$queryRaw<{ id: string; eventId: string }[]>`
        UPDATE "Seat"
        SET
            status = 'AVAILABLE',
            "heldByUserId" = NULL,
            "holdExpiresAt" = NULL,
            "reservedAt" = NULL
        WHERE status = 'HELD'
          AND "holdExpiresAt" < ${now}
        RETURNING id, "eventId"
    `

    try {
        await Promise.all(
            expired.map((seat) =>
                redis.publish(
                    "realtime",
                    JSON.stringify({
                        eventId: seat.eventId,
                        seatId: seat.id,
                        status: "AVAILABLE",
                    })
                )
            )
        )
    } catch (err) {
        console.error("Failed to publish expiry updates:", err)
    }

    return Response.json({ swept: expired.length })
}