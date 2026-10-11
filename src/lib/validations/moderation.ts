import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

export const metadataUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: optionalText(1000),
    takenAt: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .transform((value) => (value ? value : null))
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
        "拍摄日期格式不正确。",
      )
      .refine(
        (value) => !value || value <= new Date().toISOString().slice(0, 10),
        "拍摄日期不能晚于今天。",
      ),
    location: optionalText(100),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  })
  .strict();

export const rejectionSchema = z
  .object({ reason: z.string().trim().max(1000).optional() })
  .strict();

export type MetadataUpdateInput = z.infer<typeof metadataUpdateSchema>;
