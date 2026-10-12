// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SubmissionForm } from "../../src/components/submit/submission-form";
import {
  MAX_IMAGE_BYTES,
  MAX_SUBMISSION_PHOTOS,
} from "../../src/lib/submission-limits";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
    onLoad,
    onError,
  }: {
    src: string;
    alt: string;
    className: string;
    onLoad?: () => void;
    onError?: () => void;
  }) => createElement("img", { src, alt, className, onLoad, onError }),
}));
vi.mock("../../src/components/submit/turnstile-widget", () => ({
  TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) =>
    createElement(
      "button",
      { type: "button", onClick: () => onToken("mock-token") },
      "测试安全验证",
    ),
}));

let container: HTMLDivElement;
let root: Root;
const observers: Observer[] = [];
const sizeObservers: SizeObserver[] = [];
let reducedMotion = false;
let mobile = false;
let visibleViewport: EventTarget & { height: number; scale: number };
const createURL = vi.fn();
const revokeURL = vi.fn();
const scroll = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  this.scrollTop = options.top ?? 0;
});
const intoView = vi.fn();
class Observer {
  targets = new Set<Element>();
  constructor(readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe(element: Element) {
    this.targets.add(element);
  }
  disconnect() {
    this.targets.clear();
  }
  emit(index: number, ratio = 1) {
    const target = Array.from(this.targets)[index];
    if (!target) throw new Error("Missing observed photo");
    this.callback(
      [
        {
          target,
          intersectionRatio: ratio,
          isIntersecting: ratio > 0,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver,
    );
  }
}
class SizeObserver {
  constructor(readonly callback: ResizeObserverCallback) {
    sizeObservers.push(this);
  }
  observe() {}
  disconnect() {}
}

beforeEach(async () => {
  reducedMotion = false;
  mobile = false;
  visibleViewport = Object.assign(new EventTarget(), { height: 844, scale: 1 });
  vi.stubGlobal("visualViewport", visibleViewport);
  observers.length = 0;
  sizeObservers.length = 0;
  createURL
    .mockReset()
    .mockImplementation(() => "blob:preview-" + createURL.mock.calls.length);
  revokeURL.mockReset();
  scroll.mockClear();
  intoView.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("ResizeObserver", SizeObserver);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches:
      (query.includes("reduced-motion") && reducedMotion) ||
      (query.includes("max-width") && mobile),
  }));
  const NativeURL = URL;
  vi.stubGlobal(
    "URL",
    Object.assign(class extends NativeURL {}, {
      createObjectURL: createURL,
      revokeObjectURL: revokeURL,
    }),
  );
  vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(function (
    this: HTMLElement,
    value: number | ScrollToOptions,
    y?: number,
  ) {
    scroll.call(
      this,
      typeof value === "number" ? { left: value, top: y } : value,
    );
  });
  vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(
    intoView,
  );
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
    function (this: HTMLElement) {
      if (!this.dataset.photoId) return 0;
      return Array.from(this.parentElement?.children ?? []).indexOf(this) * 500;
    },
  );
  container = document.createElement("div");
  container.className = "public-site";
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(createElement(SubmissionForm, { siteKey: "test-only" })),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function el<T extends Element = HTMLElement>(selector: string): T {
  const value = container.querySelector<T>(selector);
  if (!value) throw new Error("Missing " + selector);
  return value;
}
function button(label: string) {
  const value = Array.from(container.querySelectorAll("button")).find(
    (item) =>
      item.getAttribute("aria-label") === label ||
      item.textContent?.trim() === label,
  );
  if (!value) throw new Error("Missing button " + label);
  return value;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function upload(names: string[], drop = false) {
  const files = names.map(
    (name) => new File(["local test bytes"], name, { type: "image/png" }),
  );
  await add(files, drop);
}
async function add(files: File[], drop = false) {
  await act(async () => {
    if (drop) {
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: { files } });
      el(".submission-photo-stage").dispatchEvent(event);
    } else {
      const input = el<HTMLInputElement>('input[type="file"]');
      Object.defineProperty(input, "files", {
        configurable: true,
        value: files,
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}
async function edit(id: string, value: string) {
  const input = el<HTMLInputElement | HTMLTextAreaElement>("#editor-" + id);
  await act(async () => {
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function visible(index: number, ratio = 1) {
  await act(async () => observers.at(-1)!.emit(index, ratio));
}
async function submit() {
  await act(async () =>
    el("form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
}
async function fillValid(names = ["photo.png"]) {
  await upload(names);
  for (let index = 0; index < names.length; index++) {
    await visible(index);
    await edit("title", "Photo " + (index + 1));
  }
  await edit("authorName", "Campus photographer");
  await act(async () =>
    el<HTMLInputElement>("#editor-consentAccepted").click(),
  );
  await click("测试安全验证");
}

// jsdom has no layout/native scrolling. Only these browser APIs are simulated; actual React state and events run.
Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  writable: true,
  value() {},
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  writable: true,
  value() {},
});
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  writable: true,
  value() {
    this.open = true;
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  writable: true,
  value() {
    this.open = false;
  },
});

test("empty editor offers uploads and batch fields without a fake image", () => {
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("添加你的校园影像");
  expect(container.textContent).toContain("尚未选择照片");
  expect(container.textContent).toContain("本次投稿的公共信息");
});
test("drop and append create stable IDs and only one preview URL per file", async () => {
  await upload(["same.png", "same.png"], true);
  const ids = Array.from(
    container.querySelectorAll<HTMLElement>("[data-photo-id]"),
  ).map((node) => node.dataset.photoId);
  expect(new Set(ids).size).toBe(2);
  await upload(["third.png"]);
  expect(
    Array.from(container.querySelectorAll<HTMLElement>("[data-photo-id]"))
      .slice(0, 2)
      .map((node) => node.dataset.photoId),
  ).toEqual(ids);
  expect(createURL).toHaveBeenCalledTimes(3);
});
test("observer changes only at a dominant ratio; each draft and author fields survive switching", async () => {
  await upload(["a.png", "b.png"]);
  await edit("title", "春日校园");
  await edit("description", "A 的说明");
  await edit("authorName", "摄影者");
  const title = el<HTMLInputElement>("#editor-title");
  title.focus();
  await visible(1, 0.55);
  expect(title.value).toBe("春日校园");
  await visible(1, 0.61);
  expect(title.value).toBe("");
  expect(document.activeElement).toBe(title);
  await edit("title", "图书馆夕阳");
  await visible(0);
  expect(title.value).toBe("春日校园");
  expect(el<HTMLTextAreaElement>("#editor-description").value).toBe("A 的说明");
  expect(el<HTMLInputElement>("#editor-authorName").value).toBe("摄影者");
  expect(createURL).toHaveBeenCalledTimes(2);
});
test("previous/next move the real viewer; right scrolling does not select a photo", async () => {
  await upload(["a.png", "b.png"]);
  await edit("title", "First");
  scroll.mockClear();
  await click("下一张照片");
  expect(scroll).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
  expect(el<HTMLInputElement>("#editor-title").value).toBe("First");
  await visible(1);
  await edit("title", "Second");
  await act(async () =>
    el(".submission-info-scroll").dispatchEvent(new Event("scrollend")),
  );
  expect(el<HTMLInputElement>("#editor-title").value).toBe("Second");
  reducedMotion = true;
  scroll.mockClear();
  await click("上一张照片");
  expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  await visible(0);
  expect(el<HTMLInputElement>("#editor-title").value).toBe("First");
});
test("deletion confirms, releases its URL and selects an adjacent draft", async () => {
  await upload(["a.png", "b.png", "c.png"]);
  await edit("title", "A");
  await visible(1);
  await edit("title", "B");
  await visible(2);
  await edit("title", "C");
  await visible(1);
  await click("删除当前照片");
  await click("取消");
  expect(container.querySelectorAll("img")).toHaveLength(3);
  await click("删除当前照片");
  await click("确认删除");
  expect(container.querySelectorAll("img")).toHaveLength(2);
  expect(revokeURL).toHaveBeenCalledWith("blob:preview-2");
  expect(el<HTMLInputElement>("#editor-title").value).toBe("C");
  await visible(0);
  expect(el<HTMLInputElement>("#editor-title").value).toBe("A");
});
test("deleting the last photo restores upload focus and releases the preview once", async () => {
  await upload(["a.png"]);
  await click("删除当前照片");
  await click("确认删除");
  expect(container.querySelector("img")).toBeNull();
  expect(document.activeElement?.id).toBe("editor-files");
  expect(revokeURL.mock.calls).toEqual([["blob:preview-1"]]);
});
test("format, size and quantity limits reject files before creating previews", async () => {
  const big = new File(["bytes"], "big.png", { type: "image/png" });
  Object.defineProperty(big, "size", { value: MAX_IMAGE_BYTES + 1 });
  await add([new File(["bad"], "text.txt", { type: "text/plain" }), big]);
  expect(createURL).not.toHaveBeenCalled();
  expect(container.textContent).toContain("仅支持 JPEG、PNG 和 WebP");
  expect(container.textContent).toContain("文件不能超过");
  await upload(Array.from({ length: 6 }, (_, i) => i + ".png"));
  expect(container.querySelectorAll("img")).toHaveLength(MAX_SUBMISSION_PHOTOS);
  expect(container.textContent).toContain("一次最多选择 5 张照片");
});
test("submit validates hidden photo drafts and moves to the precise failing field", async () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  await upload(["a.png", "b.png", "c.png"]);
  await edit("title", "A");
  await visible(1);
  await edit("title", "B");
  await visible(0);
  scroll.mockClear();
  await submit();
  expect(container.textContent).toContain("第 3 张照片");
  expect(document.activeElement?.id).toBe("editor-title");
  expect(
    el<HTMLInputElement>("#editor-title").getAttribute("aria-invalid"),
  ).toBe("true");
  expect(scroll).toHaveBeenCalledWith({ top: 1000, behavior: "auto" });
  expect(request).not.toHaveBeenCalled();
  await visible(0);
  expect(el<HTMLInputElement>("#editor-title").value).toBe("A");
});
test("public information, authorization, date and verification errors identify their fields", async () => {
  vi.stubGlobal("fetch", vi.fn());
  await upload(["a.png"]);
  await edit("title", "A");
  await edit("takenAt", "2099-01-01");
  await submit();
  expect(container.textContent).toContain("拍摄日期不能晚于今天");
  await edit("takenAt", "");
  await submit();
  expect(document.activeElement?.id).toBe("editor-authorName");
  await edit("authorName", "A");
  await edit("contactEmail", "invalid");
  await submit();
  expect(document.activeElement?.id).toBe("editor-contactEmail");
  await edit("contactEmail", "");
  await submit();
  expect(document.activeElement?.id).toBe("editor-consentAccepted");
  await act(async () =>
    el<HTMLInputElement>("#editor-consentAccepted").click(),
  );
  await submit();
  expect(document.activeElement?.id).toBe("editor-turnstile");
});
test.each([1, 3])(
  "submits %d photos in stable order with one batch and reports pending",
  async (count) => {
    const request = vi.fn<
      (path: string, init: RequestInit) => Promise<unknown>
    >(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          submissionId: "test-only",
          photoCount: count,
          status: "pending",
        },
      }),
    }));
    vi.stubGlobal("fetch", request);
    await fillValid(Array.from({ length: count }, () => "same.png"));
    await submit();
    const data = request.mock.calls[0][1].body as FormData;
    expect(data.getAll("files")).toHaveLength(count);
    expect(
      JSON.parse(String(data.get("metadata"))).map(
        (row: { title: string }) => row.title,
      ),
    ).toEqual(Array.from({ length: count }, (_, i) => "Photo " + (i + 1)));
    expect(data.getAll("authorName")).toEqual(["Campus photographer"]);
    expect(data.get("consentAccepted")).toBe("true");
    expect(data.get("turnstileToken")).toBe("mock-token");
    expect(container.textContent).toContain("待审核");
    expect(revokeURL).toHaveBeenCalledTimes(count);
  },
);
test("failure retains drafts and previews; retry keeps the request ID and blocks duplicates", async () => {
  let finish: ((value: unknown) => void) | undefined;
  const request = vi.fn<(path: string, init: RequestInit) => Promise<unknown>>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", request);
  await fillValid(["a.png", "b.png"]);
  await act(async () => {
    el("form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    el("form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(button("正在提交…").disabled).toBe(true);
  const id = (request.mock.calls[0][1].body as FormData).get(
    "submissionRequestId",
  );
  await act(async () =>
    finish?.({
      ok: false,
      json: async () => ({ error: { message: "存储暂时不可用" } }),
    }),
  );
  expect(container.textContent).toContain("存储暂时不可用");
  expect(el<HTMLInputElement>("#editor-title").value).toBe("Photo 2");
  expect(revokeURL).not.toHaveBeenCalled();
  await submit();
  expect(request).toHaveBeenCalledTimes(1);
  await click("测试安全验证");
  await act(async () =>
    el("form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(
    (request.mock.calls[1][1].body as FormData).get("submissionRequestId"),
  ).toBe(id);
  await act(async () =>
    finish?.({
      ok: false,
      json: async () => ({ error: { message: "重试失败" } }),
    }),
  );
});
test("resizing aligns the active slide and unmount disconnects observers and releases all URLs", async () => {
  await upload(["a.png", "b.png"]);
  await visible(1);
  scroll.mockClear();
  Object.defineProperty(el(".submission-photo-scroll"), "clientHeight", {
    configurable: true,
    value: 400,
  });
  await act(async () =>
    sizeObservers
      .at(-1)!
      .callback([], sizeObservers.at(-1)! as unknown as ResizeObserver),
  );
  expect(scroll).toHaveBeenCalledWith({ top: 500, behavior: "auto" });
  await act(async () => root.unmount());
  expect(observers.at(-1)!.targets.size).toBe(0);
  expect(revokeURL).toHaveBeenCalledTimes(2);
});

test("local previews keep square, uncropped images and report loading failures", async () => {
  await upload(["a.png"]);
  const image = el<HTMLImageElement>("img");
  expect(image.src).toBe("blob:preview-1");
  expect(image.alt).toContain("a.png");
  expect(image.className).toContain("rounded-none object-contain");
  await act(async () => image.dispatchEvent(new Event("load")));
  expect(image.className).toContain("opacity-100");
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(container.textContent).toContain("无法预览这张照片");
});
test("scrollend confirms the nearest slide when observer events are delayed", async () => {
  await upload(["a.png", "b.png"]);
  const viewport = el<HTMLElement>(".submission-photo-scroll");
  Object.defineProperty(viewport, "clientHeight", {
    configurable: true,
    value: 500,
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 100, 300, 500),
  );
  Array.from(viewport.children).forEach((slide, index) =>
    vi
      .spyOn(slide, "getBoundingClientRect")
      .mockImplementation(
        () => new DOMRect(0, 100 + index * 500 - viewport.scrollTop, 300, 500),
      ),
  );
  viewport.scrollTop = 500;
  await act(async () => viewport.dispatchEvent(new Event("scrollend")));
  expect(container.textContent).toContain("02 / 02");
  expect(el(".submission-metadata").textContent).toContain("b.png");
});
test("mobile keyboard resizing uses the visual viewport and respects browser zoom", async () => {
  mobile = true;
  visibleViewport.height = 400;
  await act(async () => visibleViewport.dispatchEvent(new Event("resize")));
  expect(container.style.getPropertyValue("--submission-viewport-height")).toBe(
    "400px",
  );
  visibleViewport.scale = 2;
  await act(async () => visibleViewport.dispatchEvent(new Event("resize")));
  expect(container.style.getPropertyValue("--submission-viewport-height")).toBe(
    "",
  );
});
