"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminUser } from "@/types/admin";

type Action = "name" | "email" | "password";

export function AdminSettingsForms({
  admin,
  passwordChangeRequired,
}: {
  admin: AdminUser;
  passwordChangeRequired: boolean;
}) {
  const [pending, setPending] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>, action: Action) {
    event.preventDefault();
    if (pending) return;
    setPending(action);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch(
        `/api/admin/settings/${action === "name" ? "profile" : action}`,
        {
          method: action === "name" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(result.error?.message || "保存失败，请稍后重试。");
        return;
      }
      form.reset();
      if (action === "password") {
        window.location.replace("/admin/login");
        return;
      }
      setMessage("保存成功。");
      window.location.reload();
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-2">
      {passwordChangeRequired ? (
        <p
          className="border-primary/40 bg-primary/5 col-span-full rounded-md border p-4 text-sm"
          role="alert"
        >
          当前使用自动生成的初始密码。请先修改密码，之后才能使用后台其他功能；初始凭据文件会失效。
        </p>
      ) : null}
      {error ? (
        <p className="text-destructive col-span-full text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="col-span-full text-sm" role="status">
          {message}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>账户资料</CardTitle>
          <CardDescription>当前登录邮箱：{admin.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => submit(event, "name")}
            className="space-y-4"
          >
            <fieldset
              disabled={!!pending || passwordChangeRequired}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="settings-name">显示名称</Label>
                <Input
                  id="settings-name"
                  name="name"
                  defaultValue={admin.name}
                  required
                  maxLength={80}
                />
              </div>
              <Button type="submit">保存名称</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>登录邮箱</CardTitle>
          <CardDescription>
            修改前须验证当前密码。项目未配置邮件服务，不会发送验证邮件。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => submit(event, "email")}
            className="space-y-4"
          >
            <fieldset
              disabled={!!pending || passwordChangeRequired}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="settings-email">新邮箱</Label>
                <Input
                  id="settings-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-email-password">当前密码</Label>
                <Input
                  id="settings-email-password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit">修改邮箱</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>
            新密码至少 12
            个字符，包含字母和数字。成功后撤销其他会话，并重新登录。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => submit(event, "password")}
            className="grid gap-4 sm:max-w-md"
          >
            <fieldset disabled={!!pending} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-current-password">当前密码</Label>
                <Input
                  id="settings-current-password"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-new-password">新密码</Label>
                <Input
                  id="settings-new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-confirm-password">确认新密码</Label>
                <Input
                  id="settings-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </div>
              <Button type="submit">修改密码</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
