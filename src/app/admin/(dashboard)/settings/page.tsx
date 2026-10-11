import type { Metadata } from "next";
import { AdminSettingsForms } from "@/components/admin-settings-forms";
import { requireAdminPage } from "@/server/auth/pages";
import { passwordChangeRequired } from "@/server/auth/bootstrap-policy";

export const metadata: Metadata = { title: "管理员设置" };
export default async function SettingsPage() {
  const admin = await requireAdminPage(true);
  const required = passwordChangeRequired(admin.id);
  return (
    <>
      <h1 className="text-2xl font-medium">管理员设置</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        管理当前账户的显示名称、登录邮箱和密码。
      </p>
      <AdminSettingsForms admin={admin} passwordChangeRequired={required} />
    </>
  );
}
