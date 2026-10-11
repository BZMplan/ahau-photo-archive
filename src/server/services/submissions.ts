import "server-only";
import { FeatureNotImplementedError } from "@/server/errors";

export interface CreateSubmissionInput {
  files: File[];
  attribution?: string;
  contact?: string;
  turnstileToken: string;
}

// Validate files, enforce rate limits and verify Turnstile before any private upload.
export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<{ id: string }> {
  void input;
  throw new FeatureNotImplementedError("Anonymous submissions");
}
