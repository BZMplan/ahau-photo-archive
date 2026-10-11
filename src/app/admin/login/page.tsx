import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminLoginForm } from "@/components/admin-login-form";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPageSession } from "@/server/auth/pages";
import { isAdminSession } from "@/server/auth/admin";

export const metadata: Metadata = { title: "管理员登录" };
export default async function LoginPage() {
  const session = await getPageSession();
  if (isAdminSession(session)) redirect("/admin");
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
              使用已初始化的管理员账号进入影像档案后台。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminLoginForm
              initialError={
                session
                  ? "当前账号没有管理员权限，请使用管理员账号登录。"
                  : undefined
              }
            />
            {session ? (
              <div className="mt-5 border-t pt-5">
                <AdminLogoutButton />
              </div>
            ) : null}
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-center text-xs leading-6">
          仅对档案管理员开放。游客浏览与未来匿名投稿无需账号。
        </p>
      </main>
    </div>
  );
}
