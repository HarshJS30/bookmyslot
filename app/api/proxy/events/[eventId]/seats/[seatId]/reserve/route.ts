import { forwardAuthenticatedPost } from "@/lib/forward-authenticated-api";

const safeId = /^[a-zA-Z0-9_-]+$/;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; seatId: string }> },
) {
  const { eventId, seatId } = await params;
  if (!safeId.test(eventId) || !safeId.test(seatId)) {
    return new Response("Invalid event or seat ID", { status: 400 });
  }

  return forwardAuthenticatedPost(
    request,
    `/api/events/${eventId}/seats/${seatId}/reserve`,
  );
}