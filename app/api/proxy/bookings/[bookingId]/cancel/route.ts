import { forwardAuthenticatedPost } from "@/lib/forward-authenticated-api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(bookingId)) {
    return new Response("Invalid booking ID", { status: 400 });
  }

  return forwardAuthenticatedPost(request, `/api/bookings/${bookingId}/cancel`);
}