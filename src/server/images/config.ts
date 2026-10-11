export const IMAGE_CONFIG = {
  maxBytes: MAX_OBJECT_BYTES,
  webpEffort: 4,
  maxPixels: 24_000_000,
  maxDimension: 16_000,
  concurrency: 2,
  maxQueued: 8,
  variants: {
    display: { maxEdge: 2000, quality: 82 },
    thumbnail: { maxEdge: 600, quality: 78 },
    preview: { maxEdge: 1200, quality: 80 },
  },
} as const;
import { MAX_OBJECT_BYTES } from "../storage/types";
