"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { catalogCreateSchema } from "@/lib/validations/catalog";
import type {
  AdminCatalogEntry,
  AdminCatalogPage,
  CatalogKind,
} from "@/types/catalog";

export function CatalogManagement({
  kind,
  data,
  query,
}: {
  kind: CatalogKind;
  data: AdminCatalogPage;
  query: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<
    AdminCatalogEntry | null | undefined
  >();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ error: false, message: "" });
  const label = kind === "locations" ? "地点" : "标签";
  const href = (page: number) =>
    `/admin/${kind}?${new URLSearchParams({ q: query, page: String(page) })}`;
  function refresh(message: string) {
    setFeedback({ error: false, message });
    startTransition(() => router.refresh());
  }
  async function toggle(item: AdminCatalogEntry) {
    setBusy(true);
    try {
      await writeCatalog(kind, item.id, { isActive: !item.isActive });
      refresh(`${item.name}已${item.isActive ? "禁用" : "恢复"}。`);
    } catch (error) {
      setFeedback({ error: true, message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">{label}管理</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            统一维护投稿选项。禁用后历史照片保留原有关系。
          </p>
        </div>
        <Button disabled={busy || pending} onClick={() => setEditing(null)}>
          新增{label}
        </Button>
      </div>
      <form
        className="my-6 flex gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          startTransition(() =>
            router.push(
              `/admin/${kind}?${new URLSearchParams({ q: String(form.get("q") ?? "").trim() })}`,
            ),
          );
        }}
      >
        <Label className="sr-only" htmlFor="catalog-search">
          搜索{label}
        </Label>
        <Input
          key={query}
          id="catalog-search"
          name="q"
          defaultValue={query}
          maxLength={100}
          placeholder={`搜索${label}名称…`}
        />
        <Button variant="outline" disabled={pending}>
          搜索
        </Button>
      </form>
      {feedback.message ? (
        <p
          role={feedback.error ? "alert" : "status"}
          className={`mb-4 text-sm ${feedback.error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {feedback.message}
        </p>
      ) : null}
      {pending ? (
        <p role="status" className="mb-3 text-sm">
          正在刷新列表…
        </p>
      ) : null}
      <p className="text-muted-foreground mb-3 text-xs">
        共 {data.total} 个{label}
      </p>
      <div className="divide-y rounded-lg border">
        {data.items.length ? (
          data.items.map((item) => (
            <article
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <h2 className="font-medium break-words">
                  {item.name}{" "}
                  <span className="text-muted-foreground text-xs font-normal">
                    {item.isActive ? "启用" : "已禁用"}
                  </span>
                </h2>
                <p className="text-muted-foreground mt-1 text-sm break-words">
                  {item.description || "暂无说明"}
                </p>
                <p className="text-muted-foreground mt-2 text-xs break-all">
                  {item.photoCount} 张关联照片 · {item.slug} · 排序{" "}
                  {item.sortOrder}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  disabled={busy || pending}
                  onClick={() => setEditing(item)}
                >
                  编辑
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || pending}
                  onClick={() => void toggle(item)}
                >
                  {item.isActive ? "禁用" : "恢复"}
                </Button>
              </div>
            </article>
          ))
        ) : (
          <p className="text-muted-foreground p-8 text-center text-sm">
            {query ? "没有找到匹配的选项。" : `尚未创建${label}。`}
          </p>
        )}
      </div>
      <nav
        aria-label={`${label}列表分页`}
        className="mt-5 flex items-center gap-4 text-sm"
      >
        {data.page > 1 ? <Link href={href(data.page - 1)}>上一页</Link> : null}
        <span>
          第 {data.page} / {data.pageCount} 页
        </span>
        {data.page < data.pageCount ? (
          <Link href={href(data.page + 1)}>下一页</Link>
        ) : null}
      </nav>
      <Dialog.Root
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(undefined);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            className="bg-background fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-6 shadow-lg"
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (busy) event.preventDefault();
            }}
          >
            <Dialog.Title className="text-lg font-medium">
              {editing ? "编辑" : "新增"}
              {label}
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground mt-2 text-sm">
              名称不可重复。标识留空时自动生成；已被照片使用的标识保持稳定。
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={busy}
                aria-label="关闭表单"
                className="absolute top-3 right-3 flex size-9 items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
            {editing !== undefined ? (
              <CatalogForm
                key={editing?.id ?? "new"}
                kind={kind}
                item={editing}
                busy={busy}
                onSave={async (value) => {
                  setBusy(true);
                  try {
                    await writeCatalog(kind, editing?.id, value);
                    setEditing(undefined);
                    refresh(`${label}已保存。`);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

function CatalogForm({
  kind,
  item,
  busy,
  onSave,
}: {
  kind: CatalogKind;
  item: AdminCatalogEntry | null;
  busy: boolean;
  onSave: (value: unknown) => Promise<void>;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const data = new FormData(event.currentTarget);
        const slug = item?.photoCount
          ? item.slug
          : String(data.get("slug") ?? "").trim();
        const parsed = catalogCreateSchema.safeParse({
          name: data.get("name"),
          description: data.get("description"),
          ...(slug ? { slug } : {}),
          isActive: data.get("isActive") === "on",
          sortOrder: Number(data.get("sortOrder")),
        });
        if (!parsed.success) {
          setError(
            "请检查名称、标识和排序：名称不能为空，排序必须为非负整数。",
          );
          return;
        }
        try {
          await onSave(parsed.data);
        } catch (error) {
          setError(errorMessage(error));
        }
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="catalog-name">名称 *</Label>
          <Input
            id="catalog-name"
            name="name"
            required
            maxLength={100}
            defaultValue={item?.name ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="catalog-description">说明</Label>
          <Textarea
            id="catalog-description"
            name="description"
            maxLength={1000}
            defaultValue={item?.description ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="catalog-slug">标识（选填）</Label>
          <Input
            id="catalog-slug"
            name="slug"
            maxLength={100}
            defaultValue={item?.slug ?? ""}
            disabled={Boolean(item?.photoCount)}
            placeholder="留空自动生成唯一标识"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="catalog-sort">排序权重</Label>
          <Input
            id="catalog-sort"
            name="sortOrder"
            type="number"
            min={0}
            max={1000000}
            step={1}
            defaultValue={item?.sortOrder ?? 0}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={item?.isActive ?? true}
          />
          启用，可用于新投稿
        </label>
      </fieldset>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "保存中…" : `保存${kind === "locations" ? "地点" : "标签"}`}
      </Button>
    </form>
  );
}
async function writeCatalog(
  kind: CatalogKind,
  id: string | undefined,
  value: unknown,
) {
  const response = await fetch(`/api/admin/${kind}${id ? "/" + id : ""}`, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      result.error &&
      typeof result.error === "object" &&
      "message" in result.error &&
      typeof result.error.message === "string"
    )
      throw new Error(result.error.message);
    throw new Error("操作失败，请稍后重试。");
  }
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}
