import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center"
    >
      <p className="text-muted-foreground text-xs tracking-widest">
        404 / ARCHIVE
      </p>
      <h1 className="text-2xl font-medium">暂未找到这份影像</h1>
      <p className="text-muted-foreground text-sm">
        照片可能尚未公开，或链接已失效。
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        返回影像档案
      </Link>
    </main>
  );
}
