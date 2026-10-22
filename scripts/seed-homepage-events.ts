import prisma from "@/lib/prisma";

const organizerEmail = "homepage-events@bookmyslot.local";
const events = [
  {
    name: "Nightcrawler",
    category: "MOVIES" as const,
    description:
      "A late-night screening of the gripping neo-noir thriller, with a short introduction and interval refreshments.",
    imageUrl: "https://i.pinimg.com/736x/5a/c3/25/5ac32531eba73c28ce80ba27f154d978.jpg",
    durationMinutes: 118,
    startsAt: "2026-11-08T19:00:00+05:30",
    venue: "PVR Phoenix Palladium",
    location: "Mumbai",
    prices: [499, 799, 1199],
  },
  {
    name: "Rockstar",
    category: "MOVIES" as const,
    description:
      "A special big-screen presentation of the musical drama, featuring a remastered picture and sound experience.",
    imageUrl: "https://i.pinimg.com/736x/9c/5d/a7/9c5da7bb8ec29f5f795e7fb024465a03.jpg",
    durationMinutes: 159,
    startsAt: "2026-12-04T19:30:00+05:30",
    venue: "PVR Orion Mall",
    location: "Bengaluru",
    prices: [399, 699, 999],
  },
  {
    name: "f1",
    category: "MOVIES" as const,
    description:
      "A high-octane cinema screening with premium large-format sound and an immersive racing-day atmosphere.",
    imageUrl: "https://i.pinimg.com/736x/62/de/93/62de93a1f5c05e5df63501eb069f2b68.jpg",
    durationMinutes: 155,
    startsAt: "2027-01-10T18:30:00+05:30",
    venue: "INOX R-City",
    location: "Mumbai",
    prices: [499, 899, 1299],
  },
  {
    name: "Fight Club",
    category: "MOVIES" as const,
    description:
      "A late-night cult-classic screening on the big screen, with immersive audio and reserved seating.",
    imageUrl: "https://i.pinimg.com/736x/ed/4c/6e/ed4c6eda78f0367291922e10218e7b86.jpg",
    durationMinutes: 139,
    startsAt: "2027-01-17T20:00:00+05:30",
    venue: "Cinepolis Seasons Mall",
    location: "Pune",
    prices: [399, 699, 999],
  },
  {
    name: "Still Alive and Unfiltered",
    category: "COMEDY" as const,
    description:
      "An intimate stand-up set packed with sharp observations, candid stories and new material.",
    imageUrl: "https://i.pinimg.com/736x/9e/88/0e/9e880eda48d40b032e7b2a55dc144be7.jpg",
    durationMinutes: 90,
    startsAt: "2026-11-14T19:30:00+05:30",
    venue: "The Habitat",
    location: "Mumbai",
    prices: [799, 1199, 1699],
  },
  {
    name: "The Local Train Live",
    category: "CONCERTS" as const,
    description:
      "A full-band live concert celebrating crowd favourites, heartfelt lyrics and a night of sing-alongs.",
    imageUrl: "https://i.pinimg.com/736x/8d/ff/7f/8dff7ff93b115add79f86b7db04bfa32.jpg",
    durationMinutes: 150,
    startsAt: "2026-11-21T19:00:00+05:30",
    venue: "Phoenix Marketcity",
    location: "Bengaluru",
    prices: [1499, 2499, 3999],
  },
  {
    name: "Manik Mahna",
    category: "COMEDY" as const,
    description:
      "A live stand-up comedy show with observational humour, audience interaction and a fresh set.",
    imageUrl: "https://assets-in.bmscdn.com/discovery-catalog/events/tr:w-400,h-600,bg-CCCCCC/et00457353-haldnchrrx-portrait.jpg",
    durationMinutes: 90,
    startsAt: "2027-01-27T20:00:00+05:30",
    venue: "NCPA Experimental Theatre",
    location: "Mumbai",
    prices: [999, 1499, 1999],
  },
  {
    name: "The Last Letter",
    category: "THEATRE" as const,
    description:
      "A contemporary stage drama about family, memory and the messages that arrive just in time.",
    imageUrl: "https://i.pinimg.com/736x/a5/fe/ec/a5feecb2009c81e5771d3363a9d2408a.jpg",
    durationMinutes: 125,
    startsAt: "2027-02-03T19:00:00+05:30",
    venue: "Kamani Auditorium",
    location: "Delhi",
    prices: [1299, 1999, 2999],
  },
  {
    name: "RCB VS CSK",
    category: "SPORTS" as const,
    description:
      "A live cricket match-day experience with stadium entry, reserved seating and an electric crowd.",
    imageUrl: "https://i.pinimg.com/736x/fe/17/f5/fe17f58ad0203fea258d0ad5b6a43af6.jpg",
    durationMinutes: 240,
    startsAt: "2027-02-11T19:30:00+05:30",
    venue: "MCA International Stadium",
    location: "Pune",
    prices: [799, 1499, 2499],
  },
] as const;

const ticketTiers = ["General", "Premium", "VIP"] as const;
const seatsPerTier = 10;

async function main() {
  const existingOrganizer = await prisma.user.findUnique({
    where: { email: organizerEmail },
  });
  if (existingOrganizer && existingOrganizer.role !== "ORGANIZER") {
    throw new Error(`${organizerEmail} already exists but is not an organizer.`);
  }

  const organizer =
    existingOrganizer ??
    (await prisma.user.create({
      data: {
        name: "BookMySlot Events",
        email: organizerEmail,
        role: "ORGANIZER",
      },
    }));

  for (const eventData of events) {
    await prisma.$transaction(async (tx) => {
      const venue =
        (await tx.venue.findFirst({
          where: { name: eventData.venue, location: eventData.location },
        })) ??
        (await tx.venue.create({
          data: { name: eventData.venue, location: eventData.location },
        }));

      const existingEvent = await tx.event.findFirst({
        where: { name: eventData.name, organizerId: organizer.id },
      });
      const event = existingEvent
        ? await tx.event.update({
            where: { id: existingEvent.id },
            data: {
              name: eventData.name,
              description: eventData.description,
              imageUrl: eventData.imageUrl,
              category: eventData.category,
              durationMinutes: eventData.durationMinutes,
              startsAt: new Date(eventData.startsAt),
              venueId: venue.id,
            },
          })
        : await tx.event.create({
            data: {
              name: eventData.name,
              description: eventData.description,
              imageUrl: eventData.imageUrl,
              category: eventData.category,
              durationMinutes: eventData.durationMinutes,
              startsAt: new Date(eventData.startsAt),
              venueId: venue.id,
              organizerId: organizer.id,
            },
          });

      for (const [tierIndex, tierName] of ticketTiers.entries()) {
        const existingCategory = await tx.ticketCategory.findFirst({
          where: { eventId: event.id, name: tierName },
        });
        const category = existingCategory
          ? await tx.ticketCategory.update({
              where: { id: existingCategory.id },
              data: { price: eventData.prices[tierIndex] },
            })
          : await tx.ticketCategory.create({
              data: {
                name: tierName,
                price: eventData.prices[tierIndex],
                eventId: event.id,
              },
            });
        const row = String.fromCharCode(65 + tierIndex);

        await tx.seat.createMany({
          data: Array.from({ length: seatsPerTier }, (_, index) => ({
            eventId: event.id,
            categoryId: category.id,
            seatLabel: `${row}${index + 1}`,
          })),
          skipDuplicates: true,
        });
      }

      console.log(`Seeded ${event.name} (${event.id})`);
    });
  }
}

main()
  .catch((error: unknown) => {
    console.error("Homepage event seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
