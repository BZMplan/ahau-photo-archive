"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { X } from "lucide-react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { catalogIdSchema, MAX_PHOTO_TAGS } from "@/lib/validations/catalog";
import type { CatalogKind, CatalogOption } from "@/types/catalog";

const responseSchema = z.object({
  data: z.object({
    items: z
      .array(
        z.object({
          id: catalogIdSchema,
          name: z.string().min(1),
          slug: z.string(),
        }),
      )
      .max(20),
  }),
});
type SearchState = {
  key: string;
  status: "loading" | "success" | "empty" | "error";
  items: CatalogOption[];
};
export function CatalogAutocomplete({
  kind,
  id,
  contextKey,
  selected,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  kind: CatalogKind;
  id: string;
  contextKey: string;
  selected: CatalogOption[];
  onChange: (items: CatalogOption[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const multiple = kind === "tags",
    label = multiple ? "标签" : "拍摄地点";
  const listId = useId(),
    inputRef = useRef<HTMLInputElement>(null),
    anchorRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement>();
  const [collisionBoundary, setCollisionBoundary] = useState<HTMLElement>();
  const setAnchor = useCallback((node: HTMLDivElement | null) => {
    anchorRef.current = node;
    if (node) {
      setPortalContainer(
        node.closest<HTMLElement>(".public-site") ?? undefined,
      );
      setCollisionBoundary(
        node.closest<HTMLElement>(".submission-info-scroll") ?? undefined,
      );
    }
  }, []);
  const [draft, setDraft] = useState({
    contextKey,
    query: "",
    open: false,
    highlight: "",
  });
  // Reset only search UI on photo changes; selected IDs are owned by the parent draft.
  if (draft.contextKey !== contextKey)
    setDraft({ contextKey, query: "", open: false, highlight: "" });
  const current =
    draft.contextKey === contextKey
      ? draft
      : { contextKey, query: "", open: false, highlight: "" };
  const [retry, setRetry] = useState(0);
  const query = current.query.trim();
  const key = JSON.stringify([kind, contextKey, query, retry]);
  const [result, setResult] = useState<SearchState>({
    key: "",
    status: "empty",
    items: [],
  });
  useEffect(() => {
    if (!query) return;
    let alive = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResult({ key, status: "loading", items: [] });
      try {
        const response = await fetch(
          `/api/${kind}?q=${encodeURIComponent(query)}&limit=20`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error("Catalog search failed");
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("Invalid catalog response");
        if (alive)
          setResult({
            key,
            status: parsed.data.data.items.length ? "success" : "empty",
            items: parsed.data.data.items,
          });
      } catch {
        if (alive) setResult({ key, status: "error", items: [] });
      }
    }, 180);
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, key, kind]);
  const matching = result.key === key ? result.items : [];
  const options = matching.filter(
    (option) => !selected.some((value) => value.id === option.id),
  );
  const status = !query
    ? "idle"
    : result.key === key
      ? result.status
      : "loading";
  const highlighted =
    options.find((option) => option.id === current.highlight) ?? options[0];
  const open = Boolean(query && current.open && !disabled);
  const inputValue =
    !multiple && !current.query && selected[0]
      ? selected[0].name
      : current.query;
  const limit = multiple && selected.length >= MAX_PHOTO_TAGS;
  useEffect(() => {
    if (open && highlighted)
      document
        .getElementById(listId + "-" + highlighted.id)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, highlighted, listId]);
  function choose(option: CatalogOption) {
    if (disabled || limit) return;
    onChange(multiple ? [...selected, option] : [option]);
    setDraft({ contextKey, query: "", open: false, highlight: "" });
    inputRef.current?.focus();
  }
  return (
    <div className="catalog-combobox min-w-0 space-y-2">
      <Label htmlFor={id}>{label}（选填）</Label>
      {multiple && selected.length ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((option) => (
            <span
              key={option.id}
              className="bg-muted inline-flex max-w-full items-center gap-1 rounded-full px-3 py-1 text-xs"
            >
              <span className="min-w-0 break-words">
                {option.name}
                {option.isActive === false ? "（已禁用）" : ""}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={"移除标签：" + option.name}
                className="flex size-7 shrink-0 items-center justify-center rounded-full"
                onClick={() =>
                  onChange(selected.filter((value) => value.id !== option.id))
                }
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Popover.Root
        open={open}
        onOpenChange={(value) => setDraft({ ...current, open: value })}
      >
        <Popover.Anchor asChild>
          <div ref={setAnchor} className="relative">
            <Input
              ref={inputRef}
              id={id}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-activedescendant={
                open && highlighted ? listId + "-" + highlighted.id : undefined
              }
              aria-invalid={invalid}
              aria-describedby={describedBy}
              autoComplete="off"
              placeholder={multiple ? "搜索照片标签..." : "搜索拍摄地点..."}
              value={inputValue}
              disabled={disabled || limit}
              maxLength={100}
              className={!multiple && selected.length ? "pr-11" : ""}
              onFocus={() => {
                if (query) setDraft({ ...current, open: true });
              }}
              onChange={(event) => {
                if (!multiple && selected.length) onChange([]);
                setDraft({
                  contextKey,
                  query: event.target.value,
                  open: Boolean(event.target.value.trim()),
                  highlight: "",
                });
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft({ ...current, open: false });
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (open && highlighted) choose(highlighted);
                }
                if (
                  (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                  query &&
                  options.length
                ) {
                  event.preventDefault();
                  const index = options.findIndex(
                      (option) => option.id === highlighted?.id,
                    ),
                    direction = event.key === "ArrowDown" ? 1 : -1;
                  const next = current.open
                    ? (index + direction + options.length) % options.length
                    : 0;
                  setDraft({
                    ...current,
                    open: true,
                    highlight: options[next].id,
                  });
                }
              }}
            />
            {!multiple && selected.length ? (
              <button
                type="button"
                disabled={disabled}
                aria-label="清除拍摄地点"
                className="text-muted-foreground absolute inset-y-0 right-1 flex w-9 items-center justify-center"
                onClick={() => {
                  onChange([]);
                  setDraft({
                    contextKey,
                    query: "",
                    open: false,
                    highlight: "",
                  });
                  inputRef.current?.focus();
                }}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>
        </Popover.Anchor>
        <Popover.Portal container={portalContainer}>
          <Popover.Content
            id={listId}
            role="listbox"
            aria-label={multiple ? "匹配的标签" : "匹配的地点"}
            className="catalog-suggestions bg-popover text-popover-foreground z-50 overflow-y-auto rounded-lg border p-1 shadow-lg"
            side="bottom"
            sideOffset={6}
            align="start"
            collisionPadding={8}
            updatePositionStrategy="always"
            hideWhenDetached
            collisionBoundary={collisionBoundary}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => {
              if (
                event.target instanceof Node &&
                anchorRef.current?.contains(event.target)
              )
                event.preventDefault();
            }}
          >
            {status === "loading" ? (
              <p role="status" className="text-muted-foreground p-3 text-xs">
                正在搜索{label}…
              </p>
            ) : status === "error" ? (
              <div role="status" className="p-3 text-xs">
                <p>{label}加载失败，请重试。</p>
                <button
                  type="button"
                  className="mt-2 min-h-9 underline"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setRetry((value) => value + 1)}
                >
                  重新搜索
                </button>
              </div>
            ) : options.length ? (
              options.map((option) => (
                <button
                  key={option.id}
                  id={listId + "-" + option.id}
                  type="button"
                  role="option"
                  aria-selected={highlighted?.id === option.id}
                  tabIndex={-1}
                  className="catalog-option aria-selected:bg-muted flex min-h-11 w-full items-center rounded-md px-3 py-2 text-left text-sm break-words"
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerMove={() =>
                    setDraft({ ...current, highlight: option.id })
                  }
                  onClick={() => choose(option)}
                >
                  {option.name}
                </button>
              ))
            ) : (
              <p role="status" className="text-muted-foreground p-3 text-xs">
                没有找到匹配的{multiple ? "标签" : "地点"}。
              </p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {!multiple && selected[0]?.isActive === false ? (
        <p className="text-muted-foreground text-xs">
          当前历史地点已禁用，可保留已有关系或选择其他启用地点。
        </p>
      ) : null}
      {limit ? (
        <p className="text-muted-foreground text-xs">
          最多选择 {MAX_PHOTO_TAGS} 个标签，可先移除标签再选择。
        </p>
      ) : null}
    </div>
  );
}
