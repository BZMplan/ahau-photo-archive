"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main-content"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center"
    >
      <h1 className="text-2xl font-medium">档案暂时无法读取</h1>
      <p className="text-muted-foreground text-sm">
        请稍后重试，或返回首页继续浏览。
      </p>
      <Button onClick={reset} variant="outline">
        重新尝试
      </Button>
    </main>
  );
}
