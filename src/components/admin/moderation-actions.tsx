"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Status = "pending" | "approved" | "rejected" | "hidden";

export function ModerationActions({
  photoId,
  status,
}: {
  photoId: string;
  status: Status;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  async function act(action: string, body?: unknown) {
    setLoading(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/${status === "pending" ? "reviews" : "photos"}/${photoId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          result.error &&
          typeof result.error === "object" &&
          "message" in result.error
            ? String(result.error.message)
            : "操作失败，请刷新后重试。";
        throw new Error(message);
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "操作失败，请稍后重试。",
      );
    } finally {
      setLoading(null);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <Button disabled={!!loading} onClick={() => void act("approve")}>
            {loading === "approve" ? "批准中…" : "批准发布"}
          </Button>
        )}
        {status === "pending" && (
          <details>
            <summary className="border-input hover:bg-muted inline-flex h-8 cursor-pointer items-center rounded-lg border px-3 text-sm">
              拒绝
            </summary>
            <div className="bg-background mt-2 w-72 rounded-lg border p-3 shadow-sm">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1000}
                placeholder="可选：填写拒绝原因"
              />
              <Button
                className="mt-2"
                variant="destructive"
                disabled={!!loading}
                onClick={() => void act("reject", { reason })}
              >
                确认拒绝
              </Button>
            </div>
          </details>
        )}
        {status === "approved" && (
          <Button
            variant="destructive"
            disabled={!!loading}
            onClick={() =>
              window.confirm(
                "确定要撤回这张照片吗？撤回后它将不再出现在公开档案中。",
              ) && void act("hide")
            }
          >
            {loading === "hide" ? "撤回中…" : "撤回发布"}
          </Button>
        )}
        {status === "hidden" && (
          <Button disabled={!!loading} onClick={() => void act("restore")}>
            {loading === "restore" ? "恢复中…" : "恢复发布"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
