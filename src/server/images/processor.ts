import "server-only";
import sharp from "sharp";
import { IMAGE_CONFIG } from "./config";
import { ImageValidationError } from "./errors";
import type { ImageMetadata, ImageVariants, ProcessedImage } from "./types";
import type { ImageFormat } from "../storage/keys";

// Bound simultaneous decodes; the pixel cap also applies to metadata and each variant.
let active = 0;
const queue: (() => void)[] = [];
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  if (
    active >= IMAGE_CONFIG.concurrency &&
    queue.length >= IMAGE_CONFIG.maxQueued
  )
    throw new ImageValidationError("PROCESSING_BUSY");
  if (active >= IMAGE_CONFIG.concurrency)
    await new Promise<void>((resolve) => queue.push(resolve));
  else active++;
  try {
    return await operation();
  } finally {
    const next = queue.shift();
    if (next) next();
    else active--;
  }
}
const inputOptions = {
  limitInputPixels: IMAGE_CONFIG.maxPixels,
  failOn: "warning" as const,
  sequentialRead: true,
};
function detectFormat(input: Buffer): ImageFormat {
  if (
    input.length >= 3 &&
    input[0] === 0xff &&
    input[1] === 0xd8 &&
    input[2] === 0xff
  )
    return "jpeg";
  if (
    input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (
    input.length >= 12 &&
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  throw new ImageValidationError("UNSUPPORTED_FORMAT");
}
async function inspect(input: Buffer): Promise<ImageMetadata> {
  if (input.length > IMAGE_CONFIG.maxBytes)
    throw new ImageValidationError("FILE_TOO_LARGE");
  const format = detectFormat(input);
  try {
    const metadata = await sharp(input, inputOptions).metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height)
      throw new ImageValidationError("INVALID_IMAGE");
    if ((metadata.pages ?? 1) > 1)
      throw new ImageValidationError("ANIMATED_IMAGE");
    if (
      metadata.width * metadata.height > IMAGE_CONFIG.maxPixels ||
      Math.max(metadata.width, metadata.height) > IMAGE_CONFIG.maxDimension
    )
      throw new ImageValidationError("PIXEL_LIMIT");
    // metadata() only reads headers; force a complete bounded decode before accepting bytes.
    await sharp(input, inputOptions).stats();
    return {
      width: metadata.width,
      height: metadata.height,
      format,
      mimeType:
        format === "jpeg"
          ? "image/jpeg"
          : format === "png"
            ? "image/png"
            : "image/webp",
      size: input.length,
      orientation: metadata.orientation ?? null,
    };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    if (error instanceof Error && /pixel limit/i.test(error.message))
      throw new ImageValidationError("PIXEL_LIMIT");
    throw new ImageValidationError("INVALID_IMAGE");
  }
}
export function validateImage(input: Buffer): Promise<ImageMetadata> {
  return bounded(() => inspect(input));
}
export const readImageMetadata = validateImage;
async function variant(
  input: Buffer,
  kind: keyof typeof IMAGE_CONFIG.variants,
): Promise<ProcessedImage> {
  const { maxEdge, quality } = IMAGE_CONFIG.variants[kind];
  const { data, info } = await sharp(input, inputOptions)
    .autoOrient()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: IMAGE_CONFIG.webpEffort })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: data,
    width: info.width,
    height: info.height,
    format: "webp",
    size: info.size,
  };
}
export function generatePreviewImage(input: Buffer): Promise<ProcessedImage> {
  return bounded(async () => {
    await inspect(input);
    return variant(input, "preview");
  });
}
export function generateImageVariants(input: Buffer): Promise<ImageVariants> {
  return bounded(async () => {
    await inspect(input);
    return {
      display: await variant(input, "display"),
      thumbnail: await variant(input, "thumbnail"),
    };
  });
}
