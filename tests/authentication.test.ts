import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { verifyPassword } from "better-auth/crypto";
import { getDb } from "../src/server/db";
import {
  account,
  rateLimit,
  session,
  user,
} from "../src/server/db/auth-schema";
import { getAuth } from "../src/server/auth";
import { handleAuthRequest } from "../src/server/auth/http";
import { readAuthEnvironment } from "../src/server/auth/environment";
import { createArchiveAuth } from "../src/server/auth/options";
import { GET as me } from "../src/app/api/admin/me/route";

const directory = mkdtempSync(join(tmpdir(), "ahau-auth-test-"));
const origin = "http://localhost:3000";
process.env.DATABASE_PATH = join(directory, "archive.sqlite");
process.env.BETTER_AUTH_URL = origin;
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
const password = randomBytes(32).toString("base64url");
const db = getDb();
migrate(db, { migrationsFolder: "./drizzle" });
const auth = getAuth();
let adminId: string;
let visitorId: string;

before(async () => {
  adminId = (
    await auth.api.createUser({
      body: {
        email: "admin@example.invalid",
        name: "Test administrator",
        password,
        role: "admin",
      },
    })
  ).user.id;
  visitorId = (
    await auth.api.createUser({
      body: {
        email: "visitor@example.invalid",
        name: "Test visitor",
        password,
        role: "user",
      },
    })
  ).user.id;
});
beforeEach(() => {
  db.delete(rateLimit).run();
});
after(() => {
  db.$client.close();
  rmSync(directory, { recursive: true, force: true });
});

function request(
  path: string,
  body?: Record<string, unknown>,
  cookie?: string,
  extraHeaders?: Record<string, string>,
) {
  return new Request(`${origin}/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function login(email = "admin@example.invalid") {
  const response = await handleAuthRequest(
    request("/sign-in/email", { email, password }),
  );
  assert.equal(response.status, 200);
  return { response, cookie: cookieOf(response) };
}
function adminRequest(cookie?: string) {
  return new Request(`${origin}/api/admin/me`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

test("configuration fails closed and HTTPS selects secure cookies", () => {
  assert.throws(() => readAuthEnvironment({}), /BETTER_AUTH_SECRET/);
  const secret = randomBytes(48).toString("base64url");
  for (const url of [
    "http://public.example",
    "https://example.com/path",
    "https://u:p@example.com",
    "https://example.com?x=1",
  ])
    assert.throws(() =>
      readAuthEnvironment({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: url }),
    );
  assert.equal(
    readAuthEnvironment({
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_URL: "https://archive.example",
    }).secureCookies,
    true,
  );
});

test("provisioning uses UUIDs and Better Auth password hashing and rejects short passwords", async () => {
  assert.match(adminId, /^[0-9a-f-]{36}$/);
  const stored = db
    .select()
    .from(account)
    .where(eq(account.userId, adminId))
    .get();
  assert.ok(stored?.password);
  assert.notEqual(stored.password, password);
  assert.equal(await verifyPassword({ hash: stored.password, password }), true);
  await assert.rejects(
    auth.api.createUser({
      body: {
        email: "short@example.invalid",
        name: "Invalid",
        password: randomBytes(2).toString("hex"),
        role: "admin",
      },
    }),
  );
  assert.equal(
    db.select().from(user).where(eq(user.email, "short@example.invalid")).get(),
    undefined,
  );
});

test("unauthenticated and forged cookies receive 401", async () => {
  assert.equal((await me(adminRequest())).status, 401);
  assert.equal(
    (await me(adminRequest("ahau.session_token=forged; role=admin"))).status,
    401,
  );
});

test("admin login, refresh requests, cookies and DTOs never disclose credentials", async () => {
  const { response, cookie } = await login();
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.match(response.headers.get("set-cookie") ?? "", /SameSite=Lax/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const loginBody = await response.json();
  assert.equal("token" in loginBody, false);
  for (let refresh = 0; refresh < 2; refresh++) {
    const result = await me(adminRequest(cookie));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), {
      data: {
        user: {
          id: adminId,
          name: "Test administrator",
          email: "admin@example.invalid",
          role: "admin",
        },
      },
    });
  }
  const current = await handleAuthRequest(
    request("/get-session", undefined, cookie),
  );
  const data = await current.json();
  assert.equal("token" in data.session, false);
  assert.equal("password" in data.user, false);
});

test("wrong credentials and malformed requests fail", async () => {
  assert.equal(
    (
      await handleAuthRequest(
        request("/sign-in/email", {
          email: "admin@example.invalid",
          password: randomBytes(32).toString("hex"),
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleAuthRequest(
        request("/sign-in/email", { email: "not-an-email" }),
      )
    ).status,
    400,
  );
});

test("non-admin cannot escalate by request body or invoke provisioning endpoints", async () => {
  const result = await handleAuthRequest(
    request("/sign-in/email", {
      email: "visitor@example.invalid",
      password,
      role: "admin",
    }),
  );
  assert.equal(result.status, 200);
  const cookie = cookieOf(result);
  assert.equal((await me(adminRequest(cookie))).status, 403);
  for (const path of [
    "/sign-up/email",
    "/admin/create-user",
    "/admin/set-role",
    "/update-user",
  ]) {
    assert.equal(
      (
        await handleAuthRequest(
          request(
            path,
            {
              email: "new@example.invalid",
              password,
              role: "admin",
              userId: visitorId,
            },
            cookie,
          ),
        )
      ).status,
      404,
    );
  }
  assert.equal(
    db.select().from(user).where(eq(user.id, visitorId)).get()?.role,
    "user",
  );
});

test("role revocation and banning are checked against the database immediately", async () => {
  const { cookie } = await login();
  try {
    db.update(user).set({ role: "user" }).where(eq(user.id, adminId)).run();
    assert.equal((await me(adminRequest(cookie))).status, 403);
    db.update(user)
      .set({ role: "admin", banned: true })
      .where(eq(user.id, adminId))
      .run();
    assert.notEqual((await me(adminRequest(cookie))).status, 200);
  } finally {
    db.update(user)
      .set({ role: "admin", banned: false })
      .where(eq(user.id, adminId))
      .run();
  }
});

test("expired sessions and signed-out sessions cannot access administrator data", async () => {
  const { cookie } = await login();
  db.update(session)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(session.userId, adminId))
    .run();
  assert.equal((await me(adminRequest(cookie))).status, 401);
  const second = await login();
  assert.equal(
    (await handleAuthRequest(request("/sign-out", {}, second.cookie))).status,
    200,
  );
  assert.equal((await me(adminRequest(second.cookie))).status, 401);
});

test("CSRF and external callbacks are rejected by Better Auth", async () => {
  assert.equal(
    (
      await handleAuthRequest(
        request(
          "/sign-in/email",
          { email: "admin@example.invalid", password },
          undefined,
          { Origin: "https://evil.example" },
        ),
      )
    ).status,
    403,
  );
  for (const callbackURL of ["https://evil.example", "//evil.example"]) {
    assert.equal(
      (
        await handleAuthRequest(
          request("/sign-in/email", {
            email: "admin@example.invalid",
            password,
            callbackURL,
          }),
        )
      ).status,
      403,
    );
  }
  const { cookie } = await login();
  assert.equal(
    (
      await handleAuthRequest(
        request("/sign-out", {}, cookie, { Origin: "https://evil.example" }),
      )
    ).status,
    403,
  );
  assert.equal((await me(adminRequest(cookie))).status, 200);
});

test("persistent login limiter cannot be bypassed with forwarded IP headers", async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await handleAuthRequest(
      request("/sign-in/email", { email: "invalid" }, undefined, {
        "X-Forwarded-For": `192.0.2.${attempt}`,
        "CF-Connecting-IP": `192.0.2.${attempt}`,
      }),
    );
    assert.equal(response.status, 400);
  }
  const restartedAuth = createArchiveAuth(db, readAuthEnvironment());
  const blocked = await restartedAuth.handler(
    request("/sign-in/email", { email: "invalid" }, undefined, {
      "X-Forwarded-For": "192.0.2.200",
    }),
  );
  assert.equal(blocked.status, 429);
  assert.ok(db.select().from(rateLimit).all().length > 0);
});

test("HTTPS auth emits Secure host-only cookies", async () => {
  const secureAuth = createArchiveAuth(db, {
    ...readAuthEnvironment(),
    baseURL: "https://archive.example",
    secureCookies: true,
  });
  const result = await secureAuth.handler(
    new Request("https://archive.example/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://archive.example",
      },
      body: JSON.stringify({ email: "admin@example.invalid", password }),
    }),
  );
  assert.equal(result.status, 200);
  const cookies = result.headers.getSetCookie().join(";");
  assert.match(cookies, /Secure/);
  assert.match(cookies, /HttpOnly/);
  assert.doesNotMatch(cookies, /Domain=/);
});

test("concurrent login attempts cannot exceed the shared limit", async () => {
  const responses = await Promise.all(
    Array.from({ length: 20 }, () =>
      handleAuthRequest(request("/sign-in/email", { email: "invalid" })),
    ),
  );
  assert.equal(
    responses.filter((response) => response.status === 400).length,
    10,
  );
  assert.equal(
    responses.filter((response) => response.status === 429).length,
    10,
  );
});
