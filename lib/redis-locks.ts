import redis from "@/lib/redis";

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export async function releaseLock(
    seatId: string,
    userId: string
): Promise<boolean> {
    const key = `seat:lock:${seatId}`;
    const result = await redis.eval(RELEASE_SCRIPT, 1, key, userId);
    return result === 1;
}