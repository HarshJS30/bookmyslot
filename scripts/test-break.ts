import prisma from "@/lib/prisma"
import redis from "@/lib/redis"
import { randomUUID } from "node:crypto"

// "Try to break it" suite. Run with the dev server up:
//   npx tsx --env-file=.env scripts/test-break.ts
// CHECK = must pass. INFO = a probe: prints what your system does, never fails the run.

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const RUN = randomUUID().slice(0, 8)
let failures = 0

const holdsPath = (eventId: string) => `/api/events/${eventId}/holds`
const CONFIRM = "/api/bookings/confirm"

function check(label: string, ok: boolean, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  -> " + detail}`)
    if (!ok) failures++
}
function info(label: string, detail: string) {
    console.log(`INFO  ${label}  -> ${detail}`)
}

function raw(
    method: "POST" | "DELETE",
    token: string | null,
    path: string,
    body?: string,
    headers: Record<string, string> = {}
) {
    return fetch(BASE + path, {
        method,
        headers: {
            "content-type": "application/json",
            ...(token ? { cookie: `authjs.session-token=${token}` } : {}),
            ...headers,
        },
        body,
    })
}
const call = (
    method: "POST" | "DELETE",
    token: string | null,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
) => raw(method, token, path, body === undefined ? undefined : JSON.stringify(body), headers)

const hold = (t: string, eventId: string, seatIds: string[]) =>
    call("POST", t, holdsPath(eventId), { seatIds })
const release = (t: string, eventId: string, seatIds: string[]) =>
    call("DELETE", t, holdsPath(eventId), { seatIds })
const confirm = (t: string, seatIds: string[], key: string = randomUUID()) =>
    call("POST", t, CONFIRM, { seatIds }, { "idempotency-key": key })

const bookingIdOf = async (res: Response): Promise<string | undefined> => {
    try {
        const j = (await res.json()) as { booking?: { id?: string } }
        return j?.booking?.id
    } catch {
        return undefined
    }
}

const getSeat = (id: string) => prisma.seat.findUniqueOrThrow({ where: { id } })
const lockOf = (id: string) => redis.get(`seat:lock:${id}`)

type U = { id: string; token: string }
async function makeUser(tag: string, organizer = false): Promise<U> {
    const user = await prisma.user.create({
        data: {
            name: `TEST ${tag}`,
            email: `${RUN}-${tag}@test.local`,
            ...(organizer ? { role: "ORGANIZER" as const } : {}),
        },
    })
    const token = randomUUID()
    await prisma.session.create({
        data: { sessionToken: token, userId: user.id, expires: new Date(Date.now() + 86_400_000) },
    })
    return { id: user.id, token }
}

const extraLockKeys: string[] = [] // locks for ids that are not real seats

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

    const keys = [...seatIds.map((id) => `seat:lock:${id}`), ...extraLockKeys]
    if (keys.length > 0) await redis.del(...keys)

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
    // ---------- Seed ----------
    const A = await makeUser("a", true)
    const B = await makeUser("b")

    const venue = await prisma.venue.create({ data: { name: `TEST_BREAK venue ${RUN}`, location: "Test" } })
    const mkEvent = async (label: string, startsAt: Date) => {
        const ev = await prisma.event.create({
            data: { name: `TEST_BREAK ${label} ${RUN}`, startsAt, venueId: venue.id, organizerId: A.id },
        })
        const cat = await prisma.ticketCategory.create({ data: { name: "Test", price: 100, eventId: ev.id } })
        return { ev, cat }
    }
    const future = new Date(Date.now() + 7 * 86_400_000)
    const { ev: event, cat: category } = await mkEvent("main", future)
    const { ev: event2, cat: category2 } = await mkEvent("other", future)
    const { ev: pastEvent, cat: pastCat } = await mkEvent("past", new Date(Date.now() - 86_400_000))

    let n = 0
    const newSeat = (ev = event, cat = category) =>
        prisma.seat.create({ data: { eventId: ev.id, seatLabel: `B${++n}`, categoryId: cat.id } })
    const newSeats = async (count: number) => {
        const out = []
        for (let i = 0; i < count; i++) out.push(await newSeat())
        return out
    }

    // ---------- Scenario 6: auth + malformed input must never produce a 5xx ----------
    console.log("\nScenario 6: auth and input fuzzing -> always a clean 4xx, never a 500")

    const probeSeat = await newSeat()
    const noAuthHold = await hold(null as unknown as string, event.id, [probeSeat.id])
    check("hold without a session -> 401", noAuthHold.status === 401, `got ${noAuthHold.status}`)
    const noAuthRelease = await call("DELETE", null, holdsPath(event.id), { seatIds: [probeSeat.id] })
    check("release without a session -> 401", noAuthRelease.status === 401, `got ${noAuthRelease.status}`)
    const noAuthConfirm = await call("POST", null, CONFIRM, { seatIds: [probeSeat.id] }, { "idempotency-key": randomUUID() })
    check("confirm without a session -> 401", noAuthConfirm.status === 401, `got ${noAuthConfirm.status}`)

    const bad: [string, string][] = [
        ["empty body", ""],
        ["invalid JSON", "{not json"],
        ["JSON null", "null"],
        ["empty object", "{}"],
        ["seatIds is a string", JSON.stringify({ seatIds: "abc" })],
        ["seatIds is an object", JSON.stringify({ seatIds: { $ne: null } })],
        ["empty array", JSON.stringify({ seatIds: [] })],
        ["numbers in array", JSON.stringify({ seatIds: [1, 2] })],
        ["null in array", JSON.stringify({ seatIds: [null] })],
        ["space in id", JSON.stringify({ seatIds: ["a b"] })],
        ["SQL injection id", JSON.stringify({ seatIds: [`'; DROP TABLE "Seat"; --`] })],
        ["5000-char id", JSON.stringify({ seatIds: ["x".repeat(5000)] })],
        ["11 ids (cap is 10)", JSON.stringify({ seatIds: Array.from({ length: 11 }, (_, i) => `id${i}`) })],
    ]
    for (const [label, body] of bad) {
        for (const method of ["POST", "DELETE"] as const) {
            const res = await raw(method, A.token, holdsPath(event.id), body)
            check(`${method} holds with ${label} -> 400`, res.status === 400, `got ${res.status}`)
        }
    }
    check(
        "Seat table survived the injection attempt",
        (await prisma.seat.count({ where: { eventId: event.id } })) > 0
    )

    const missingKey = await call("POST", A.token, CONFIRM, { seatIds: [probeSeat.id] })
    check("confirm without Idempotency-Key -> 400", missingKey.status === 400, `got ${missingKey.status}`)
    const emptyConfirm = await confirm(A.token, [])
    check("confirm with empty seatIds -> 400", emptyConfirm.status === 400, `got ${emptyConfirm.status}`)

    // ---------- Scenario 7: 15 users fight for ONE seat ----------
    console.log("\nScenario 7: 15 users hit the same seat at the same moment -> exactly one winner")

    const contested = await newSeat()
    const crowd = await Promise.all(Array.from({ length: 15 }, (_, i) => makeUser(`c${i}`)))
    const results = await Promise.all(crowd.map((u) => hold(u.token, event.id, [contested.id])))
    const statuses = results.map((r) => r.status)
    const winners = crowd.filter((_, i) => statuses[i] === 200)
    check("exactly one 200", winners.length === 1, `statuses=${statuses.join(",")}`)
    check(
        "everyone else got 409 (no 5xx)",
        statuses.filter((s) => s === 409).length === 14,
        `statuses=${statuses.join(",")}`
    )
    const cs = await getSeat(contested.id)
    check(
        "DB holder is the winner and Redis lock agrees",
        winners.length === 1 && cs.heldByUserId === winners[0].id && (await lockOf(contested.id)) === winners[0].id,
        `heldBy=${cs.heldByUserId} lock=${await lockOf(contested.id)}`
    )

    // ---------- Scenario 8: re-hold your own seat; duplicate ids in one request ----------
    console.log("\nScenario 8: re-holding your own seat and duplicate ids must not corrupt anything")

    const own = await newSeat()
    await hold(A.token, event.id, [own.id])
    const before = await getSeat(own.id)
    const again = await hold(A.token, event.id, [own.id])
    info("A re-holds a seat A already holds", `status ${again.status} (200 = idempotent, 409 = rejected)`)
    const after = await getSeat(own.id)
    check(
        "A's hold is intact after the re-hold attempt",
        after.status === "HELD" &&
            after.heldByUserId === A.id &&
            (await lockOf(own.id)) === A.id &&
            after.holdExpiresAt !== null &&
            before.holdExpiresAt !== null &&
            after.holdExpiresAt >= before.holdExpiresAt,
        `status=${after.status} heldBy=${after.heldByUserId}`
    )

    const dup = await newSeat()
    const dupRes = await hold(A.token, event.id, [dup.id, dup.id, dup.id])
    check("duplicate ids in one request never 5xx", dupRes.status < 500, `got ${dupRes.status}`)
    if (dupRes.status === 200) {
        const ds = await getSeat(dup.id)
        check("duplicate-id request holds the seat once, for A", ds.status === "HELD" && ds.heldByUserId === A.id)
    }

    // ---------- Scenario 9: wrong event, nonexistent seat ----------
    console.log("\nScenario 9: seats from another event or that do not exist -> 409, nothing left behind")

    const foreign = await newSeat(event2, category2)
    const r9a = await hold(A.token, event.id, [foreign.id])
    check("seat from another event -> 409", r9a.status === 409, `got ${r9a.status}`)
    const fs = await getSeat(foreign.id)
    check("foreign seat untouched, no lock", fs.status === "AVAILABLE" && (await lockOf(foreign.id)) === null)

    const ghostId = `ghost_${RUN}`
    extraLockKeys.push(`seat:lock:${ghostId}`)
    const free = await newSeat()
    const r9b = await hold(A.token, event.id, [free.id, ghostId])
    check("real seat + nonexistent seat -> 409", r9b.status === 409, `got ${r9b.status}`)
    const fr = await getSeat(free.id)
    check(
        "the real seat was not held",
        fr.status === "AVAILABLE" && fr.heldByUserId === null && (await lockOf(free.id)) === null
    )
    check("no lock left for the ghost id", (await lockOf(ghostId)) === null)

    // ---------- Scenario 10: lazy takeover, then the old holder tries to pay ----------
    console.log("\nScenario 10: A's hold expires, B takes it, A tries to confirm -> only B can pay")

    const tk = await newSeat()
    await hold(A.token, event.id, [tk.id])
    await prisma.seat.update({ where: { id: tk.id }, data: { holdExpiresAt: new Date(Date.now() - 60_000) } })
    await redis.del(`seat:lock:${tk.id}`)
    const takeover = await hold(B.token, event.id, [tk.id])
    check("B takes the expired seat (200)", takeover.status === 200, `got ${takeover.status}`)
    const aLate = await confirm(A.token, [tk.id])
    check("A's late confirm -> 409", aLate.status === 409, `got ${aLate.status}`)
    check("A has no booking rows", (await prisma.booking.count({ where: { userId: A.id } })) === 0)
    const bPay = await confirm(B.token, [tk.id])
    check("B's confirm -> 200", bPay.status === 200, `got ${bPay.status}`)
    const tks = await getSeat(tk.id)
    check("seat is BOOKED with hold fields cleared", tks.status === "BOOKED" && tks.heldByUserId === null && tks.holdExpiresAt === null,
        `status=${tks.status} heldBy=${tks.heldByUserId}`)

    // ---------- Scenario 11: confirm replays and double clicks ----------
    console.log("\nScenario 11: idempotency -> replay, 5 parallel same-key, 5 parallel different-key")

    const rp = await newSeat()
    await hold(A.token, event.id, [rp.id])
    const key = randomUUID()
    const c1 = await confirm(A.token, [rp.id], key)
    const id1 = await bookingIdOf(c1)
    check("first confirm -> 200 with a booking id", c1.status === 200 && !!id1, `status=${c1.status} id=${id1}`)
    const c2 = await confirm(A.token, [rp.id], key)
    const id2 = await bookingIdOf(c2)
    check("replay with same key -> 200, same booking id", c2.status === 200 && id1 === id2, `status=${c2.status} ${id1} vs ${id2}`)
    check("still exactly one booking for that seat", (await prisma.bookingSeat.count({ where: { seatId: rp.id } })) === 1)

    const par = await newSeat()
    await hold(A.token, event.id, [par.id])
    const sameKey = randomUUID()
    const parRes = await Promise.all(Array.from({ length: 5 }, () => confirm(A.token, [par.id], sameKey)))
    const parIds = await Promise.all(parRes.map(bookingIdOf))
    check(
        "5 parallel same-key confirms all -> 200 with one shared booking id",
        parRes.every((r) => r.status === 200) && new Set(parIds).size === 1 && !!parIds[0],
        `statuses=${parRes.map((r) => r.status).join(",")} ids=${[...new Set(parIds)].join("|")}`
    )
    check("exactly one booking row for that seat", (await prisma.bookingSeat.count({ where: { seatId: par.id } })) === 1)

    const dk = await newSeat()
    await hold(A.token, event.id, [dk.id])
    const dkRes = await Promise.all(Array.from({ length: 5 }, () => confirm(A.token, [dk.id])))
    const dkStatuses = dkRes.map((r) => r.status)
    check(
        "5 parallel different-key confirms: one 200, the rest 409",
        dkStatuses.filter((s) => s === 200).length === 1 && dkStatuses.filter((s) => s === 409).length === 4,
        `statuses=${dkStatuses.join(",")}`
    )
    check("exactly one booking row for that seat", (await prisma.bookingSeat.count({ where: { seatId: dk.id } })) === 1)

    // ---------- Scenario 12: a BOOKED seat cannot be taken or released ----------
    console.log("\nScenario 12: BOOKED seats are untouchable")

    const hb = await hold(B.token, event.id, [rp.id])
    check("B cannot hold a BOOKED seat (409)", hb.status === 409, `got ${hb.status}`)
    const rb = await release(A.token, event.id, [rp.id])
    const rbBody = (await rb.json().catch(() => ({}))) as { releasedSeatIds?: string[] }
    check("releasing a BOOKED seat releases nothing", (rbBody.releasedSeatIds ?? []).length === 0, JSON.stringify(rbBody))
    const rps = await getSeat(rp.id)
    check("seat is still BOOKED", rps.status === "BOOKED", `status=${rps.status}`)

    // ---------- Scenario 13: confirm is all-or-nothing too ----------
    console.log("\nScenario 13: confirm [mine, mine, free seat, B's seat] -> nothing is booked")

    const [m1, m2, freeSeat, bs] = await newSeats(4)
    await hold(A.token, event.id, [m1.id, m2.id])
    await hold(B.token, event.id, [bs.id])
    const cMix = await confirm(A.token, [m1.id, m2.id, freeSeat.id, bs.id])
    check("mixed confirm -> 409", cMix.status === 409, `got ${cMix.status}`)
    const mixRows = await prisma.seat.findMany({ where: { id: { in: [m1.id, m2.id, freeSeat.id, bs.id] } } })
    const byId = Object.fromEntries(mixRows.map((s) => [s.id, s]))
    check(
        "A's two seats are still HELD by A, free seat AVAILABLE, B's seat still B's",
        byId[m1.id].status === "HELD" && byId[m1.id].heldByUserId === A.id &&
            byId[m2.id].status === "HELD" && byId[m2.id].heldByUserId === A.id &&
            byId[freeSeat.id].status === "AVAILABLE" &&
            byId[bs.id].status === "HELD" && byId[bs.id].heldByUserId === B.id,
        JSON.stringify(mixRows.map((s) => [s.seatLabel, s.status, s.heldByUserId]))
    )
    check("no booking was created", (await prisma.bookingSeat.count({ where: { seatId: { in: [m1.id, m2.id, freeSeat.id, bs.id] } } })) === 0)

    // ---------- Scenario 14: the storm (12 users, 6 seats, overlapping batches) ----------
    console.log("\nScenario 14: storm -> overlapping batches from 12 users; check Redis and DB still agree")

    const pool = await newSeats(6)
    const stormUsers = await Promise.all(Array.from({ length: 12 }, (_, i) => makeUser(`s${i}`)))
    const wants = stormUsers.map((_, i) => {
        const size = 2 + (i % 2)
        return Array.from({ length: size }, (_, k) => pool[(i + k) % pool.length].id)
    })
    const storm = await Promise.all(stormUsers.map((u, i) => hold(u.token, event.id, wants[i])))
    const stormStatuses = storm.map((r) => r.status)
    check(
        "no 5xx anywhere (a 500 here usually means a deadlock)",
        stormStatuses.every((s) => s === 200 || s === 409),
        `statuses=${stormStatuses.join(",")}`
    )
    const poolRows = await prisma.seat.findMany({ where: { id: { in: pool.map((s) => s.id) } } })
    const redisOwners = await Promise.all(pool.map((s) => lockOf(s.id)))
    const owner = Object.fromEntries(pool.map((s, i) => [s.id, redisOwners[i]]))
    const agree = poolRows.every((r) =>
        r.status === "HELD" ? owner[r.id] === r.heldByUserId : r.status === "AVAILABLE" ? owner[r.id] === null && r.heldByUserId === null : false
    )
    check(
        "every HELD seat has a matching Redis lock, every AVAILABLE seat has none",
        agree,
        JSON.stringify(poolRows.map((r) => [r.seatLabel, r.status, r.heldByUserId, owner[r.id]]))
    )
    const allOrNothing = stormUsers.every((u, i) => {
        const mine = poolRows.filter((r) => wants[i].includes(r.id) && r.heldByUserId === u.id).length
        return stormStatuses[i] === 200 ? mine === wants[i].length : mine === 0
    })
    check("each user either holds their whole batch (200) or none of it (409)", allOrNothing)
    const seatHolders = poolRows.filter((r) => r.heldByUserId).map((r) => r.id)
    check("no seat has two holders", new Set(seatHolders).size === seatHolders.length)

    // ---------- Probes: things you may want to decide on ----------
    console.log("\nProbes (INFO only): behaviours worth knowing about")

    const pr1 = await newSeat()
    await hold(A.token, event.id, [pr1.id])
    await prisma.seat.update({ where: { id: pr1.id }, data: { holdExpiresAt: new Date(Date.now() - 60_000) } })
    const pr1b = await hold(B.token, event.id, [pr1.id]) // Redis lock still present, DB hold expired
    info(
        "DB hold expired but Redis lock still alive: B tries to hold",
        `status ${pr1b.status} (200 = DB is the judge, 409 = Redis can block an expired hold until its TTL)`
    )

    const pastSeat = await newSeat(pastEvent, pastCat)
    const pastRes = await hold(A.token, pastEvent.id, [pastSeat.id])
    info("holding a seat for an event that already started", `status ${pastRes.status} (200 = no startsAt check yet)`)

        // ---------- Scenario 15: event starts after the hold/booking was made ----------
    console.log("\nScenario 15: event already started -> confirm and cancel are refused")

    const { ev: evStart, cat: catStart } = await mkEvent("starts-soon", future)

    // confirm: hold while the event is still in the future, then move it to the past
    const sConfirm = await newSeat(evStart, catStart)
    await hold(A.token, evStart.id, [sConfirm.id])
    await prisma.event.update({ where: { id: evStart.id }, data: { startsAt: new Date(Date.now() - 60_000) } })
    const cLate = await confirm(A.token, [sConfirm.id])
    check("confirm after the event started -> 400", cLate.status === 400, `got ${cLate.status}`)
    const scs = await getSeat(sConfirm.id)
    check("seat is still HELD, not BOOKED", scs.status === "HELD", `status=${scs.status}`)
    check("no booking rows for that seat", (await prisma.bookingSeat.count({ where: { seatId: sConfirm.id } })) === 0)

    // cancel: book while the event is in the future, then move it to the past
    await prisma.event.update({ where: { id: evStart.id }, data: { startsAt: future } })
    const sCancel = await newSeat(evStart, catStart)
    await hold(A.token, evStart.id, [sCancel.id])
    const okBooking = await confirm(A.token, [sCancel.id])
    const bookingId = await bookingIdOf(okBooking)
    check("booking made while the event is in the future (200)", okBooking.status === 200 && !!bookingId, `got ${okBooking.status}`)
    await prisma.event.update({ where: { id: evStart.id }, data: { startsAt: new Date(Date.now() - 60_000) } })
    const cancelLate = await call("POST", A.token, `/api/bookings/${bookingId}/cancel`)
    check("cancel after the event started -> 400", cancelLate.status === 400, `got ${cancelLate.status}`)
    const scc = await getSeat(sCancel.id)
    check("seat is still BOOKED", scc.status === "BOOKED", `status=${scc.status}`)

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