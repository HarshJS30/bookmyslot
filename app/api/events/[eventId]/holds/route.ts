import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import redis from "@/lib/redis";
import { Prisma } from "../../../../generated/prisma/client";
import { seatIdsSchema } from "@/lib/validation";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ eventId: string }> }
) {
    const session = await auth();

    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    const { eventId } = await params;
    let body: unknown;
    
    try{
        body = await request.json();
    }catch(err){
        return new Response("Invalid JSON", { status: 400 });
    }

    const result = seatIdsSchema.safeParse(body);

    if(!result.success) {
        return new Response("Invalid seat IDs", { status: 400 });
    }

    const { seatIds: validatedSeatIds } = result.data;
    const seatIds = [...new Set(validatedSeatIds)];


    const acquiredSeatIds: string[] = [];

    try {
        // 1. Acquire Redis locks for all requested seats
        const lockResults = await Promise.all(
            seatIds.map((seatId) =>
                redis.set(
                    `seat:lock:${seatId}`,
                    session.user.id,
                    "EX",
                    300,
                    "NX"
                )
            )
        );

        // 2. Record the locks we successfully acquired
        seatIds.forEach((seatId, index) => {
            if (lockResults[index] === "OK") {
                acquiredSeatIds.push(seatId);
            }
        });

        // 3. If any lock failed, release the ones we acquired
        if (acquiredSeatIds.length !== seatIds.length) {
            await Promise.all(
                acquiredSeatIds.map(async (seatId) => {
                    const key = `seat:lock:${seatId}`;
                    const owner = await redis.get(key);

                    if (owner === session.user.id) {
                        await redis.del(key);
                    }
                })
            );

            return new Response(
                "One or more selected seats are held by another user",
                { status: 409 }
            );
        }

        // 4. Claim all seats atomically in the database
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.seat.updateMany({
                where: {
                    id: { in: seatIds },
                    eventId,
                    OR: [
                        {
                            status: "AVAILABLE",
                        },
                        {
                            status: "HELD",
                            holdExpiresAt: {
                                lt: new Date(),
                            },
                        },
                    ],
                },
                data: {
                    status: "HELD",
                    reservedAt: new Date(),
                    heldByUserId: session.user.id,
                    holdExpiresAt: new Date(
                        Date.now() + 5 * 60 * 1000
                    ),
                },
            });

            if (updated.count !== seatIds.length) {
                throw new Error("SEAT_UPDATE_FAILED");
            }

            return updated;
        });

        // 5. Notify realtime server
        try {
            await Promise.all(
                seatIds.map((seatId) =>
                    redis.publish(
                        "realtime",
                        JSON.stringify({
                            eventId,
                            seatId,
                            status: "HELD",
                        })
                    )
                )
            );
        } catch (err) {
            console.error("Failed to publish seat update:", err);
        }

        return new Response(JSON.stringify(result), {
            status: 200,
        });
    } catch (error) {
        // 6. Release Redis locks if DB operation failed
        await Promise.all(
            acquiredSeatIds.map(async (seatId) => {
                const key = `seat:lock:${seatId}`;
                const owner = await redis.get(key);

                if (owner === session.user.id) {
                    await redis.del(key);
                }
            })
        );

        if (
            error instanceof Error &&
            error.message === "SEAT_UPDATE_FAILED"
        ) {
            return new Response(
                "One or more selected seats are no longer available",
                { status: 409 }
            );
        }

        console.error("Failed to hold seats:", error);

        return new Response("Internal Server Error", {
            status: 500,
        });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ eventId: string }> }
) {
    const session = await auth();

    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    const { eventId } = await params;
    let body: unknown;
    
    try{
        body = await request.json();
    }catch(err){
        return new Response("Invalid JSON", { status: 400 });
    }

    const result = seatIdsSchema.safeParse(body);

    if(!result.success) {
        return new Response("Invalid seat IDs", { status: 400 });
    }

    const { seatIds: validatedSeatIds } = result.data;
    const seatIds = [...new Set(validatedSeatIds)];


    // Release the seats and return exactly the rows that were changed.
    const releasedSeats = await prisma.$queryRaw<{ id: string }[]>`
        UPDATE "Seat"
        SET
            status = 'AVAILABLE',
            "heldByUserId" = NULL,
            "holdExpiresAt" = NULL,
            "reservedAt" = NULL
        WHERE
            "eventId" = ${eventId}
            AND id IN (${Prisma.join(seatIds)})
            AND status = 'HELD'
            AND "heldByUserId" = ${session.user.id}
        RETURNING id
    `;

    const releasedSeatIds = releasedSeats.map((seat) => seat.id);

    // Remove Redis locks
    try {
        await Promise.all(
            releasedSeatIds.map(async (seatId) => {
                const key = `seat:lock:${seatId}`;
                const owner = await redis.get(key);

                if (owner === session.user.id) {
                    await redis.del(key);
                }
            })
        );
    } catch (err) {
        console.error("Failed to release Redis locks:", err);
    }

    // Notify realtime server
    try {
        await Promise.all(
            releasedSeatIds.map((seatId) =>
                redis.publish(
                    "realtime",
                    JSON.stringify({
                        eventId,
                        seatId,
                        status: "AVAILABLE",
                    })
                )
            )
        );
    } catch (err) {
        console.error("Failed to publish seat update:", err);
    }

    return new Response(
        JSON.stringify({
            releasedSeatIds,
        }),
        { status: 200 }
    );
}