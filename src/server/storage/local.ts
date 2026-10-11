import "server-only";
import { constants, existsSync, lstatSync, realpathSync } from "node:fs";
import { link, lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, join, parse, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { assertStorageKey, keyContentType } from "./keys";
import { StorageError } from "./errors";
import {
  MAX_OBJECT_BYTES,
  type ObjectStorage,
  type StorageOptions,
  type StorageScope,
} from "./types";

function fsCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}
function mapError(error: unknown): never {
  if (error instanceof StorageError) throw error;
  const code = fsCode(error);
  throw new StorageError(
    code === "ENOENT"
      ? "NOT_FOUND"
      : code === "EEXIST"
        ? "CONFLICT"
        : ["EACCES", "EPERM"].includes(code ?? "")
          ? "FORBIDDEN"
          : "IO_ERROR",
  );
}
export class LocalStorage implements ObjectStorage {
  readonly directory: string;
  constructor(
    root: string,
    readonly scope: StorageScope,
  ) {
    const configured = resolve(root);
    if (existsSync(configured) && lstatSync(configured).isSymbolicLink())
      throw new StorageError("INVALID_KEY");
    // Canonicalize trusted parents (macOS /var is an OS symlink), then reject
    // symlinks inside storage itself rather than rejecting legitimate OS aliases.
    let ancestor = configured;
    while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    const canonical = resolve(
      realpathSync(ancestor),
      relative(ancestor, configured),
    );
    if (
      canonical
        .split(/[/\\]/)
        .some((part) =>
          ["public", ".next", ".git", "node_modules"].includes(part),
        )
    )
      throw new StorageError("INVALID_KEY");
    this.directory = join(canonical, scope);
  }
  private async path(key: string, create: boolean): Promise<string> {
    assertStorageKey(this.scope, key);
    const target = join(this.directory, ...key.split("/"));
    // Refuse symlinks in every existing ancestor, including the configured root.
    const parent = dirname(target),
      root = parse(parent).root;
    let current = root;
    for (const part of parent
      .slice(root.length)
      .split(/[/\\]/)
      .filter(Boolean)) {
      current = join(current, part);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || !info.isDirectory())
          throw new StorageError("INVALID_KEY");
      } catch (error) {
        if (fsCode(error) !== "ENOENT") throw error;
        if (!create) throw error;
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (failure) {
          if (fsCode(failure) !== "EEXIST") throw failure;
        }
        const info = await lstat(current);
        if (info.isSymbolicLink() || !info.isDirectory())
          throw new StorageError("INVALID_KEY");
      }
    }
    return target;
  }
  async put(key: string, data: Buffer, options: StorageOptions): Promise<void> {
    if (data.length === 0 || data.length > MAX_OBJECT_BYTES)
      throw new StorageError("TOO_LARGE");
    if (options.contentType !== keyContentType(key))
      throw new StorageError("INVALID_KEY");
    let temporary: string | undefined;
    try {
      const target = await this.path(key, true);
      try {
        if ((await lstat(target)).isSymbolicLink())
          throw new StorageError("INVALID_KEY");
      } catch (error) {
        if (fsCode(error) !== "ENOENT") throw error;
      }
      temporary = join(dirname(target), `.${randomUUID()}.tmp`);
      // Persistent objects are runtime data and must never enter standalone tracing.
      const file = await open(
        /* turbopackIgnore: true */ temporary,
        "wx",
        0o600,
      );
      try {
        await file.writeFile(data);
        await file.sync();
      } finally {
        await file.close();
      }
      if (options.ifAbsent) {
        await link(temporary, target);
        await unlink(temporary);
      } else await rename(temporary, target);
      temporary = undefined;
    } catch (error) {
      mapError(error);
    } finally {
      if (temporary) await unlink(temporary).catch(() => undefined);
    }
  }
  async get(key: string): Promise<Buffer> {
    try {
      const target = await this.path(key, false);
      const file = await open(
        /* turbopackIgnore: true */ target,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const info = await file.stat();
        if (!info.isFile()) throw new StorageError("INVALID_KEY");
        if (info.size > MAX_OBJECT_BYTES) throw new StorageError("TOO_LARGE");
        // Bound the read even if a trusted host process grows the file concurrently.
        const data = Buffer.alloc(
          Math.min(info.size + 1, MAX_OBJECT_BYTES + 1),
        );
        let length = 0;
        while (length < data.length) {
          const read = await file.read(
            data,
            length,
            data.length - length,
            null,
          );
          if (!read.bytesRead) break;
          length += read.bytesRead;
        }
        if (length > info.size || length > MAX_OBJECT_BYTES)
          throw new StorageError("TOO_LARGE");
        return data.subarray(0, length);
      } finally {
        await file.close();
      }
    } catch (error) {
      return mapError(error);
    }
  }
  async head(key: string) {
    const data = await this.get(key);
    return {
      size: data.length,
      contentType: keyContentType(key),
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  }
  async exists(key: string): Promise<boolean> {
    try {
      await this.head(key);
      return true;
    } catch (error) {
      if (error instanceof StorageError && error.code === "NOT_FOUND")
        return false;
      throw error;
    }
  }
  async delete(key: string): Promise<void> {
    try {
      const target = await this.path(key, false);
      if ((await lstat(target)).isSymbolicLink())
        throw new StorageError("INVALID_KEY");
      await unlink(target);
    } catch (error) {
      if (fsCode(error) === "ENOENT") return;
      mapError(error);
    }
  }
}
