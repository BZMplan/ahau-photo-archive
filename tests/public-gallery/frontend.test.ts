import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { FilterDock } from "../../src/components/archive/filter-dock";
import HomePage from "../../src/app/(public)/page";
import { PhotoGrid } from "../../src/components/gallery/photo-grid";
import { PhotoLightbox } from "../../src/components/gallery/photo-lightbox";
import { ArchivePagination } from "../../src/components/archive/archive-pagination";
import {
  archiveFilterHref,
  archiveReturnHref,
} from "../../src/lib/archive-navigation";
import { parseArchiveQuery } from "../../src/lib/validations/archive";
import type { PublicPhoto } from "../../src/types/photo";

vi.mock("../../src/server/services/public-photos", () => ({
  listPublicPhotos: () => {
    throw new Error("Landing must not query photos");
  },
  getPublishedPhotos: () => {
    throw new Error("Landing must not query photos");
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const photo: PublicPhoto = {
  id: "approved-photo",
  title: "校园晨光",
  description: null,
  location: "图书馆",
  takenAt: "2025-10-01",
  publishedAt: null,
  attribution: "摄影者",
  width: 1200,
  height: 800,
  thumbnailUrl: "/api/images/photos/approved/thumbnail.webp",
  displayUrl: "/api/images/photos/approved/display.webp",
  tags: [],
  tagSlugs: [],
};

test("landing renders school identity and archive/submission actions without photos", () => {
  const html = renderToStaticMarkup(createElement(HomePage));
  expect(html).toContain("安徽农业大学影像档案馆");
  expect(html).toContain("AHAU");
  expect(html).toContain("Photo Archive");
  expect(html).toContain("Anhui Agricultural University");
  expect(html).toContain('href="/archive"');
  expect(html).toContain('href="/submit"');
  expect(html).toContain("浏览影像档案");
  expect(html).toContain("分享校园影像");
  expect(html).not.toMatch(/<img\b|masonry-gallery|\/api\/images\//);
});

test.each([
  [1200, 800, "1.5"],
  [800, 1200, "0.6666666666666666"],
  [800, 800, "1"],
  [400, 4000, "0.1"],
])(
  "gallery reserves the real aspect ratio for %d × %d",
  (width, height, ratio) => {
    const html = renderToStaticMarkup(
      createElement(PhotoGrid, { photos: [{ ...photo, width, height }] }),
    );
    expect(html).toContain("aspect-ratio:" + ratio);
    expect(html).toContain('width="' + width + '"');
    expect(html).toContain('height="' + height + '"');
    expect(html).toContain("object-contain");
    expect(html).not.toMatch(/object-cover|rounded-(sm|md|lg|xl|2xl)|scale-/);
  },
);

test("wall uses thumbnails, lazy loading after first image and safe return links", () => {
  const html = renderToStaticMarkup(
    createElement(PhotoGrid, {
      photos: [photo, { ...photo, id: "second" }],
      archiveReturn: "/archive?year=2025&page=2",
    }),
  );
  expect(html).toContain('loading="eager"');
  expect(html).toContain('loading="lazy"');
  expect(html.match(/src="[^"]+"/g)).toEqual([
    'src="' + photo.thumbnailUrl + '"',
    'src="' + photo.thumbnailUrl + '"',
  ]);
  expect(html).toContain(
    'href="/photo/approved-photo?from=%2Farchive%3Fyear%3D2025%26page%3D2"',
  );
  expect(html).not.toMatch(/src="[^"<>]*(originals|previews|display\.webp)/);
});

test("details keep the uncropped display image and lightbox with square corners", () => {
  const html = renderToStaticMarkup(createElement(PhotoLightbox, { photo }));
  expect(html).toContain('src="' + photo.displayUrl + '"');
  expect(html).toContain("<dialog");
  expect(html).toContain("object-contain");
  expect(html).not.toMatch(/rounded-(sm|lg|xl|2xl)|object-cover/);
});

describe("shared URL navigation", () => {
  const selected = parseArchiveQuery({
    year: "2025",
    season: "autumn",
    location: "Campus Library",
    tag: "architecture",
    sort: "taken-desc",
    page: 3,
    pageSize: 12,
  });
  test.each(["year", "season", "location", "tag", "sort"] as const)(
    "changing %s retains other filters and resets pagination",
    (key) => {
      const href = archiveFilterHref(
        selected,
        key,
        key === "sort" ? "published-asc" : "",
      );
      const params = new URL(href, "https://archive.invalid").searchParams;
      expect(params.has("page")).toBe(false);
      expect(params.get("pageSize")).toBe("12");
      for (const other of [
        "year",
        "season",
        "location",
        "tag",
        "sort",
      ] as const) {
        if (other !== key) expect(params.get(other)).toBe(selected[other]);
      }
      expect(params.get(key)).toBe(key === "sort" ? "published-asc" : null);
    },
  );
  test("pagination preserves every filter and sort", () => {
    const html = renderToStaticMarkup(
      createElement(ArchivePagination, {
        query: selected,
        result: { items: [], page: 3, pageSize: 12, pageCount: 5, total: 60 },
      }),
    );
    expect(html).toContain("page=2");
    expect(html).toContain("page=4");
    for (const value of [
      "year=2025",
      "season=autumn",
      "location=campus+library",
      "tag=architecture",
      "sort=taken-desc",
      "pageSize=12",
    ])
      expect(html).toContain(value);
  });
  test("detail return preserves valid local filters and rejects unsafe paths", () => {
    expect(
      archiveReturnHref(
        "/archive?year=2025&season=autumn&page=2&privateKey=secret",
      ),
    ).toBe("/archive?year=2025&season=autumn&page=2");
    for (const value of [
      "https://evil.invalid/archive",
      "//evil.invalid/archive",
      "javascript:alert(1)",
      "/admin",
      "http://[",
      undefined,
      ["/archive"],
    ])
      expect(archiveReturnHref(value)).toBe("/archive");
  });
});

test("empty and filtered states offer the appropriate next action", () => {
  const empty = renderToStaticMarkup(createElement(PhotoGrid, { photos: [] }));
  expect(empty).toContain("尚未收录校园影像");
  expect(empty).toContain('href="/submit"');
  const filtered = renderToStaticMarkup(
    createElement(PhotoGrid, {
      photos: [],
      filtered: true,
      emptyTitle: "没有找到符合条件的影像。",
    }),
  );
  expect(filtered).toContain('href="/archive"');
  expect(filtered).toContain("清除筛选");
});

test("Dock derives active captions from the shared query and dynamic facet labels", () => {
  const html = renderToStaticMarkup(
    createElement(FilterDock, {
      query: parseArchiveQuery({
        year: "2031",
        season: "autumn",
        location: "校园北门",
        tag: "campus-light",
        sort: "taken-asc",
      }),
      years: ["2031"],
      locations: ["校园北门"],
      tags: [{ name: "校园光影", slug: "campus-light", count: 3 }],
    }),
  );
  expect(html).toContain('aria-label="年份：2031"');
  expect(html).toContain('aria-label="季节：秋季"');
  expect(html).toContain('aria-label="地点：校园北门"');
  expect(html).toContain('aria-label="标签：校园光影"');
  expect(html).toContain('aria-label="排序：拍摄时间最早"');
  expect(html).toContain("已筛选 4 项");
  expect(html).toContain('aria-label="清除全部筛选和排序"');
  expect(html).not.toContain("应用筛选");
});
