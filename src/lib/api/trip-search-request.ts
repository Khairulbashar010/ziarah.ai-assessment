import { z } from "zod";
import { tripSearchParamsSchema } from "@/lib/llm/schemas";

export const tripSearchRequestSchema = z.object({
  query: z.string().min(3).max(2000),
  context: tripSearchParamsSchema.optional(),
});

export type TripSearchRequest = z.infer<typeof tripSearchRequestSchema>;
