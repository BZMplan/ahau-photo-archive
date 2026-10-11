"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PhotoMetadataEditor({
  photo,
}: {
  photo: {
    id: string;
    title: string;
    description: string | null;
    takenAt: string | null;
    location: string | null;
    tags: string[];
  };
}) {
  const [form, setForm] = useState({
    title: photo.title,
    description: photo.description ?? "",
    takenAt: photo.takenAt ?? "",
    location: photo.location ?? "",
    tags: photo.tags.join(", "),
  });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  async function save() {
    setState("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(readError(result));
      setState("saved");
      setMessage("已保存");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error ? error.message : "保存失败，请稍后重试。",
      );
    }
  }
  return (
    <section className="rounded-xl border p-5">
      <h2 className="font-medium">照片信息</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          标题
          <Input
            className="mt-2"
            value={form.title}
            maxLength={100}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
          />
        </label>
        <label className="text-sm">
          拍摄日期
          <Input
            className="mt-2"
            type="date"
            value={form.takenAt}
            onChange={(event) =>
              setForm({ ...form, takenAt: event.target.value })
            }
          />
        </label>
        <label className="text-sm">
          地点
          <Input
            className="mt-2"
            value={form.location}
            maxLength={100}
            onChange={(event) =>
              setForm({ ...form, location: event.target.value })
            }
          />
        </label>
        <label className="text-sm">
          标签（逗号分隔）
          <Input
            className="mt-2"
            value={form.tags}
            maxLength={1000}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
          />
        </label>
      </div>
      <label className="mt-4 block text-sm">
        描述
        <Textarea
          className="mt-2"
          value={form.description}
          maxLength={1000}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
      </label>
      <div className="mt-4 flex items-center gap-3">
        <Button disabled={state === "saving"} onClick={() => void save()}>
          {state === "saving" ? "保存中…" : "保存信息"}
        </Button>
        {message && (
          <span
            className={
              state === "error"
                ? "text-destructive text-sm"
                : "text-muted-foreground text-sm"
            }
          >
            {message}
          </span>
        )}
      </div>
    </section>
  );
}

function readError(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    value.error &&
    typeof value.error === "object" &&
    "message" in value.error
  )
    return String(value.error.message);
  return "保存失败，请稍后重试。";
}
