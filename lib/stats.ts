import redis from "./redis"

export async function bump(name: string){
    try{
        const key = `stats:hold:${name}`
        await redis.incr(key)
    }catch(err){
        console.error(err)
    }
}