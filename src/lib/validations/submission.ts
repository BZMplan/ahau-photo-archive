import { z } from "zod";
import { MAX_SUBMISSION_PHOTOS, PHOTOS_PER_DAY } from "@/lib/submission-limits";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const photoSubmissionSchema = z
  .object({
    authorName: z.string().trim().min(1).max(50),
    contactEmail: z
      .string()
      .trim()
      .email()
      .max(254)
      .optional()
      .or(z.literal(""))
      .transform((value) => value || undefined),
    message: optionalText(1000),
    consentAccepted: z.literal(true),
    submissionRequestId: z.string().uuid(),
  })
  .strict();

export const photoMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: optionalText(1000),
    takenAt: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .or(z.literal(""))
      .transform((value) => value || undefined),
    location: optionalText(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.takenAt) return;
    const date = new Date(`${value.takenAt}T00:00:00.000Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value.takenAt
    )
      context.addIssue({
        code: "custom",
        path: ["takenAt"],
        message: "拍摄日期无效。",
      });
    else if (date > today)
      context.addIssue({
        code: "custom",
        path: ["takenAt"],
        message: "拍摄日期不能晚于今天。",
      });
  });

export const photoMetadataListSchema = z
  .array(photoMetadataSchema)
  .min(1)
  .max(MAX_SUBMISSION_PHOTOS)
  .refine((items) => items.length <= PHOTOS_PER_DAY, "照片数量超过限制。");

export type PhotoSubmission = z.infer<typeof photoSubmissionSchema>;
export type PhotoMetadataInput = z.infer<typeof photoMetadataSchema>;
