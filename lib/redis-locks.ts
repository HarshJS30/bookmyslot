import redis from "@/lib/redis";

const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

const ACQUIRE_SCRIPT = `
if redis.call("SET", KEYS[1], ARGV[1], "NX", "EX", ARGV[2]) then
  return 1
end
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
  return 1
end
return 0
`;

export async function releaseLock(
    seatId: string,
    userId: string
): Promise<boolean> {
    const key = `seat:lock:${seatId}`;
    const result = await redis.eval(RELEASE_SCRIPT, 1, key, userId);
    return result === 1;
}

export async function acquireLock(
    seatId: string,
    userId: string
): Promise<boolean> {
    const key = `seat:lock:${seatId}`;
    const result = await redis.eval(ACQUIRE_SCRIPT, 1,key, userId, 300);
    return result===1
}