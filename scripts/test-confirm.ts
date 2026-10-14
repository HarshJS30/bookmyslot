// Tests for the confirm route: retries with the same Idempotency-Key (including at the
// same instant), key reuse with different seats, and seat conflicts. After each scenario
// it checks the database, not only the HTTP answers.
//
// Needs the LOCAL Docker stack running and a fresh seed. Never point it at production.
//
//   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/mydatabase"
//   $env:REDIS_URL="redis://localhost:6379"
//   $env:USERS="200"; $env:SEATS="5000"
//   npx tsx scripts/load-seed.ts
//   npx tsx scripts/test-confirm.ts
//
// It uses seats 100 and up from loadtest/data.json and the first two users, so it never
// touches the seats the one-seat fight uses (0 to 19). Reseed before running it again.

import prisma from "@/lib/prisma"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const BASE = process.env.BASE_URL ?? "http://localhost:8080"

const data = JSON.parse(readFileSync(resolve("loadtest/data.json"), "utf8")) as {
    eventId: string
    seatIds: string[]
    tokens: string[]
}

type Reply = {
    status: number
    text: string
    json: { booking?: { id?: string } } | null
}

let failures = 0

function check(name: string, ok: boolean, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
    if (!ok) failures++
}

async function post(
    path: string,
    token: string,
    body: unknown,
    key?: string
): Promise<Reply> {
    const headers: Record<string, string> = {
        "content-type": "application/json",
        cookie: `authjs.session-token=${token}`,
    }

    if (key) {
        headers["idempotency-key"] = key
    }

    const res = await fetch(BASE + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    })

    const text = await res.text()
    let json: Reply["json"] = null

    try {
        json = JSON.parse(text)
    } catch {
        json = null
    }

    return { status: res.status, text, json }
}

const hold = (token: string, seatIds: string[]) =>
    post(`/api/events/${data.eventId}/holds`, token, { seatIds })

const confirm = (token: string, seatIds: string[], key: string) =>
    post("/api/bookings/confirm", token, { seatIds }, key)

// Seats 100 and up, handed out once each.
let nextSeat = 100

function takeSeats(count: number) {
    const ids = data.seatIds.slice(nextSeat, nextSeat + count)
    nextSeat += count
    return ids
}

async function seatStatuses(ids: string[]) {
    const rows = await prisma.seat.findMany({
        where: { id: { in: ids } },
        select: { status: true },
    })
    return rows.map((row) => row.status)
}

async function main() {
    const [tokenA, tokenB] = data.tokens

    const sessionA = await prisma.session.findUniqueOrThrow({
        where: { sessionToken: tokenA },
        select: { userId: true },
    })
    const userA = sessionA.userId

    // 1 and 2. Same key, same seats, ten requests at the same instant, then a later retry.
    {
        const seats = takeSeats(2)
        const key = randomUUID()

        const held = await hold(tokenA, seats)
        check("1. hold two seats", held.status === 200, `status ${held.status}`)

        const replies = await Promise.all(
            Array.from({ length: 10 }, () => confirm(tokenA, seats, key))
        )
        const statuses = replies.map((reply) => reply.status)
        const bookingIds = new Set(replies.map((reply) => reply.json?.booking?.id))

        check(
            "1. ten simultaneous confirms with the same key all answer 200",
            statuses.every((status) => status === 200),
            statuses.join(",")
        )
        check(
            "1. they all return the same booking",
            bookingIds.size === 1 && !bookingIds.has(undefined)
        )

        const bookings = await prisma.booking.findMany({
            where: { userId: userA, key },
        })
        check(
            "1. exactly one booking row exists for the key",
            bookings.length === 1,
            `${bookings.length} rows`
        )

        const bookingId = bookings[0]?.id
        const payments = bookingId
            ? await prisma.payment.count({ where: { bookingId } })
            : -1
        const links = bookingId
            ? await prisma.bookingSeat.count({ where: { bookingId } })
            : -1

        check("1. exactly one payment", payments === 1, `${payments}`)
        check(
            "1. one booking seat row per seat",
            links === seats.length,
            `${links}`
        )
        check(
            "1. both seats are BOOKED",
            (await seatStatuses(seats)).every((status) => status === "BOOKED")
        )

        const again = await confirm(tokenA, seats, key)
        check(
            "2. a later retry with the same key returns the same booking",
            again.status === 200 && again.json?.booking?.id === bookingId,
            `status ${again.status}`
        )

        // 3. Same key, different seats.
        const other = takeSeats(2)
        const heldOther = await hold(tokenA, other)
        check("3. hold two other seats", heldOther.status === 200)

        const mismatch = await confirm(tokenA, other, key)
        check(
            "3. the same key with different seats is rejected with 422",
            mismatch.status === 422,
            `status ${mismatch.status}`
        )
        check(
            "3. the other seats stay HELD",
            (await seatStatuses(other)).every((status) => status === "HELD")
        )
        check(
            "3. there is still only one booking for the key",
            (await prisma.booking.count({ where: { userId: userA, key } })) === 1
        )
    }

    // 4. Same key, different seats, at the same instant.
    {
        const x = takeSeats(2)
        const y = takeSeats(2)
        const key = randomUUID()

        const heldX = await hold(tokenA, x)
        const heldY = await hold(tokenA, y)
        check(
            "4. hold both pairs of seats",
            heldX.status === 200 && heldY.status === 200
        )

        const [replyX, replyY] = await Promise.all([
            confirm(tokenA, x, key),
            confirm(tokenA, y, key),
        ])
        const statuses = [replyX.status, replyY.status].sort((a, b) => a - b)

        check(
            "4. one request gets 200 and the other 422 (no 5xx)",
            statuses[0] === 200 && statuses[1] === 422,
            statuses.join(",")
        )
        check(
            "4. exactly one booking exists for the key",
            (await prisma.booking.count({ where: { userId: userA, key } })) === 1
        )

        const all = [...(await seatStatuses(x)), ...(await seatStatuses(y))]
        check(
            "4. exactly two seats ended up BOOKED and two stayed HELD",
            all.filter((status) => status === "BOOKED").length === 2 &&
                all.filter((status) => status === "HELD").length === 2,
            all.join(",")
        )
    }

    // 5. Confirming seats you never held.
    {
        const seats = takeSeats(1)
        const key = randomUUID()
        const reply = await confirm(tokenA, seats, key)

        check(
            "5. confirming seats you do not hold gives 409",
            reply.status === 409,
            `status ${reply.status}`
        )
        check(
            "5. no booking was created",
            (await prisma.booking.count({ where: { userId: userA, key } })) === 0
        )
    }

    // 6. Another user cannot confirm your held seats.
    {
        const seats = takeSeats(1)
        const held = await hold(tokenA, seats)
        check("6. user A holds a seat", held.status === 200)

        const reply = await confirm(tokenB, seats, randomUUID())
        check(
            "6. user B cannot confirm user A's held seat (409)",
            reply.status === 409,
            `status ${reply.status}`
        )
        check(
            "6. the seat stays HELD",
            (await seatStatuses(seats)).every((status) => status === "HELD")
        )
    }

    // 7. Bad requests.
    {
        const seats = takeSeats(1)

        const noKey = await post("/api/bookings/confirm", tokenA, { seatIds: seats })
        check(
            "7. a missing Idempotency-Key gives 400",
            noKey.status === 400,
            `status ${noKey.status}`
        )

        const badBody = await confirm(tokenA, [], randomUUID())
        check(
            "7. an empty seat list gives 400",
            badBody.status === 400,
            `status ${badBody.status}`
        )
    }

    console.log(
        failures === 0
            ? "\nAll checks passed."
            : `\n${failures} check(s) FAILED.`
    )
    process.exitCode = failures === 0 ? 0 : 1
}

main()
    .catch((err) => {
        console.error("Test run crashed:", err)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })