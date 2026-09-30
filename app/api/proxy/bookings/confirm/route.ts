import { forwardAuthenticatedPost } from "@/lib/forward-authenticated-api";

export async function POST(request: Request) {
  return forwardAuthenticatedPost(request, "/api/bookings/confirm");
}