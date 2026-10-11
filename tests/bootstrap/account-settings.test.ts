import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { user, rateLimit } from "@/server/db/auth-schema";
import { eq } from "drizzle-orm";
import { PATCH as changeName } from "@/app/api/admin/settings/profile/route";
import { POST as changeEmail } from "@/app/api/admin/settings/email/route";
import { POST as changePassword } from "@/app/api/admin/settings/password/route";
import { GET as me } from "@/app/api/admin/me/route";

const directory = mkdtempSync(join(tmpdir(), "ahau-settings-test-"));
const origin = "http://localhost:3000";
const initialPassword = randomBytes(24).toString("base64url");
const newPassword = "NewStrongPassword123456789";
let adminCookie: string;
let secondCookie: string;
let visitorCookie: string;
let adminId: string;

function request(
  path: string,
  method: string,
  body?: object,
  cookie?: string,
  requestOrigin = origin,
) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      ...(body
        ? { "Content-Type": "application/json", Origin: requestOrigin }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function login(email: string, password: string) {
  const result = await getAuth().handler(
    request("/api/auth/sign-in/email", "POST", { email, password }),
  );
  return { status: result.status, cookie: cookies(result) };
}

beforeAll(async () => {
  vi.stubEnv("DATABASE_PATH", join(directory, "archive.db"));
  vi.stubEnv("BETTER_AUTH_URL", origin);
  vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(48).toString("base64url"));
  migrate(getDb(), { migrationsFolder: "drizzle" });
  adminId = (
    await getAuth().api.createUser({
      body: {
        email: "admin@example.invalid",
        name: "Admin",
        password: initialPassword,
        role: "admin",
      },
    })
  ).user.id;
  await getAuth().api.createUser({
    body: {
      email: "visitor@example.invalid",
      name: "Visitor",
      password: initialPassword,
      role: "user",
    },
  });
  getDb()
    .$client.prepare(
      "INSERT INTO bootstrap_state (id,admin_id,password_change_required,created_at) VALUES (1,?,1,?)",
    )
    .run(adminId, Date.now());
  mkdirSync(join(directory, "bootstrap"), { mode: 0o700 });
  writeFileSync(join(directory, "bootstrap/admin-credentials"), "temporary", {
    mode: 0o600,
  });
  adminCookie = (await login("admin@example.invalid", initialPassword)).cookie;
  secondCookie = (await login("admin@example.invalid", initialPassword)).cookie;
  visitorCookie = (await login("visitor@example.invalid", initialPassword))
    .cookie;
});
afterAll(() => {
  getDb().$client.close();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

test("settings reject anonymous, non-admin and untrusted origins", async () => {
  expect(
    (
      await changeName(
        request("/api/admin/settings/profile", "PATCH", { name: "X" }),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await changeName(
        request(
          "/api/admin/settings/profile",
          "PATCH",
          { name: "X" },
          visitorCookie,
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await changePassword(
        request(
          "/api/admin/settings/password",
          "POST",
          {
            currentPassword: initialPassword,
            newPassword,
            confirmPassword: newPassword,
          },
          adminCookie,
          "https://evil.example",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await changeName(
        request(
          "/api/admin/settings/profile",
          "PATCH",
          { name: "X" },
          adminCookie,
        ),
      )
    ).status,
  ).toBe(403);
});

test("first change is enforced, verifies current password, revokes sessions and invalidates credentials", async () => {
  expect(
    (await me(request("/api/admin/me", "GET", undefined, adminCookie))).status,
  ).toBe(200);
  expect(
    (
      await changePassword(
        request(
          "/api/admin/settings/password",
          "POST",
          {
            currentPassword: "wrong",
            newPassword,
            confirmPassword: newPassword,
          },
          adminCookie,
        ),
      )
    ).status,
  ).toBe(422);
  expect(
    (
      await changePassword(
        request(
          "/api/admin/settings/password",
          "POST",
          {
            currentPassword: initialPassword,
            newPassword,
            confirmPassword: newPassword,
          },
          adminCookie,
        ),
      )
    ).status,
  ).toBe(200);
  expect(existsSync(join(directory, "bootstrap/admin-credentials"))).toBe(
    false,
  );
  expect(
    getDb()
      .$client.prepare(
        "SELECT password_change_required AS required FROM bootstrap_state",
      )
      .get(),
  ).toEqual({ required: 0 });
  expect(
    (await me(request("/api/admin/me", "GET", undefined, secondCookie))).status,
  ).toBe(401);
  expect((await login("admin@example.invalid", initialPassword)).status).toBe(
    401,
  );
  const fresh = await login("admin@example.invalid", newPassword);
  expect(fresh.status).toBe(200);
  adminCookie = fresh.cookie;
});

test("self-service name and email changes are bound to current administrator", async () => {
  expect(
    (
      await changeName(
        request(
          "/api/admin/settings/profile",
          "PATCH",
          { name: "Changed Admin", role: "user" },
          adminCookie,
        ),
      )
    ).status,
  ).toBe(422);
  expect(
    (
      await changeName(
        request(
          "/api/admin/settings/profile",
          "PATCH",
          { name: "Changed Admin" },
          adminCookie,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await changeEmail(
        request(
          "/api/admin/settings/email",
          "POST",
          { email: "visitor@example.invalid", currentPassword: newPassword },
          adminCookie,
        ),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await changeEmail(
        request(
          "/api/admin/settings/email",
          "POST",
          { email: "changed@example.org", currentPassword: "wrong" },
          adminCookie,
        ),
      )
    ).status,
  ).toBe(422);
  expect(
    (
      await changeEmail(
        request(
          "/api/admin/settings/email",
          "POST",
          { email: "changed@example.org", currentPassword: newPassword },
          adminCookie,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    getDb()
      .select({
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.emailVerified,
      })
      .from(user)
      .where(eq(user.id, adminId))
      .get(),
  ).toEqual({
    email: "changed@example.org",
    name: "Changed Admin",
    role: "admin",
    verified: false,
  });
  expect((await login("admin@example.invalid", newPassword)).status).toBe(401);
  expect((await login("changed@example.org", newPassword)).status).toBe(200);
  getDb().delete(rateLimit).run();
});
