import "server-only";
import type { S3Client } from "@aws-sdk/client-s3";
import { FeatureNotImplementedError } from "@/server/errors";

export interface R2Storage {
  client: S3Client;
  putPrivateOriginal(input: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  publishApprovedVariants(input: {
    photoId: string;
    display: Buffer;
    thumbnail: Buffer;
  }): Promise<{ displayKey: string; thumbnailKey: string }>;
  removePublicVariants(photoId: string): Promise<void>;
}

// No client or network request is created until the private/public bucket policy is implemented.
export function getR2Storage(): R2Storage {
  throw new FeatureNotImplementedError("R2 storage");
}
