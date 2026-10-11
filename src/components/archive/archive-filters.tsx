import Link from "next/link";
import type { ArchiveQuery } from "@/lib/validations/archive";
import { seasonLabels } from "@/lib/validations/archive";
import type { PublicTag } from "@/types/photo";

export function ArchiveFilters({
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
  return (
    <form
      key={JSON.stringify(query)}
      action="/archive"
      method="get"
      className="bg-muted/30 grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <input type="hidden" name="pageSize" value={query.pageSize} />
      <label className="grid gap-2 text-xs">
        <span className="text-muted-foreground">拍摄年份</span>
        <select
          name="year"
          defaultValue={query.year ?? ""}
          className="bg-background min-h-11 rounded-md border px-3 text-sm"
        >
          <option value="">全部年份</option>
          {query.year && !years.includes(query.year) ? (
            <option value={query.year}>{query.year}（暂无公开影像）</option>
          ) : null}
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-xs">
        <span className="text-muted-foreground">拍摄季节</span>
        <select
          name="season"
          defaultValue={query.season ?? ""}
          className="bg-background min-h-11 rounded-md border px-3 text-sm"
        >
          <option value="">全部季节</option>
          {Object.entries(seasonLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-xs">
        <span className="text-muted-foreground">校园地点</span>
        <select
          name="location"
          defaultValue={query.location ?? ""}
          className="bg-background min-h-11 rounded-md border px-3 text-sm"
        >
          <option value="">全部地点</option>
          {query.location && !locations.includes(query.location) ? (
            <option value={query.location}>
              {query.location}（暂无公开影像）
            </option>
          ) : null}
          {locations.map((location) => (
            <option key={location} value={location}>
              {location}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-xs">
        <span className="text-muted-foreground">照片标签</span>
        <select
          name="tag"
          defaultValue={query.tag ?? ""}
          className="bg-background min-h-11 rounded-md border px-3 text-sm"
        >
          <option value="">全部标签</option>
          {query.tag && !tags.some((tag) => tag.slug === query.tag) ? (
            <option value={query.tag}>{query.tag}（暂无公开影像）</option>
          ) : null}
          {tags.map((tag) => (
            <option key={tag.slug} value={tag.slug}>
              {tag.name}（{tag.count}）
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-xs">
        <span className="text-muted-foreground">排序方式</span>
        <select
          name="sort"
          defaultValue={query.sort}
          className="bg-background min-h-11 rounded-md border px-3 text-sm"
        >
          <option value="published-desc">最新发布</option>
          <option value="published-asc">最早发布</option>
          <option value="taken-desc">拍摄时间从新到旧</option>
          <option value="taken-asc">拍摄时间从旧到新</option>
        </select>
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
        <button
          type="submit"
          className="bg-foreground text-background min-h-11 rounded-md px-4 text-sm font-medium"
        >
          应用筛选
        </button>
        <Link
          href="/archive"
          className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center rounded-md border px-4 text-sm"
        >
          清除筛选
        </Link>
      </div>
    </form>
  );
}
