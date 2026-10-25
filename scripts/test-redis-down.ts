import "./guard-local"
import prisma from "@/lib/prisma"
import redis from "@/lib/redis"
import { randomUUID } from "node:crypto"
import { execSync } from "node:child_process"

// Stops the Redis container while the app is running, then checks that holds
// still work through the database alone and that nobody can double-book.
// Run from the project root with the Docker stack up (docker compose).

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const RUN = randomUUID().slice(0, 8) // tags every test row so cleanup finds only ours
const FIGHTERS = 10
let failures = 0

const holdsPath = (eventId: string) => `/api/events/${eventId}/holds`

function check(label: string, ok: boolean, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + detail}`)
    if (!ok) failures++
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function compose(args: string) {
    execSync(`docker compose ${args}`, { stdio: "inherit" })
}

// Polls until Redis answers a PING, up to 30 seconds.
async function waitForRedis(): Promise<boolean> {
    for (let i = 0; i < 60; i++) {
        try {
            if ((await redis.ping()) === "PONG") return true
        } catch {
            // still down, keep trying
        }
        await sleep(500)
    }
    return false
}

function hold(token: string, eventId: string, seatIds: string[]) {
    return fetch(BASE + holdsPath(eventId), {
        method: "POST",
        headers: {
            "content-type": "application/json",
            cookie: `authjs.session-token=${token}`,
        },
        body: JSON.stringify({ seatIds }),
    })
}

const getSeat = (id: string) => prisma.seat.findUniqueOrThrow({ where: { id } })

async function cleanup() {
    const users = await prisma.user.findMany({
        where: { email: { startsWith: RUN } },
        select: { id: true },
    })
    const userIds = users.map((u) => u.id)
    const events = await prisma.event.findMany({
        where: { name: { contains: RUN } },
        select: { id: true },
    })
    const eventIds = events.map((e) => e.id)
    const seats = await prisma.seat.findMany({
        where: { eventId: { in: eventIds } },
        select: { id: true },
    })
    const seatIds = seats.map((s) => s.id)

    if (seatIds.length > 0) {
        await redis.del(...seatIds.map((id) => `seat:lock:${id}`))
    }
    await prisma.seat.deleteMany({ where: { eventId: { in: eventIds } } })
    await prisma.ticketCategory.deleteMany({ where: { eventId: { in: eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } })
    await prisma.venue.deleteMany({ where: { name: { contains: RUN } } })
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

async function main() {
    // ---------- Seed: several fake users with sessions, one event, three seats ----------
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const users: { id: string; token: string }[] = []

    for (let i = 0; i < FIGHTERS; i++) {
        const user = await prisma.user.create({
            data: {
                name: `TEST ${i}`,
                email: `${RUN}-${i}@test.local`,
                role: i === 0 ? "ORGANIZER" : "USER",
            },
        })
        const token = randomUUID()
        await prisma.session.create({
            data: { sessionToken: token, userId: user.id, expires: tomorrow },
        })
        users.push({ id: user.id, token })
    }

    const venue = await prisma.venue.create({
        data: { name: `TEST_RD venue ${RUN}`, location: "Test" },
    })
    const event = await prisma.event.create({
        data: {
            name: `TEST_RD event ${RUN}`,
            startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            venueId: venue.id,
            organizerId: users[0].id,
        },
    })
    const category = await prisma.ticketCategory.create({
        data: { name: "Test", price: 100, eventId: event.id },
    })
    const makeSeat = (seatLabel: string) =>
        prisma.seat.create({ data: { eventId: event.id, seatLabel, categoryId: category.id } })

    const seatSingle = await makeSeat("R1") // scenario 1: one hold during the outage
    const seatFight = await makeSeat("R2") // scenario 2: the fight during the outage
    const seatAfter = await makeSeat("R3") // scenario 3: after Redis comes back

    // ---------- Stop Redis ----------
    console.log("\nStopping Redis...")
    compose("stop redis")

    // ---------- Scenario 1: a hold still works with Redis down ----------
    console.log("\nScenario 1: Redis is down -> a hold still succeeds through the database alone")

    const started = Date.now()
    const r1 = await hold(users[0].token, event.id, [seatSingle.id])
    const took = Date.now() - started
    check("hold succeeds while Redis is down (expect 200)", r1.status === 200, `got ${r1.status}`)
    check("the request did not hang (under 5 s)", took < 5000, `took ${took} ms`)

    const s1 = await getSeat(seatSingle.id)
    check(
        "seat R1 is HELD by user 0 in the database",
        s1.status === "HELD" && s1.heldByUserId === users[0].id,
        `status=${s1.status} heldBy=${s1.heldByUserId}`
    )

    // ---------- Scenario 2: nobody can take a held seat ----------
    console.log("\nScenario 2: Redis is down -> a second user cannot take the same seat")

    const r2 = await hold(users[1].token, event.id, [seatSingle.id])
    check("second user's hold is rejected (expect 409)", r2.status === 409, `got ${r2.status}`)

    const s2 = await getSeat(seatSingle.id)
    check(
        "seat R1 is still HELD by user 0",
        s2.status === "HELD" && s2.heldByUserId === users[0].id,
        `status=${s2.status} heldBy=${s2.heldByUserId}`
    )

    // ---------- Scenario 3: the fight with Redis down ----------
    console.log(`\nScenario 3: Redis is down -> ${FIGHTERS} users fight for one seat at the same time`)

    const results = await Promise.all(
        users.map((u) => hold(u.token, event.id, [seatFight.id]))
    )
    const statuses = results.map((r) => r.status)
    const winners = statuses.filter((s) => s === 200).length
    const conflicts = statuses.filter((s) => s === 409).length
    const others = statuses.length - winners - conflicts

    check("exactly one winner (200)", winners === 1, `winners=${winners} statuses=${statuses.join(",")}`)
    check(`everyone else got 409`, conflicts === FIGHTERS - 1, `conflicts=${conflicts}`)
    check("no other responses (no 500s, no 503s)", others === 0, `others=${others}`)

    const sf = await getSeat(seatFight.id)
    const winnerIndex = statuses.indexOf(200)
    check(
        "the database holder is the user who won",
        winnerIndex >= 0 && sf.status === "HELD" && sf.heldByUserId === users[winnerIndex].id,
        `status=${sf.status} heldBy=${sf.heldByUserId} winnerIndex=${winnerIndex}`
    )

    // ---------- Bring Redis back ----------
    console.log("\nStarting Redis again...")
    compose("start redis")
    const back = await waitForRedis()
    check("Redis came back", back)

    // Give each app copy a moment to reconnect on its own.
    await sleep(3000)

    // ---------- Scenario 4: recovery with no app restart ----------
    console.log("\nScenario 4: Redis is back -> locks work again without restarting the app")

    const r4 = await hold(users[0].token, event.id, [seatAfter.id])
    check("hold succeeds after recovery (expect 200)", r4.status === 200, `got ${r4.status}`)

    const lock = await redis.get(`seat:lock:${seatAfter.id}`)
    check(
        "the Redis lock is created again",
        lock === users[0].id,
        `lock=${lock}`
    )

    console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) FAILED`)
    process.exitCode = failures === 0 ? 0 : 1
}

main()
    .catch((err) => {
        console.error("Script crashed:", err)
        process.exitCode = 1
    })
    .finally(async () => {
        // Always leave Redis running, even if the script crashed halfway.
        try {
            compose("start redis")
            await waitForRedis()
        } catch (err) {
            console.error("Could not restart Redis, run: docker compose start redis", err)
        }
        await cleanup()
        await prisma.$disconnect()
        redis.disconnect()
    })