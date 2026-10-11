import { dirname, resolve } from "node:path";
import { getDatabasePath } from "../db/path";
export type StorageEnvironment =
  | { driver: "local"; root: string }
  | {
      driver: "r2";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      privateBucket: string;
      publicBucket: string;
      publicBaseURL: string;
    };
export function readStorageEnvironment(
  env: Record<string, string | undefined> = process.env,
): StorageEnvironment {
  const driver =
    env.STORAGE_DRIVER || (env.NODE_ENV === "production" ? "r2" : "local");
  if (driver === "local") {
    const root = resolve(
      /* turbopackIgnore: true */ env.LOCAL_STORAGE_PATH ||
        resolve(dirname(getDatabasePath()), "storage"),
    );
    if (
      root
        .split(/[\\/]/)
        .some((part) =>
          ["public", ".next", ".git", "node_modules"].includes(part),
        )
    )
      throw new Error(
        "LOCAL_STORAGE_PATH must be outside static/build directories.",
      );
    return { driver, root };
  }
  if (driver !== "r2") throw new Error("STORAGE_DRIVER must be local or r2.");
  const required = (name: string) => {
    const value = env[name];
    if (!value || value.trim() !== value)
      throw new Error(`${name} is required when STORAGE_DRIVER=r2.`);
    return value;
  };
  const accountId = required("R2_ACCOUNT_ID");
  if (!/^[0-9a-f]{32}$/i.test(accountId))
    throw new Error(
      "R2_ACCOUNT_ID must be a 32-character hexadecimal account ID.",
    );
  const privateBucket = required("R2_PRIVATE_BUCKET"),
    publicBucket = required("R2_PUBLIC_BUCKET");
  for (const bucket of [privateBucket, publicBucket])
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
      throw new Error(
        "R2 bucket names must use lowercase letters, digits and hyphens (3–63 characters).",
      );
  if (privateBucket === publicBucket)
    throw new Error("R2 private and public buckets must be different.");
  const url = new URL(required("R2_PUBLIC_BASE_URL"));
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "R2_PUBLIC_BASE_URL must be an HTTPS origin without credentials or a path.",
    );
  return {
    driver,
    accountId,
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    privateBucket,
    publicBucket,
    publicBaseURL: url.origin,
  };
}
import "server-only";
