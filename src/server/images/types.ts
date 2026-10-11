import type { ImageFormat } from "../storage/keys";
import type { ImageMimeType } from "../storage/types";
export interface ImageMetadata {
  width: number;
  height: number;
  format: ImageFormat;
  mimeType: ImageMimeType;
  size: number;
  orientation: number | null;
}
// Optional future photography fields are never used to overwrite submitted dates.
export interface PhotographyMetadata {
  takenAt?: string;
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  focalLength?: number;
  aperture?: number;
  shutterSpeed?: string;
  iso?: number;
}
export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  format: "webp";
  size: number;
}
export interface ImageVariants {
  display: ProcessedImage;
  thumbnail: ProcessedImage;
}
