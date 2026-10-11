import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
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

export const metadata: Metadata = { title: "管理员登录" };

export default function LoginPage() {
  return (
    <div className="bg-muted/20 min-h-screen">
      <header className="flex items-center justify-between px-6 py-5">
        <Link
          className="text-muted-foreground hover:text-foreground text-sm"
          href="/"
        >
          ← 返回影像档案
        </Link>
        <ThemeToggle />
      </header>
      <main
        id="main-content"
        className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16"
      >
        <p className="text-muted-foreground text-center text-xs tracking-[0.2em]">
          AH AU / ADMINISTRATION
        </p>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">管理员登录</h1>
            </CardTitle>
            <CardDescription>
              登录与账号初始化将在下一阶段接入 Better Auth。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset disabled className="space-y-5">
              <legend className="sr-only">登录表单预览（尚未开放）</legend>
              <div className="space-y-2">
                <Label htmlFor="email">管理员邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="管理员邮箱"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="管理员密码"
                />
              </div>
              <Button disabled type="button" className="w-full">
                登录 · 尚未开放
              </Button>
            </fieldset>
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-center text-xs leading-6">
          后台骨架预览不包含真实管理数据或操作。
        </p>
        <Link
          href="/admin"
          className="text-center text-sm underline underline-offset-4"
        >
          查看后台布局预览
        </Link>
      </main>
    </div>
  );
}
