import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import redis from "@/lib/redis";
import { Prisma } from "../../../../generated/prisma/client";
import { seatIdsSchema } from "@/lib/validation";
import { SeatsUnavailableError } from "@/lib/errors";
import { acquireLock, releaseLock } from "@/lib/redis-locks";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ eventId: string }> }
) {
    const session = await auth();

    if (!session) {
        return new Response("Unauthorized", { status: 401 });
    }

    const ratelimit = await isRateLimited(session.user.id)
    if(ratelimit){
        return new Response("Too many requests",{
            status: 429,
            headers:{"Retry-after":"60"}
        })
    }

    const { eventId } = await params;
    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    const result = seatIdsSchema.safeParse(body);

    if (!result.success) {
        return new Response("Invalid seat IDs", { status: 400 });
    }

    const { seatIds: validatedSeatIds } = result.data;
    const seatIds = [...new Set(validatedSeatIds)];

    const acquiredSeatIds: string[] = [];

    const event = await prisma.event.findUnique({
        where: { id: eventId },
    });

    if (!event) {
        return new Response("Event not found", { status: 404 });
    }

    if (event.startsAt <= new Date()) {
        return new Response("Event has already started", { status: 400 });
    }

    try {
        // 1. Acquire Redis locks for all requested seats.
        // If Redis is down, carry on with the database alone. The database
        // update below is the real guarantee, so this is still safe.
        let redisAvailable = true;
        let lockResults: boolean[] = [];

        try {
            lockResults = await Promise.all(
                seatIds.map((seatId) =>
                    acquireLock(seatId, session.user.id)
                )
            );
        } catch (redisError) {
            console.error(
                "Redis unavailable, falling back to database-only holds:",
                redisError
            );
            redisAvailable = false;
        }

        // 2. Record successfully acquired locks
        seatIds.forEach((seatId, index) => {
            if (lockResults[index] === true) {
                acquiredSeatIds.push(seatId);
            }
        });

        // 3. If Redis answered and any lock failed, release the locks we acquired
        if (redisAvailable && acquiredSeatIds.length !== seatIds.length) {
            await Promise.all(
                acquiredSeatIds.map((seatId) => {
                    return releaseLock(seatId, session.user.id)
                })
            );

            return new Response(
                "One or more selected seats are held by another user",
                { status: 409 }
            );
        }

        // 4. Claim all seats atomically in the database
        const result = await prisma.$transaction(
            async (tx) => {
                const updated = await tx.seat.updateMany({
                    where: {
                        id: { in: seatIds },
                        eventId,
                        OR: [
                            { status: "AVAILABLE" },
                            {
                                status: "HELD",
                                holdExpiresAt: {
                                    lt: new Date(),
                                },
                            },
                            {
                                status: "HELD",
                                heldByUserId: session.user.id
                            }
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
                    throw new SeatsUnavailableError();
                }

                return updated;
            },
            {
                maxWait: 10_000,
                timeout: 10_000,
            }
        );

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
        // 6. Attempt Redis cleanup without masking the original error
        try {
            await Promise.all(
                acquiredSeatIds.map((seatId) => {
                    return releaseLock(seatId, session.user.id)
                })
            );
        } catch (cleanupError) {
            console.error(
                "Failed to release Redis locks after hold failure:",
                cleanupError
            );
        }

        if (error instanceof SeatsUnavailableError) {
            return new Response(
                "One or more selected seats are no longer available",
                { status: 409 }
            );
        }

        console.error("Failed to hold seats:", error);

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2028"
        ) {
            return new Response("Server Busy. Please retry.", {
                status: 503,
                headers: {
                    "Retry-After": "1",
                },
            });
        }

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

    try {
        body = await request.json();
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    const result = seatIdsSchema.safeParse(body);

    if (!result.success) {
        return new Response("Invalid seat IDs", { status: 400 });
    }

    const { seatIds: validatedSeatIds } = result.data;
    const seatIds = [...new Set(validatedSeatIds)];

    // Release seats and return exactly the rows that changed.
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
            releasedSeatIds.map((seatId) => {
                return releaseLock(seatId, session.user.id)
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