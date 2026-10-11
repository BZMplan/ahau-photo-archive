export type ImageErrorCode =
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "INVALID_IMAGE"
  | "PIXEL_LIMIT"
  | "ANIMATED_IMAGE"
  | "PROCESSING_BUSY";
const messages: Record<ImageErrorCode, string> = {
  PROCESSING_BUSY: "图片处理繁忙，请稍后重试。",
  FILE_TOO_LARGE: "单张图片不能超过 10 MB。",
  UNSUPPORTED_FORMAT: "仅支持 JPEG、PNG 和 WebP 静态图片。",
  INVALID_IMAGE: "图片数据损坏或无法完整解码。",
  PIXEL_LIMIT: "图片像素或边长超过安全限制。",
  ANIMATED_IMAGE: "暂不支持动画或多页图片。",
};
export class ImageValidationError extends Error {
  constructor(readonly code: ImageErrorCode) {
    super(messages[code]);
    this.name = "ImageValidationError";
  }
}
