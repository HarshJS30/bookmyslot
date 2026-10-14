// seed.mjs — one-off script, NOT part of the app. Run with: node seed.mjs
// Requires Node 18+ (native fetch). Safe to re-run: skips events that already exist by name.

const BASE_URL = "https://bookmyslot.helloharsh.me"
const COOKIE = "__Secure-authjs.session-token=PASTE_FRESH_COOKIE_HERE"
const VENUE_ID = "cmuk5vs2a00005a08ftiybm97"

const events = [
    {
        name: "The Weeknd — After Hours Til Dawn",
        description:
            "A full-length live set spanning the After Hours era, with a stage production built for a night show.",
        durationMinutes: 150,
        startsAt: "2026-11-15T19:00:00.000Z",
        imageUrl: "https://i.pinimg.com/736x/a7/0b/54/a70b5425bad233a4864d772f87b86c8a.jpg",
    },
    {
        name: "Coldplay — Music of the Spheres",
        description:
            "Coldplay's world tour production: LED wristbands, confetti cannons, and a set that runs from the early hits to the newest album.",
        durationMinutes: 165,
        startsAt: "2026-12-05T18:30:00.000Z",
        imageUrl: "https://i.pinimg.com/1200x/9c/9c/87/9c9c87c52a6d8fd16c9e2a0f406ec430.jpg",
    },
    {
        name: "Arijit Singh Live",
        description:
            "An evening of Arijit Singh's biggest film songs, performed live with a full band and string section.",
        durationMinutes: 180,
        startsAt: "2026-12-20T19:00:00.000Z",
        imageUrl: "https://i.pinimg.com/1200x/7a/be/f4/7abef44419c3d7dee7f71a4a36e55d8f.jpg",
    },
]

// Each category maps to specific seat rows and its own price.
const CATEGORY_TIERS = [
    { name: "VIP", price: 8000, rows: ["A"] },
    { name: "Premium", price: 4500, rows: ["B", "C"] },
    { name: "General", price: 2000, rows: ["D", "E"] },
]

const SEATS_PER_ROW = 10

async function post(path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Cookie: COOKIE,
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`POST ${path} failed (${res.status}): ${text}`)
    }

    return res.json()
}

async function getExistingEventNames() {
    const res = await fetch(`${BASE_URL}/api/events`)
    if (!res.ok) {
        throw new Error(`GET /api/events failed (${res.status})`)
    }
    const existing = await res.json()
    return new Set(existing.map((e) => e.name))
}

async function seedEvent(eventData) {
    console.log(`Creating event: ${eventData.name}`)
    const event = await post("/api/events", {
        name: eventData.name,
        description: eventData.description,
        durationMinutes: eventData.durationMinutes,
        venueId: VENUE_ID,
        startsAt: eventData.startsAt,
        imageUrl: eventData.imageUrl,
    })

    for (const tier of CATEGORY_TIERS) {
        console.log(`  Creating category: ${tier.name} (₹${tier.price})`)
        const category = await post(`/api/events/${event.id}/ticket-categories`, {
            name: tier.name,
            price: tier.price,
        })

        for (const row of tier.rows) {
            console.log(`    Creating row ${row} (${SEATS_PER_ROW} seats)`)
            for (let i = 1; i <= SEATS_PER_ROW; i++) {
                await post(`/api/events/${event.id}/seats`, {
                    seatLabel: `${row}${i}`,
                    categoryId: category.id,
                })
            }
        }
    }

    console.log(`Done: ${eventData.name} (${event.id})\n`)
}

async function main() {
    const existingNames = await getExistingEventNames()

    for (const eventData of events) {
        if (existingNames.has(eventData.name)) {
            console.log(`Skipping (already exists): ${eventData.name}\n`)
            continue
        }
        await seedEvent(eventData)
    }

    console.log("Seeding finished.")
}

main().catch((err) => {
    console.error("Seeding failed:", err.message)
    process.exit(1)
})