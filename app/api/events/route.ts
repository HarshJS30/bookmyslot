// app/api/events/route.ts

import { auth } from "@/auth"
import { PrismaClient } from "../../generated/prisma/client"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
    const session = await auth()

    if (!session || session.user.role !== "ORGANIZER") {
        return new Response("Unauthorized", { status: 401 })
    }

    const body = await request.json()

    if (!body.name || !body.venueId || !body.startsAt) {
        return new Response("Missing required fields", { status: 400 })
    }

    const event = await prisma.event.create({
        data: {
            name: body.name,
            venueId: body.venueId,
            startsAt: new Date(body.startsAt),
            imageUrl: body.imageUrl || null,
            organizerId: session.user.id,
        }
    })

    return Response.json(event)
}

export async function GET() {
  const events = await prisma.event.findMany({
    include: {
      venue: true,
    }
  })

  return Response.json(events)
}