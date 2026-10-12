// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CatalogAutocomplete } from "../../src/components/catalog/catalog-autocomplete";
import type { CatalogKind, CatalogOption } from "../../src/types/catalog";

const library = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "图书馆",
  slug: "library",
};
const east = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "图书馆东侧",
  slug: "east",
};
let container: HTMLDivElement, root: Root;
let selected: CatalogOption[];
const fetcher = vi.fn();
const emptySelection: CatalogOption[] = [];
function Harness({
  kind,
  contextKey = "a",
}: {
  kind: CatalogKind;
  contextKey?: string;
}) {
  const [values, setValues] = useState<Record<string, CatalogOption[]>>({});
  const current = values[contextKey] ?? emptySelection;
  useEffect(() => {
    selected = current;
  }, [current]);
  return createElement(CatalogAutocomplete, {
    kind,
    id: "search",
    contextKey,
    selected: current,
    onChange: (items) =>
      setValues((current) => ({ ...current, [contextKey]: items })),
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  fetcher.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { items: [library, east] } }),
  });
  vi.stubGlobal("fetch", fetcher);
  container = document.createElement("div");
  container.className = "public-site";
  const scroller = document.createElement("div");
  scroller.className = "submission-info-scroll";
  container.append(scroller);
  document.body.append(container);
  root = createRoot(scroller);
  selected = [];
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(kind: CatalogKind = "locations", contextKey = "a") {
  await act(async () =>
    root.render(createElement(Harness, { kind, contextKey })),
  );
}
const input = () => container.querySelector<HTMLInputElement>("#search")!;
async function type(value: string) {
  await act(async () => {
    input().focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 230));
  });
}
async function key(value: string, isComposing = false) {
  await act(async () => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: value,
        isComposing,
      }),
    );
  });
}
async function choose(name: string) {
  const option = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]'),
  ).find((item) => item.textContent === name);
  expect(option).toBeDefined();
  await act(async () => option!.click());
}
test("idle doesn't list all options; typing searches, portals outside scroll container and saves selected ID", async () => {
  await render();
  await act(async () => input().focus());
  expect(fetcher).not.toHaveBeenCalled();
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  await type("图");
  expect(container.textContent).toContain("正在搜索");
  await settle();
  expect(fetcher.mock.calls[0][0]).toContain("/api/locations?q=%E5%9B%BE");
  const panel = document.querySelector('[role="listbox"]')!;
  expect(panel.closest(".submission-info-scroll")).toBeNull();
  expect(input().getAttribute("aria-controls")).toBe(panel.id);
  await choose("图书馆");
  expect(selected).toEqual([library]);
  expect(input().value).toBe("图书馆");
  expect(document.activeElement).toBe(input());
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="清除拍摄地点"]')!
      .click(),
  );
  expect(selected).toEqual([]);
  expect(input().value).toBe("");
});
test("keyboard arrows/Enter select existing options, Escape closes, IME Enter doesn't select", async () => {
  await render();
  await type("图");
  await settle();
  await key("Enter", true);
  expect(selected).toEqual([]);
  await key("ArrowDown");
  expect(
    document.getElementById(input().getAttribute("aria-activedescendant")!)
      ?.textContent,
  ).toBe("图书馆东侧");
  await key("ArrowUp");
  await key("Enter");
  expect(selected).toEqual([library]);
  await type("图");
  await settle();
  await key("Escape");
  expect(input().getAttribute("aria-expanded")).toBe("false");
  await key("Enter");
  expect(selected).toEqual([]);
});
test("unmatched text remains search-only, Enter doesn't create a location or tag", async () => {
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({ data: { items: [] } }),
  });
  await render();
  await type("不存在");
  await settle();
  expect(container.textContent).toContain("没有找到匹配的地点。");
  await key("Enter");
  expect(selected).toEqual([]);
  await render("tags");
  await type("不存在");
  await settle();
  expect(container.textContent).toContain("没有找到匹配的标签。");
  await key("Enter");
  expect(selected).toEqual([]);
});
test("tags allow multiple chips, exclude selected options, clear search after choice and support removal", async () => {
  await render("tags");
  await type("图");
  await settle();
  await choose("图书馆");
  expect(input().value).toBe("");
  expect(selected).toEqual([library]);
  await type("图");
  await settle();
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  await key("Enter");
  expect(selected).toEqual([library, east]);
  await type("图");
  await settle();
  await key("Enter");
  expect(selected).toHaveLength(2);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="移除标签：图书馆"]')!
      .click(),
  );
  expect(selected).toEqual([east]);
});
test("network failure keeps text invalid and provides working retry", async () => {
  fetcher.mockRejectedValueOnce(new Error("offline"));
  await render();
  await type("图");
  await settle();
  expect(container.textContent).toContain("加载失败，请重试");
  await key("Enter");
  expect(selected).toEqual([]);
  await act(async () =>
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent === "重新搜索")!
      .click(),
  );
  await settle();
  await choose("图书馆");
  expect(selected[0].id).toBe(library.id);
});
test("switching photos retains independent selections and resets only search state", async () => {
  await render("tags", "a");
  await type("图");
  await settle();
  await choose("图书馆");
  await render("tags", "b");
  expect(selected).toEqual([]);
  expect(input().value).toBe("");
  await type("图");
  await settle();
  await choose("图书馆东侧");
  await render("tags", "a");
  expect(selected).toEqual([library]);
  await render("tags", "b");
  expect(selected).toEqual([east]);
});
test("old responses cannot replace results for the latest query", async () => {
  let finish: ((value: unknown) => void) | undefined;
  fetcher.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await type("旧");
  await settle();
  await type("新");
  await settle();
  await act(async () =>
    finish!({ ok: true, json: async () => ({ data: { items: [] } }) }),
  );
  expect(container.textContent).toContain("图书馆");
  expect(container.textContent).not.toContain("没有找到");
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});
