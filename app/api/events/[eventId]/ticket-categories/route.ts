import { auth } from "@/auth"
import { PrismaClient } from "../../../../generated/prisma/client";

const prisma = new PrismaClient()

export async function POST(
    request: Request,
    { params }: { params: Promise<{ eventId: string }> }
) {
    const { eventId } = await params
    const session = await auth()

    if (!session || session.user.role !== "ORGANIZER") {
        return new Response("Unauthorized", { status: 401 })
    }
    const event = await prisma.event.findUnique({
        where: { id: eventId },
    })

    if (!event) {
        return new Response("Event not found", { status: 404 })
    }

    if (event.organizerId !== session.user.id) {
        return new Response("Forbidden", { status: 403 })
    }
    const body = await request.json()
    if (!body.name || !body.price) {
        return new Response("Missing required fields", { status: 400 })
    }
        
    return Response.json(await prisma.ticketCategory.create({
        data: {
            name: body.name,
            price: body.price,
            eventId: eventId,
        }
    }))
}