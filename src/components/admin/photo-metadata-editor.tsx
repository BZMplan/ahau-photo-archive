"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CatalogAutocomplete } from "@/components/catalog/catalog-autocomplete";
import type { CatalogOption } from "@/types/catalog";
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
    locationOption: CatalogOption | null;
    tagOptions: CatalogOption[];
  };
}) {
  const [form, setForm] = useState({
    title: photo.title,
    description: photo.description ?? "",
    takenAt: photo.takenAt ?? "",
  });
  const router = useRouter();
  const [location, setLocation] = useState<CatalogOption[]>(
    photo.locationOption ? [photo.locationOption] : [],
  );
  const [tags, setTags] = useState(photo.tagOptions);
  const [locationChanged, setLocationChanged] = useState(false);
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
          takenAt: form.takenAt || undefined,
          // Omission preserves unmapped historical text until an explicit selection/clear.
          ...(locationChanged ? { locationId: location[0]?.id ?? null } : {}),
          tagIds: tags.map((tag) => tag.id),
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(readError(result));
      setState("saved");
      setMessage("已保存");
      router.refresh();
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
            disabled={state === "saving"}
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
            disabled={state === "saving"}
            onChange={(event) =>
              setForm({ ...form, takenAt: event.target.value })
            }
          />
        </label>
        <div>
          <CatalogAutocomplete
            kind="locations"
            id="review-location"
            contextKey={photo.id}
            selected={location}
            disabled={state === "saving"}
            onChange={(options) => {
              setLocation(options);
              setLocationChanged(true);
            }}
          />
          {!photo.locationOption && photo.location && !locationChanged ? (
            <div className="text-muted-foreground mt-2 text-xs">
              历史地点：{photo.location}（尚未关联目录，保存其他字段时保留）
              <button
                type="button"
                disabled={state === "saving"}
                className="ml-2 min-h-9 underline"
                onClick={() => setLocationChanged(true)}
              >
                清除历史地点
              </button>
            </div>
          ) : null}
        </div>
        <CatalogAutocomplete
          kind="tags"
          id="review-tags"
          contextKey={photo.id}
          selected={tags}
          disabled={state === "saving"}
          onChange={setTags}
        />
      </div>
      <label className="mt-4 block text-sm">
        描述
        <Textarea
          className="mt-2"
          disabled={state === "saving"}
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
