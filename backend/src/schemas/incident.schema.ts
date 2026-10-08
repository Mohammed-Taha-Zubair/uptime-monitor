import { z } from "zod";

export const incidentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
  status: z.enum(["all", "open", "resolved"]).default("all").optional(),
});

export type IncidentListQueryInput = z.infer<typeof incidentListQuerySchema>;
