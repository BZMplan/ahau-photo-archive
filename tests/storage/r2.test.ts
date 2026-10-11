import { beforeEach, afterEach, expect, test, vi, type Mock } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  type GetObjectCommandOutput,
  type ServiceOutputTypes,
} from "@aws-sdk/client-s3";
import { createR2Client, R2Storage } from "../../src/server/storage/r2";
import { readStorageEnvironment } from "../../src/server/storage/environment";
import { originalKey, publicKeys } from "../../src/server/storage/keys";
import { getPublicImageUrl } from "../../src/server/storage/urls";
import { MAX_OBJECT_BYTES } from "../../src/server/storage/types";
let client: S3Client;
const config = {
  STORAGE_DRIVER: "r2",
  R2_ACCOUNT_ID: randomBytes(16).toString("hex"),
  R2_ACCESS_KEY_ID: randomBytes(16).toString("hex"),
  R2_SECRET_ACCESS_KEY: randomBytes(32).toString("hex"),
  R2_PRIVATE_BUCKET: "campus-archive-private",
  R2_PUBLIC_BUCKET: "campus-archive-public",
  R2_PUBLIC_BASE_URL: "https://images.example.com/",
};
beforeEach(() => {
  const environment = readStorageEnvironment(config);
  if (environment.driver !== "r2") throw new Error("Expected R2");
  client = createR2Client(environment);
});
afterEach(() => {
  vi.restoreAllMocks();
  client.destroy();
});
// S3Client.send's final overload is callback-based (void); this mock models
// only the Promise overload used by the adapter, without weakening production types.
function mockSend() {
  return vi.spyOn(client, "send") as unknown as Mock<
    (
      command:
        | PutObjectCommand
        | GetObjectCommand
        | HeadObjectCommand
        | DeleteObjectCommand,
    ) => Promise<ServiceOutputTypes>
  >;
}
function downloaded(
  chunks: Uint8Array[],
  contentLength?: number,
): GetObjectCommandOutput {
  return {
    $metadata: {},
    ContentLength: contentLength,
    Body: {
      transformToWebStream: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
    },
  } as GetObjectCommandOutput;
}
test("R2 configuration uses auto region, fixed account endpoint and one client", async () => {
  expect(await client.config.region()).toBe("auto");
  const endpoint = await client.config.endpoint?.();
  expect(endpoint?.hostname).toBe(
    `${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  );
});
test("uploads originals only to private bucket with type, hash, no-store and conditional create", async () => {
  const send = mockSend().mockResolvedValue({ $metadata: {} });
  const adapter = new R2Storage(client, config.R2_PRIVATE_BUCKET, "private");
  const key = originalKey(randomUUID(), "png");
  await adapter.put(key, Buffer.from("test"), {
    contentType: "image/png",
    ifAbsent: true,
  });
  const command = send.mock.calls[0][0];
  expect(command).toBeInstanceOf(PutObjectCommand);
  expect(command.input).toMatchObject({
    Bucket: config.R2_PRIVATE_BUCKET,
    Key: key,
    ContentType: "image/png",
    CacheControl: "private, no-store",
    IfNoneMatch: "*",
  });
});
test("uploads public derivatives with short cache policy", async () => {
  const send = mockSend().mockResolvedValue({ $metadata: {} });
  const adapter = new R2Storage(client, config.R2_PUBLIC_BUCKET, "public");
  await adapter.put(publicKeys(randomUUID()).displayKey, Buffer.from("test"), {
    contentType: "image/webp",
  });
  expect(send.mock.calls[0][0].input).toMatchObject({
    Bucket: config.R2_PUBLIC_BUCKET,
    ContentType: "image/webp",
    CacheControl: "public, max-age=60, must-revalidate",
  });
});
test("downloads a bounded object body", async () => {
  const send = mockSend().mockResolvedValue(
    downloaded([Buffer.from("one"), Buffer.from("two")]),
  );
  const adapter = new R2Storage(client, config.R2_PRIVATE_BUCKET, "private");
  expect(await adapter.get(originalKey(randomUUID(), "jpeg"))).toEqual(
    Buffer.from("onetwo"),
  );
  expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
});
test("bounds downloads even if server omits Content-Length", async () => {
  mockSend().mockResolvedValue(
    downloaded([Buffer.alloc(MAX_OBJECT_BYTES), Buffer.from("overflow")]),
  );
  const adapter = new R2Storage(client, config.R2_PRIVATE_BUCKET, "private");
  await expect(
    adapter.get(originalKey(randomUUID(), "jpeg")),
  ).rejects.toMatchObject({ code: "TOO_LARGE" });
});
test("head and delete use appropriate commands; delete missing is idempotent", async () => {
  const send = mockSend().mockResolvedValue({
    $metadata: {},
    ContentLength: 123,
    Metadata: { sha256: "fixture" },
  });
  const adapter = new R2Storage(client, config.R2_PUBLIC_BUCKET, "public");
  const key = publicKeys(randomUUID()).thumbnailKey;
  expect(await adapter.head(key)).toMatchObject({
    size: 123,
    sha256: "fixture",
  });
  expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  await adapter.delete(key);
  expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
  send.mockRejectedValue({
    name: "NoSuchKey",
    $metadata: { httpStatusCode: 404 },
  });
  await adapter.delete(key);
  expect(await adapter.exists(key)).toBe(false);
});
test.each([
  [403, "FORBIDDEN"],
  [500, "UNAVAILABLE"],
  [412, "CONFLICT"],
  [400, "IO_ERROR"],
] as const)("maps HTTP %i to safe %s errors", async (status, code) => {
  mockSend().mockRejectedValue({
    message: "secret internal message",
    $metadata: { httpStatusCode: status },
  });
  const adapter = new R2Storage(client, config.R2_PUBLIC_BUCKET, "public");
  const key = publicKeys(randomUUID()).displayKey;
  await expect(adapter.head(key)).rejects.toMatchObject({ code });
  await expect(adapter.head(key)).rejects.not.toThrow(/secret internal/);
});
test("exists does not swallow authorization or network errors", async () => {
  mockSend().mockRejectedValue(new Error("network secret"));
  const adapter = new R2Storage(client, config.R2_PUBLIC_BUCKET, "public");
  await expect(
    adapter.exists(publicKeys(randomUUID()).displayKey),
  ).rejects.toMatchObject({ code: "UNAVAILABLE" });
});
test("cannot put private keys or mismatched formats into the public bucket", async () => {
  const send = mockSend();
  const adapter = new R2Storage(client, config.R2_PUBLIC_BUCKET, "public");
  await expect(
    adapter.put(originalKey(randomUUID(), "png"), Buffer.from("secret"), {
      contentType: "image/png",
    }),
  ).rejects.toMatchObject({ code: "INVALID_KEY" });
  await expect(
    adapter.put(publicKeys(randomUUID()).displayKey, Buffer.from("png"), {
      contentType: "image/png",
    }),
  ).rejects.toMatchObject({ code: "INVALID_KEY" });
  expect(send).not.toHaveBeenCalled();
});
test("validates buckets and domain and produces canonical encoded public URLs", () => {
  expect(() =>
    readStorageEnvironment({
      ...config,
      R2_PUBLIC_BUCKET: config.R2_PRIVATE_BUCKET,
    }),
  ).toThrow(/different/);
  for (const url of [
    "http://images.example.com",
    "https://user:secret@images.example.com",
    "https://images.example.com/path",
    "https://images.example.com?url=evil",
  ])
    expect(() =>
      readStorageEnvironment({ ...config, R2_PUBLIC_BASE_URL: url }),
    ).toThrow();
  const environment = readStorageEnvironment(config);
  const key = publicKeys(randomUUID()).displayKey;
  expect(getPublicImageUrl(key, environment)).toBe(
    `https://images.example.com/${key}`,
  );
});

test("upload, download and delete failures never hide permission errors", async () => {
  mockSend().mockRejectedValue({
    name: "AccessDenied",
    $metadata: { httpStatusCode: 403 },
  });
  const adapter = new R2Storage(client, config.R2_PRIVATE_BUCKET, "private");
  const key = originalKey(randomUUID(), "png");
  await expect(
    adapter.put(key, Buffer.from("fixture"), { contentType: "image/png" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(adapter.get(key)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(adapter.delete(key)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
