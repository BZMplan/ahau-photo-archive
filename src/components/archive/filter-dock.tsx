"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Popover } from "radix-ui";
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  Leaf,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  Tags,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  archiveFilterHref,
  type ArchiveFilterKey,
} from "@/lib/archive-navigation";
import { seasonLabels, type ArchiveQuery } from "@/lib/validations/archive";
import { Input } from "@/components/ui/input";
import type { PublicTag } from "@/types/photo";

type Option = { value: string; label: string };
type Panel = {
  key: ArchiveFilterKey;
  label: string;
  icon: LucideIcon;
  options: Option[];
  searchable?: boolean;
};
const sortOptions: Option[] = [
  { value: "published-desc", label: "最新发布" },
  { value: "published-asc", label: "最早发布" },
  { value: "taken-desc", label: "拍摄时间最新" },
  { value: "taken-asc", label: "拍摄时间最早" },
];

function FilterChoices({
  panel,
  value,
  pending,
  onSelect,
}: {
  panel: Panel;
  value: string;
  pending: boolean;
  onSelect: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const name = useId();
  const options =
    panel.key === "sort"
      ? panel.options
      : [{ value: "", label: "全部" + panel.label }, ...panel.options];
  const matches = options.filter(
    (option) =>
      !option.value ||
      option.label
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <fieldset aria-busy={pending} className="min-w-0">
      <legend className="mb-3 text-sm font-medium">{panel.label}</legend>
      {panel.searchable ? (
        <Input
          aria-label={"搜索" + panel.label}
          placeholder={"搜索" + panel.label}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="mb-3 h-11 shadow-none"
        />
      ) : null}
      <div className="dock-options">
        {matches.map((option) => (
          <label key={option.value} className="dock-option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              aria-disabled={pending}
              onChange={() => {
                if (!pending) onSelect(option.value);
              }}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="dock-option-label">
              <span className="min-w-0 break-words">{option.label}</span>
              {value === option.value ? (
                <Check aria-hidden="true" className="size-4 shrink-0" />
              ) : null}
            </span>
          </label>
        ))}
        {!matches.length ? (
          <p className="text-muted-foreground p-3 text-sm">
            没有匹配的{panel.label}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

export function FilterDock({
  query,
  years,
  locations,
  tags,
}: {
  query: ArchiveQuery;
  years: string[];
  locations: string[];
  tags: PublicTag[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<
    ArchiveFilterKey | "filters" | "mobile-sort" | null
  >(null);
  const mobileTrigger = useRef<HTMLButtonElement | null>(null);
  const sheetId = useId();
  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 768px)");
    const close = () => setOpen(null);
    breakpoint.addEventListener("change", close);
    return () => breakpoint.removeEventListener("change", close);
  }, []);
  const panels: Panel[] = [
    {
      key: "year",
      label: "年份",
      icon: CalendarDays,
      options: years.map((value) => ({ value, label: value })),
    },
    {
      key: "season",
      label: "季节",
      icon: Leaf,
      options: Object.entries(seasonLabels).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      key: "location",
      label: "地点",
      icon: MapPin,
      searchable: true,
      options: locations.map((value) => ({ value, label: value })),
    },
    {
      key: "tag",
      label: "标签",
      icon: Tags,
      searchable: true,
      options: tags.map((tag) => ({ value: tag.slug, label: tag.name })),
    },
    { key: "sort", label: "排序", icon: ArrowDownUp, options: sortOptions },
  ];
  const activeCount = [
    query.year,
    query.season,
    query.location,
    query.tag,
  ].filter(Boolean).length;
  const canReset = activeCount > 0 || query.sort !== "published-desc";
  function navigate(href: string) {
    startTransition(() => router.push(href, { scroll: true }));
  }
  function select(panel: Panel, value: string, close: boolean) {
    if (close) setOpen(null);
    navigate(archiveFilterHref(query, panel.key, value));
  }
  function caption(panel: Panel) {
    const value = query[panel.key];
    return (
      panel.options.find((option) => option.value === value)?.label ||
      value ||
      panel.label
    );
  }
  const reset = (
    <button
      type="button"
      className="dock-button"
      aria-label="清除全部筛选和排序"
      disabled={pending || !canReset}
      onClick={() => {
        setOpen(null);
        navigate("/archive");
      }}
    >
      <RotateCcw aria-hidden="true" className="size-4" />
      <span>重置</span>
    </button>
  );

  return (
    <>
      <div
        className="filter-dock"
        role="group"
        aria-label="影像档案筛选"
        aria-busy={pending}
      >
        <div className="desktop-dock">
          {panels.map((panel) => (
            <Popover.Root
              key={panel.key}
              open={open === panel.key}
              onOpenChange={(value) => setOpen(value ? panel.key : null)}
            >
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="dock-button"
                  data-active={
                    panel.key === "sort"
                      ? query.sort !== "published-desc"
                      : Boolean(query[panel.key])
                  }
                  aria-label={panel.label + "：" + caption(panel)}
                >
                  <panel.icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="max-w-24 truncate">
                    {panel.key === "sort" && query.sort === "published-desc"
                      ? "排序"
                      : caption(panel)}
                  </span>
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="top"
                  sideOffset={16}
                  collisionPadding={{
                    top: 16,
                    left: 16,
                    right: 16,
                    bottom: 100,
                  }}
                  className="dock-popover"
                  aria-label={panel.label}
                >
                  <FilterChoices
                    panel={panel}
                    value={query[panel.key] || ""}
                    pending={pending}
                    onSelect={(value) => select(panel, value, true)}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ))}
          <span className="dock-divider" aria-hidden="true" />
          {reset}
        </div>
        <div className="mobile-dock">
          <Dialog.Root
            open={open === "filters" || open === "mobile-sort"}
            onOpenChange={(value) => setOpen(value ? "filters" : null)}
          >
            <Dialog.Trigger asChild>
              <button
                type="button"
                className="dock-button"
                data-active={activeCount > 0}
                aria-controls={sheetId}
                onClick={(event) => {
                  mobileTrigger.current = event.currentTarget;
                }}
              >
                <SlidersHorizontal aria-hidden="true" className="size-4" />
                筛选
                {activeCount ? (
                  <span className="dock-count">{activeCount}</span>
                ) : null}
              </button>
            </Dialog.Trigger>
            <button
              type="button"
              className="dock-button"
              data-active={query.sort !== "published-desc"}
              onClick={(event) => {
                mobileTrigger.current = event.currentTarget;
                setOpen("mobile-sort");
              }}
              aria-haspopup="dialog"
              aria-controls={sheetId}
              aria-expanded={open === "mobile-sort"}
            >
              <ArrowDownUp aria-hidden="true" className="size-4" />
              排序
            </button>
            <Dialog.Portal>
              <Dialog.Overlay className="dock-sheet-overlay" />
              <Dialog.Content
                id={sheetId}
                className="dock-sheet"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  mobileTrigger.current?.focus();
                }}
              >
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="text-xl font-medium">
                      筛选影像
                    </Dialog.Title>
                    <Dialog.Description className="text-muted-foreground mt-2 text-xs">
                      {activeCount ? "已筛选 " + activeCount + " 项 · " : ""}
                      {
                        sortOptions.find(
                          (option) => option.value === query.sort,
                        )?.label
                      }{" "}
                      · 选择后自动更新
                    </Dialog.Description>
                  </div>
                  <Dialog.Close
                    aria-label="关闭筛选面板"
                    className="hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-full"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </Dialog.Close>
                </div>
                <div className="space-y-6">
                  {(open === "mobile-sort" ? panels.slice(-1) : panels).map(
                    (panel) => (
                      <FilterChoices
                        key={panel.key}
                        panel={panel}
                        value={query[panel.key] || ""}
                        pending={pending}
                        onSelect={(value) => select(panel, value, false)}
                      />
                    ),
                  )}
                </div>
                <div className="mt-6 flex justify-between gap-3">
                  {reset}
                  <Dialog.Close className="bg-foreground text-background min-h-11 rounded-full px-6 text-sm">
                    查看影像
                  </Dialog.Close>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <span className="dock-divider" aria-hidden="true" />
          {reset}
        </div>
      </div>
      <p role="status" aria-live="polite" className="dock-status">
        {pending
          ? "正在更新影像…"
          : activeCount
            ? "已筛选 " + activeCount + " 项"
            : ""}
      </p>
    </>
  );
}
