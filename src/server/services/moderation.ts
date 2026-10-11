import "server-only";
import type { AdminSession } from "@/server/auth/admin";
import { FeatureNotImplementedError } from "@/server/errors";
import type { PhotoStatus } from "@/types/photo";

export interface ModeratePhotoInput {
  photoId: string;
  targetStatus: PhotoStatus;
  note?: string;
}

// Authenticate at each server entry point; persist status and audit log in one transaction.
export async function moderatePhoto(
  admin: AdminSession,
  input: ModeratePhotoInput,
): Promise<void> {
  void admin;
  void input;
  throw new FeatureNotImplementedError("Photo moderation");
}
