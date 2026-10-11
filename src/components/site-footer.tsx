import Link from "next/link";
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-4 px-6 py-7 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <p>
          AHAU Photo Archive <span className="mx-2">/</span>{" "}
          为校园留一份影像记忆
        </p>
        <div className="flex gap-6">
          <Link href="/submit" className="hover:text-foreground">
            照片投稿
          </Link>
          <span>作品版权归摄影者所有</span>
          <Link className="hover:text-foreground" href="/admin/login">
            管理员入口
          </Link>
        </div>
      </div>
    </footer>
  );
}
