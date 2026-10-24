import prisma from "@/lib/prisma"
import redis from "@/lib/redis"
import { randomUUID } from "node:crypto"
import "./guard-local";

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const RUN = randomUUID().slice(0, 8) // tags every test row so cleanup finds only ours
let failures = 0

// POST = hold seats, DELETE = release seats. Body: { seatIds: string[] }
const holdsPath = (eventId: string) => `/api/events/${eventId}/holds`

function check(label: string, ok: boolean, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + detail}`)
    if (!ok) failures++
}

// Calls one of your routes as a user, by sending that user's session cookie.
// "authjs.session-token" is the cookie name on plain http (localhost).
function call(
    method: "POST" | "DELETE",
    token: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {}
) {
    return fetch(BASE + path, {
        method,
        headers: {
            "content-type": "application/json",
            cookie: `authjs.session-token=${token}`,
            ...extraHeaders,
        },
        body: body ? JSON.stringify(body) : undefined,
    })
}

const hold = (token: string, eventId: string, seatIds: string[]) =>
    call("POST", token, holdsPath(eventId), { seatIds })

const release = (token: string, eventId: string, seatIds: string[]) =>
    call("DELETE", token, holdsPath(eventId), { seatIds })

const getSeat = (id: string) => prisma.seat.findUniqueOrThrow({ where: { id } })
const lockOf = (seatId: string) => redis.get(`seat:lock:${seatId}`)

// Asserts every seat is untouched: AVAILABLE in the DB, nobody holding it, no Redis lock.
async function checkNotHeld(label: string, seatIds: string[]) {
    const rows = await prisma.seat.findMany({ where: { id: { in: seatIds } } })
    const dbClean = rows.every(
        (s) => s.status === "AVAILABLE" && s.heldByUserId === null && s.holdExpiresAt === null
    )
    check(
        `${label}: DB rows are AVAILABLE with no holder`,
        dbClean && rows.length === seatIds.length,
        JSON.stringify(rows.map((s) => ({ id: s.id, status: s.status, by: s.heldByUserId })))
    )
    const locks = await Promise.all(seatIds.map(lockOf))
    check(
        `${label}: no Redis locks left behind`,
        locks.every((l) => l === null),
        JSON.stringify(locks)
    )
}

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
    await prisma.payment.deleteMany({ where: { booking: { userId: { in: userIds } } } })
    await prisma.bookingSeat.deleteMany({
        where: { OR: [{ booking: { userId: { in: userIds } } }, { seatId: { in: seatIds } }] },
    })
    await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.seat.deleteMany({ where: { eventId: { in: eventIds } } })
    await prisma.ticketCategory.deleteMany({ where: { eventId: { in: eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } })
    await prisma.venue.deleteMany({ where: { name: { contains: RUN } } })
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

async function main() {
    // ---------- Seed: two fake users with sessions, one event, several seats ----------
    const userA = await prisma.user.create({
        data: { name: "TEST A", email: `${RUN}-a@test.local`, role: "ORGANIZER" },
    })
    const userB = await prisma.user.create({
        data: { name: "TEST B", email: `${RUN}-b@test.local` },
    })
    const tokenA = randomUUID()
    const tokenB = randomUUID()
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await prisma.session.create({ data: { sessionToken: tokenA, userId: userA.id, expires: tomorrow } })
    await prisma.session.create({ data: { sessionToken: tokenB, userId: userB.id, expires: tomorrow } })

    const venue = await prisma.venue.create({
        data: { name: `TEST_P0 venue ${RUN}`, location: "Test" },
    })
    const event = await prisma.event.create({
        data: {
            name: `TEST_P0 event ${RUN}`,
            startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            venueId: venue.id,
            organizerId: userA.id,
        },
    })
    const category = await prisma.ticketCategory.create({
        data: { name: "Test", price: 100, eventId: event.id },
    })
    const makeSeat = (seatLabel: string) =>
        prisma.seat.create({ data: { eventId: event.id, seatLabel, categoryId: category.id } })

    const seat1 = await makeSeat("T1") // scenario 1
    const seat2 = await makeSeat("T2") // scenario 2
    const [a1, a2, a3] = [await makeSeat("T3"), await makeSeat("T4"), await makeSeat("T5")] // scenario 3: A's targets
    const seatX = await makeSeat("T6") // scenario 3a: held by B through the API
    const seatY = await makeSeat("T7") // scenario 3b: held by B in the DB only
    const seatR1 = await makeSeat("T8") // scenario 4: A's seat
    const seatR2 = await makeSeat("T9") // scenario 4: B's seat
    const seatE = await makeSeat("T10") // scenario 5: expired hold

    // ---------- Scenario 1: ownership ----------
    console.log("\nScenario 1: B cannot confirm a seat A holds, even if Redis wrongly says B owns it")

    const r1 = await hold(tokenA, event.id, [seat1.id])
    check("A holds seat T1 (expect 200)", r1.status === 200, `got ${r1.status}`)

    // Simulate Redis being wrong: make the lock say B owns the seat.
    await redis.set(`seat:lock:${seat1.id}`, userB.id, "EX", 300)

    const c1 = await call(
        "POST",
        tokenB,
        "/api/bookings/confirm",
        { seatIds: [seat1.id] },
        { "idempotency-key": randomUUID() }
    )
    check("B's confirm is rejected (expect 409)", c1.status === 409, `got ${c1.status}`)

    const s1 = await getSeat(seat1.id)
    check(
        "seat T1 is still HELD by A",
        s1.status === "HELD" && s1.heldByUserId === userA.id,
        `status=${s1.status} heldBy=${s1.heldByUserId}`
    )
    const bBookings = await prisma.booking.count({ where: { userId: userB.id } })
    check("B has no booking rows", bBookings === 0, `found ${bBookings}`)

    // ---------- Scenario 2: expiry without the cron ----------
    console.log("\nScenario 2: an expired hold can be taken by someone else, no cron involved")

    const r2 = await hold(tokenA, event.id, [seat2.id])
    check("A holds seat T2 (expect 200)", r2.status === 200, `got ${r2.status}`)

    // Force the hold to be expired: write a past time, and remove the Redis lock
    // (which is what Redis does by itself when its 5 minutes run out).
    await prisma.seat.update({
        where: { id: seat2.id },
        data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    })
    await redis.del(`seat:lock:${seat2.id}`)

    const r3 = await hold(tokenB, event.id, [seat2.id])
    check("B holds the expired seat (expect 200)", r3.status === 200, `got ${r3.status}`)

    const s2 = await getSeat(seat2.id)
    check(
        "seat T2 is now HELD by B with a fresh expiry",
        s2.status === "HELD" &&
            s2.heldByUserId === userB.id &&
            s2.holdExpiresAt !== null &&
            s2.holdExpiresAt > new Date(),
        `status=${s2.status} heldBy=${s2.heldByUserId} expires=${s2.holdExpiresAt}`
    )

    // ---------- Scenario 3a: all-or-nothing, Redis catches the conflict ----------
    console.log("\nScenario 3a: one of four seats is already held by B -> A ends up holding none")

    const x1 = await hold(tokenB, event.id, [seatX.id])
    check("B holds seat T6 (expect 200)", x1.status === 200, `got ${x1.status}`)

    const x2 = await hold(tokenA, event.id, [a1.id, a2.id, a3.id, seatX.id])
    check("A's four-seat request is rejected (expect 409)", x2.status === 409, `got ${x2.status}`)

    await checkNotHeld("A's three free seats", [a1.id, a2.id, a3.id])

    const sx = await getSeat(seatX.id)
    check(
        "seat T6 is still HELD by B",
        sx.status === "HELD" && sx.heldByUserId === userB.id,
        `status=${sx.status} heldBy=${sx.heldByUserId}`
    )
    check("B's Redis lock on T6 is untouched", (await lockOf(seatX.id)) === userB.id)

    // ---------- Scenario 3b: all-or-nothing, the DB catches the conflict ----------
    console.log("\nScenario 3b: Redis lets A through but the DB refuses one seat -> full rollback")

    // B holds seat T7 in the DB only (e.g. Redis lost the key). Redis will grant all four locks,
    // so this is the only scenario that exercises the transaction rollback + lock-release path.
    await prisma.seat.update({
        where: { id: seatY.id },
        data: {
            status: "HELD",
            heldByUserId: userB.id,
            reservedAt: new Date(),
            holdExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
    })

    const y1 = await hold(tokenA, event.id, [a1.id, a2.id, a3.id, seatY.id])
    check("A's four-seat request is rejected (expect 409)", y1.status === 409, `got ${y1.status}`)

    await checkNotHeld("A's three free seats", [a1.id, a2.id, a3.id])
    check("no Redis lock left on T7", (await lockOf(seatY.id)) === null)

    const sy = await getSeat(seatY.id)
    check(
        "seat T7 is still HELD by B",
        sy.status === "HELD" && sy.heldByUserId === userB.id,
        `status=${sy.status} heldBy=${sy.heldByUserId}`
    )

    // ---------- Scenario 4: release only your own seats ----------
    console.log("\nScenario 4: B tries to release A's seat -> nothing changes; own seats still release")

    const h1 = await hold(tokenA, event.id, [seatR1.id])
    const h2 = await hold(tokenB, event.id, [seatR2.id])
    check("A holds T8 and B holds T9 (expect 200 / 200)", h1.status === 200 && h2.status === 200, `got ${h1.status}/${h2.status}`)

    // 4a: B targets only A's seat
    const d1 = await release(tokenB, event.id, [seatR1.id])
    const d1Body = (await d1.json().catch(() => ({}))) as { releasedSeatIds?: string[] }
    check(
        "B's release of A's seat releases nothing",
        d1.status === 200 && (d1Body.releasedSeatIds ?? []).length === 0,
        `status=${d1.status} body=${JSON.stringify(d1Body)}`
    )
    const sr1 = await getSeat(seatR1.id)
    check(
        "T8 is still HELD by A",
        sr1.status === "HELD" && sr1.heldByUserId === userA.id,
        `status=${sr1.status} heldBy=${sr1.heldByUserId}`
    )
    check("A's Redis lock on T8 is untouched", (await lockOf(seatR1.id)) === userA.id)

    // 4b: B targets A's seat AND their own in one request
    const d2 = await release(tokenB, event.id, [seatR1.id, seatR2.id])
    const d2Body = (await d2.json().catch(() => ({}))) as { releasedSeatIds?: string[] }
    check(
        "mixed request releases only B's own seat (T9)",
        d2.status === 200 &&
            d2Body.releasedSeatIds?.length === 1 &&
            d2Body.releasedSeatIds[0] === seatR2.id,
        `status=${d2.status} body=${JSON.stringify(d2Body)}`
    )
    await checkNotHeld("B's released seat T9", [seatR2.id])
    const sr1b = await getSeat(seatR1.id)
    check(
        "T8 is still HELD by A after the mixed request",
        sr1b.status === "HELD" && sr1b.heldByUserId === userA.id && (await lockOf(seatR1.id)) === userA.id,
        `status=${sr1b.status} heldBy=${sr1b.heldByUserId}`
    )

    // 4c: the real owner can release
    const d3 = await release(tokenA, event.id, [seatR1.id])
    const d3Body = (await d3.json().catch(() => ({}))) as { releasedSeatIds?: string[] }
    check(
        "A releases their own seat (T8)",
        d3.status === 200 && d3Body.releasedSeatIds?.[0] === seatR1.id,
        `status=${d3.status} body=${JSON.stringify(d3Body)}`
    )
    await checkNotHeld("A's released seat T8", [seatR1.id])

    // ---------- Scenario 5: an expired hold cannot be confirmed ----------
    console.log("\nScenario 5: A's hold expires -> confirm is rejected and no booking is made")

    const e1 = await hold(tokenA, event.id, [seatE.id])
    check("A holds seat T10 (expect 200)", e1.status === 200, `got ${e1.status}`)

    // Expire only the DB hold. The Redis lock still says A owns the seat,
    // so a 409 below proves the database decides, not Redis.
    await prisma.seat.update({
        where: { id: seatE.id },
        data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    })

    const e2 = await call(
        "POST",
        tokenA,
        "/api/bookings/confirm",
        { seatIds: [seatE.id] },
        { "idempotency-key": randomUUID() }
    )
    check("A's confirm of the expired hold is rejected (expect 409)", e2.status === 409, `got ${e2.status}`)

    const se = await getSeat(seatE.id)
    check(
        "seat T10 is still HELD by A, not BOOKED",
        se.status === "HELD" && se.heldByUserId === userA.id,
        `status=${se.status} heldBy=${se.heldByUserId}`
    )
    check(
        "A has no booking rows",
        (await prisma.booking.count({ where: { userId: userA.id } })) === 0
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
        await cleanup()
        await prisma.$disconnect()
        redis.disconnect()
    })
