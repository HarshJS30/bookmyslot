import Redis from "ioredis"

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379")

redis.on("error", (error) => {
    console.error("REDIS ERROR:", error.message)
})

redis.on("close", () => {
    console.log("REDIS CONNECTION CLOSED")
})

export default redis