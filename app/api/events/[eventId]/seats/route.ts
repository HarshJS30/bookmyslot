import { auth } from "@/auth"
import { PrismaClient } from "../../../../generated/prisma/client";

const prisma = new PrismaClient()

export async function POST(
    request: Request,
    { params }: { params: Promise<{ eventId: string }> }
){
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
    if (!body.seatLabel || !body.categoryId) {
        return new Response("Missing required fields", { status: 400 })
    }
    const category = await prisma.ticketCategory.findUnique({
        where: { id: body.categoryId },
    })
    if(!category) {
        return new Response("Ticket category not found", { status: 404 })
    }
    if(category.eventId !== eventId) {
        return new Response("Ticket category does not belong to this event", { status: 400 })
    }
    return Response.json(await prisma.seat.create({
        data: {
            seatLabel: body.seatLabel,
            categoryId: body.categoryId,
            eventId: eventId,
        }
    }))
}
export async function GET(
    request: Request,
    { params }: { params: Promise<{ eventId: string }> }
){
    const { eventId } = await params
    const seats = await prisma.seat.findMany({
        where: { eventId: eventId },
        include:{
            category: true,
        }
    })
    return Response.json(seats)
}