export type PhotoStatus = "pending" | "approved" | "rejected" | "hidden";

// Explicit public projection: private object keys and submitter contact never leave the server.
export interface PublicPhoto {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  takenAt: string | null;
  publishedAt: Date | null;
  attribution: string | null;
}
