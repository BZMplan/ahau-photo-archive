import "server-only";
import { unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { getDatabasePath } from "@/server/db/path";
import { user } from "@/server/db/auth-schema";
import { bootstrapState } from "@/server/db/schema";
import type { AdminSession } from "@/server/auth/admin";
import { passwordChangeRequired } from "@/server/auth/bootstrap-policy";

const nameInput = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const emailInput = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.trim().toLowerCase()),
    currentPassword: z.string().min(1),
  })
  .strict();
const passwordInput = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(12)
      .max(128)
      .regex(/[A-Za-z]/)
      .regex(/[0-9]/),
    confirmPassword: z.string(),
  })
  .strict();

export class AdminAccountError extends Error {
  constructor(
    readonly code:
      "INVALID_INPUT" | "INVALID_PASSWORD" | "EMAIL_IN_USE" | "UNCHANGED",
    message: string,
  ) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AdminAccountError("INVALID_INPUT", "输入内容不符合要求。");
  return result.data;
}

export async function changeOwnName(
  session: AdminSession,
  headers: Headers,
  input: unknown,
) {
  const { name } = parse(nameInput, input);
  if (name === session.user.name)
    throw new AdminAccountError("UNCHANGED", "显示名称没有变化。");
  await getAuth().api.updateUser({ body: { name }, headers });
  return { name };
}

export async function changeOwnEmail(
  session: AdminSession,
  headers: Headers,
  input: unknown,
) {
  const { email, currentPassword } = parse(emailInput, input);
  if (email === session.user.email.toLowerCase())
    throw new AdminAccountError("UNCHANGED", "邮箱没有变化。");
  try {
    await getAuth().api.verifyPassword({
      body: { password: currentPassword },
      headers,
    });
  } catch {
    throw new AdminAccountError(
      "INVALID_PASSWORD",
      "当前密码不正确或会话已失效。",
    );
  }
  const db = getDb();
  if (
    db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.email, email), ne(user.id, session.user.id)))
      .get()
  )
    throw new AdminAccountError("EMAIL_IN_USE", "该邮箱已被使用。");
  try {
    // The project has no email delivery. Reauthentication and a bound user ID
    // make this dedicated update safe; never assert unperformed verification.
    db.update(user)
      .set({ email, emailVerified: false, updatedAt: new Date() })
      .where(eq(user.id, session.user.id))
      .run();
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed/.test(error.message)
    )
      throw new AdminAccountError("EMAIL_IN_USE", "该邮箱已被使用。");
    throw error;
  }
  return { email };
}

export async function changeOwnPassword(
  session: AdminSession,
  headers: Headers,
  input: unknown,
) {
  const { currentPassword, newPassword, confirmPassword } = parse(
    passwordInput,
    input,
  );
  if (newPassword !== confirmPassword)
    throw new AdminAccountError("INVALID_INPUT", "两次输入的新密码不一致。");
  if (newPassword === currentPassword)
    throw new AdminAccountError("UNCHANGED", "新密码不能与当前密码相同。");
  try {
    await getAuth().api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers,
    });
  } catch {
    throw new AdminAccountError(
      "INVALID_PASSWORD",
      "当前密码不正确或会话已失效。",
    );
  }
  if (passwordChangeRequired(session.user.id)) {
    const path = join(
      dirname(getDatabasePath()),
      "bootstrap/admin-credentials",
    );
    try {
      unlinkSync(path);
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    getDb()
      .update(bootstrapState)
      .set({ passwordChangeRequired: false })
      .where(
        and(
          eq(bootstrapState.id, 1),
          eq(bootstrapState.adminId, session.user.id),
        ),
      )
      .run();
  }
  return { changed: true, signInAgain: true };
}
