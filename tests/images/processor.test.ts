import { describe, expect, test } from "vitest";
import sharp from "sharp";
import {
  validateImage,
  readImageMetadata,
  generateImageVariants,
  generatePreviewImage,
} from "../../src/server/images/processor";
import { IMAGE_CONFIG } from "../../src/server/images/config";
async function fixture(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp" = "jpeg",
) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 48, g: 100, b: 70 },
    },
  })
    .toFormat(format)
    .toBuffer();
}
describe("server image validation", () => {
  test.each(["jpeg", "png", "webp"] as const)(
    "identifies actual %s encoding",
    async (format) => {
      const data = await fixture(80, 40, format);
      expect(await validateImage(data)).toMatchObject({
        width: 80,
        height: 40,
        format,
        size: data.length,
        orientation: null,
      });
    },
  );
  test.each([
    Buffer.from("invalid"),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    Buffer.from("GIF89a"),
  ])("rejects non-supported bytes before decoding", async (data) => {
    await expect(validateImage(data)).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
  });
  test("rejects files over 10 MiB", async () => {
    await expect(
      validateImage(Buffer.alloc(IMAGE_CONFIG.maxBytes + 1)),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });
  test("rejects truncated JPEG despite readable headers", async () => {
    const data = await fixture(1000, 500);
    await expect(
      validateImage(data.subarray(0, Math.floor(data.length * 0.8))),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });
  });
  test("extracts base metadata without disclosing raw EXIF", async () => {
    const data = await sharp(await fixture(200, 100))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect(await readImageMetadata(data)).toMatchObject({
      width: 200,
      height: 100,
      orientation: 6,
      mimeType: "image/jpeg",
    });
    expect(await readImageMetadata(data)).not.toHaveProperty("exif");
  });
  test("rejects a highly compressed image exceeding the pixel cap", async () => {
    await expect(
      validateImage(await fixture(5000, 5000, "png")),
    ).rejects.toMatchObject({ code: "PIXEL_LIMIT" });
  });
  test("rejects extreme dimensions even when total pixels are small", async () => {
    await expect(
      validateImage(await fixture(16001, 1, "png")),
    ).rejects.toMatchObject({ code: "PIXEL_LIMIT" });
  });
});
describe("Sharp variants", () => {
  test("scales landscape proportionally for display and thumbnail", async () => {
    const result = await generateImageVariants(await fixture(3000, 1500));
    expect(result.display).toMatchObject({
      width: 2000,
      height: 1000,
      format: "webp",
    });
    expect(result.thumbnail).toMatchObject({ width: 600, height: 300 });
    expect(result.display.size).toBe(result.display.buffer.length);
  });
  test("scales portrait without square cropping", async () => {
    const result = await generateImageVariants(await fixture(1500, 3000));
    expect(result.display).toMatchObject({ width: 1000, height: 2000 });
    expect(result.thumbnail).toMatchObject({ width: 300, height: 600 });
  });
  test("does not enlarge small images", async () => {
    const data = await fixture(120, 80);
    const result = await generateImageVariants(data);
    const preview = await generatePreviewImage(data);
    for (const image of [result.display, result.thumbnail, preview])
      expect(image).toMatchObject({ width: 120, height: 80 });
  });
  test("limits private preview to 1200 pixels", async () => {
    expect(await generatePreviewImage(await fixture(2400, 1600))).toMatchObject(
      { width: 1200, height: 800 },
    );
  });
  test("applies EXIF orientation before stripping metadata from every derivative", async () => {
    const data = await sharp(await fixture(400, 200))
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Make: "Generated test camera", Model: "Fixture" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(data).metadata()).exif).toBeDefined();
    const variants = await generateImageVariants(data);
    for (const image of [
      variants.display,
      variants.thumbnail,
      await generatePreviewImage(data),
    ]) {
      expect(image).toMatchObject({ width: 200, height: 400 });
      const metadata = await sharp(image.buffer).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.orientation).toBeUndefined();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
    }
  });
  test("refuses invalid bytes in all processing entrypoints", async () => {
    await expect(
      generateImageVariants(Buffer.from("bad")),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
    await expect(
      generatePreviewImage(Buffer.from("bad")),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
  });
});
