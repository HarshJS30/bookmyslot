
import redis from "@/lib/redis"

export const dynamic = "force-dynamic"

export async function GET() {
    try {
        const [won, rejectedRedis, rejectedDb, rateLimited] =
            await redis.mget(
                "stats:hold:won",
                "stats:hold:rejected-redis",
                "stats:hold:rejected-db",
                "stats:hold:rate-limited"
            )

        const stats = {
            won: Number(won ?? 0),
            rejectedRedis: Number(rejectedRedis ?? 0),
            rejectedDb: Number(rejectedDb ?? 0),
            rateLimited: Number(rateLimited ?? 0),
        }

        return Response.json(stats)
    } catch (err) {
        console.error("Failed to fetch stats:", err)

        return Response.json(
            { error: "Failed to fetch stats" },
            { status: 503 }
        )
    }
}
