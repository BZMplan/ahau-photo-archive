import "server-only";
import type { betterAuth } from "better-auth";

type BetterAuthSession = ReturnType<typeof betterAuth>["$Infer"]["Session"];
export type AdminSession = BetterAuthSession & {
  user: BetterAuthSession["user"] & { role: "admin" };
};

// Fail closed until Better Auth sessions and server-side role checks are wired.
export async function getAdminSession(): Promise<AdminSession | null> {
  return null;
}
