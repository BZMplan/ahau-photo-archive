"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminLoginForm({ initialError }: { initialError?: string }) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const submitting = useRef(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    const email = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "登录尝试过于频繁，请稍后再试。"
            : "邮箱或密码不正确，请重新输入。",
        );
        return;
      }
      const response = await fetch("/api/admin/me", { cache: "no-store" });
      if (!response.ok) {
        await authClient.signOut();
        setError(
          response.status === 403
            ? "此账号没有管理员权限。"
            : "会话已失效，请重新登录。",
        );
        return;
      }
      // A fixed destination and full navigation avoid open redirects and stale router state.
      window.location.replace("/admin");
    } catch {
      setError("暂时无法登录，请检查网络后重试。");
    } finally {
      setPassword("");
      setPending(false);
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={signIn} className="space-y-5" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-5">
        <legend className="sr-only">管理员邮箱和密码登录</legend>
        <div className="space-y-2">
          <Label htmlFor="email">管理员邮箱</Label>
          <Input
            required
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            placeholder="管理员邮箱"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密码</Label>
          <div className="relative">
            <Input
              required
              id="password"
              name="password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-11"
              aria-describedby={error ? "login-error" : undefined}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute top-0 right-0"
              aria-label={visible ? "隐藏密码" : "显示密码"}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
        {error ? (
          <p
            id="login-error"
            role="alert"
            className="text-destructive text-sm leading-6"
          >
            {error}
          </p>
        ) : null}
        <Button disabled={pending} type="submit" className="w-full">
          {pending ? (
            <>
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              正在登录…
            </>
          ) : (
            "登录后台"
          )}
        </Button>
      </fieldset>
    </form>
  );
}
