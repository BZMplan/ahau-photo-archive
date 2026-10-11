import "server-only";
import type { Metadata } from "sharp";
import { FeatureNotImplementedError } from "@/server/errors";

export interface ProcessedImages {
  metadata: Pick<Metadata, "width" | "height" | "format">;
  display: Buffer;
  thumbnail: Buffer;
}

// Phase 2: validate decoded pixels, normalize orientation, strip EXIF, emit optimized variants.
export async function processApprovedPhoto(
  original: Buffer,
): Promise<ProcessedImages> {
  void original;
  throw new FeatureNotImplementedError("Sharp image processing");
}
