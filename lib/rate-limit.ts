import redis from "./redis"

const RATE_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`

export async function isRateLimited(userId: string): Promise<boolean> {
    try {
        const key = `ratelimit:hold:${userId}`
        const result = await redis.eval(RATE_SCRIPT, 1, key, 60)

        return Number(result) > 30
    } catch (error) {
        console.error("Rate limiter failed:", error)
        return false
    }
}