import prisma from "@/lib/prisma"
import redis from "@/lib/redis"
import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

// Creates N users (with sessions), one event and M seats for the k6 load tests,
// and writes loadtest/data.json for k6 to read. Safe to re-run: it deletes the
// previous LOAD data first, so every k6 run starts from clean seats.
//
//   $env:USERS="200"; $env:SEATS="5000"
//   npx tsx --env-file=.env scripts/load-seed.ts

const USERS = Number(process.env.USERS ?? 200)
const SEATS = Number(process.env.SEATS ?? 5000)

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

async function cleanup() {
    const users = await prisma.user.findMany({
        where: { email: { endsWith: "@load.local" } },
        select: { id: true },
    })
    const userIds = users.map((u) => u.id)
    const events = await prisma.event.findMany({
        where: { name: { startsWith: "LOAD " } },
        select: { id: true },
    })
    const eventIds = events.map((e) => e.id)
    const seats = await prisma.seat.findMany({
        where: { eventId: { in: eventIds } },
        select: { id: true },
    })
    const seatIds = seats.map((s) => s.id)

    for (const part of chunk(seatIds, 1000)) {
        await redis.del(...part.map((id) => `seat:lock:${id}`))
    }
    await prisma.payment.deleteMany({ where: { booking: { userId: { in: userIds } } } })
    await prisma.bookingSeat.deleteMany({
        where: { OR: [{ booking: { userId: { in: userIds } } }, { seatId: { in: seatIds } }] },
    })
    await prisma.booking.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.seat.deleteMany({ where: { eventId: { in: eventIds } } })
    await prisma.ticketCategory.deleteMany({ where: { eventId: { in: eventIds } } })
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } })
    await prisma.venue.deleteMany({ where: { name: { startsWith: "LOAD " } } })
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

async function main() {
    console.log("Cleaning previous LOAD data...")
    await cleanup()

    const organizer = await prisma.user.create({
        data: { name: "LOAD organizer", email: "load-org@load.local", role: "ORGANIZER" },
    })
    const venue = await prisma.venue.create({ data: { name: "LOAD venue", location: "Test" } })
    const event = await prisma.event.create({
        data: {
            name: "LOAD event",
            startsAt: new Date(Date.now() + 30 * 86_400_000),
            venueId: venue.id,
            organizerId: organizer.id,
        },
    })
    const category = await prisma.ticketCategory.create({
        data: { name: "Load", price: 100, eventId: event.id },
    })

    console.log(`Creating ${SEATS} seats...`)
    const seatIds = Array.from({ length: SEATS }, () => randomUUID())
    for (let start = 0; start < SEATS; start += 1000) {
        await prisma.seat.createMany({
            data: seatIds.slice(start, start + 1000).map((id, j) => ({
                id,
                eventId: event.id,
                seatLabel: `S${start + j + 1}`,
                categoryId: category.id,
            })),
        })
    }

    console.log(`Creating ${USERS} users with sessions...`)
    const userIds = Array.from({ length: USERS }, () => randomUUID())
    const tokens = Array.from({ length: USERS }, () => randomUUID())
    const expires = new Date(Date.now() + 86_400_000)
    await prisma.user.createMany({
        data: userIds.map((id, i) => ({
            id,
            name: `LOAD user ${i}`,
            email: `load-${i}@load.local`,
        })),
    })
    await prisma.session.createMany({
        data: userIds.map((userId, i) => ({ sessionToken: tokens[i], userId, expires })),
    })

    const dir = resolve("loadtest")
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, "data.json"), JSON.stringify({ eventId: event.id, seatIds, tokens }))
    console.log(`Done. ${SEATS} seats, ${USERS} users -> loadtest/data.json`)
}

main()
    .catch((err) => {
        console.error("Seed failed:", err)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
        redis.disconnect()
    })