import { z } from "zod";

export const createMonitorSchema = z.object({
  user_id: z.coerce.number().int().positive({ message: "user_id must be a positive integer" }),
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  url: z.string().trim().url({ message: "Must be a valid URL (e.g., https://example.com)" }).refine(
    (val) => val.startsWith("http://") || val.startsWith("https://"),
    { message: "URL protocol must be HTTP or HTTPS" }
  ),
  interval_seconds: z.coerce.number().refine(
    (val) => [60, 3600, 86400].includes(val),
    { message: "interval_seconds must be one of: 60 (1m), 3600 (1h), 86400 (1d)" }
  ),
  is_active: z.boolean().optional().default(true),
});

export const updateMonitorSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  url: z.string().trim().url().refine(
    (val) => val.startsWith("http://") || val.startsWith("https://"),
    { message: "URL protocol must be HTTP or HTTPS" }
  ).optional(),
  interval_seconds: z.coerce.number().refine(
    (val) => [60, 3600, 86400].includes(val),
    { message: "interval_seconds must be one of: 60 (1m), 3600 (1h), 86400 (1d)" }
  ).optional(),
  is_active: z.boolean().optional(),
});

export const monitorIdParamSchema = z.object({
  id: z.coerce.number().int().positive({ message: "Monitor ID must be a positive integer" }),
});

export const metricsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50).optional(),
});

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
