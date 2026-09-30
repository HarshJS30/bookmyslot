// app/api/events/route.ts

import { auth } from "@/auth"
import { PrismaClient } from "../../generated/prisma/client"
import { corsOptions, withCors } from "@/lib/cors"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
    const session = await auth()

    if (!session || session.user.role !== "ORGANIZER") {
        return withCors(request, new Response("Unauthorized", { status: 401 }))
    }

    const body = await request.json()

    if (!body.name || !body.venueId || !body.startsAt) {
        return withCors(request, new Response("Missing required fields", { status: 400 }))
    }

    if (
        body.durationMinutes !== undefined &&
        (!Number.isInteger(body.durationMinutes) || body.durationMinutes <= 0)
    ) {
        return withCors(
            request,
            new Response("durationMinutes must be a positive whole number", { status: 400 }),
        )
    }

    const event = await prisma.event.create({
        data: {
            name: body.name,
            description: body.description || null,
            imageUrl: body.imageUrl || null,
            durationMinutes: body.durationMinutes ?? null,
            venueId: body.venueId,
            startsAt: new Date(body.startsAt),
            organizerId: session.user.id,
        }
    })

    return withCors(request, Response.json(event))
}

export async function GET(request: Request) {
  const events = await prisma.event.findMany({
    include: {
      venue: true,
    }
  })

    return withCors(request, Response.json(events))
}

export async function OPTIONS(request: Request) {
    return corsOptions(request)
}