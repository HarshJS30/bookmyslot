import { z } from "zod";

export const seatIdsSchema = z.object({
  seatIds: z
    .array(
      z
        .string()
        .min(1)
        .max(50)
        .regex(/^[a-zA-Z0-9_-]+$/, {
          error: "Invalid seat ID format",
        })
    )
    .min(1)
    .max(10),
});