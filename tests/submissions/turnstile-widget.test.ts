// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TurnstileWidget } from "../../src/components/submit/turnstile-widget";

vi.mock("next/script", () => ({
  default: ({ onReady }: { onReady: () => void }) =>
    createElement(
      "button",
      { type: "button", onClick: onReady },
      "Script ready",
    ),
}));
let container: HTMLDivElement;
let root: Root;
const onToken = vi.fn(),
  onError = vi.fn(),
  reset = vi.fn(),
  remove = vi.fn();
const render = vi.fn<
  (element: HTMLElement, options: Record<string, unknown>) => string
>(() => "widget-test");

beforeEach(() => {
  onToken.mockClear();
  onError.mockClear();
  reset.mockClear();
  remove.mockClear();
  render.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("turnstile", { render, reset, remove });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function mount(token = "") {
  await act(async () =>
    root.render(
      createElement(TurnstileWidget, {
        siteKey: "test-only",
        token,
        onToken,
        onError,
      }),
    ),
  );
}
async function ready() {
  await act(async () => container.querySelector("button")?.click());
}

test("explicit render keeps the submit action and uses a compact widget for narrow panels", async () => {
  await mount();
  await ready();
  expect(render).toHaveBeenCalledTimes(1);
  expect(render.mock.calls[0][1]).toMatchObject({
    sitekey: "test-only",
    action: "submit",
    theme: "auto",
    size: "compact",
    callback: onToken,
  });
  const expired = render.mock.calls[0][1]["expired-callback"] as () => void;
  expired();
  expect(onToken).toHaveBeenCalledWith("");
});
test("clearing a consumed token resets only that widget; initial empty state does not reset", async () => {
  await mount();
  await ready();
  expect(reset).not.toHaveBeenCalled();
  await mount("fresh-token");
  expect(reset).not.toHaveBeenCalled();
  await mount("");
  expect(reset.mock.calls).toEqual([["widget-test"]]);
  await mount("");
  expect(reset).toHaveBeenCalledTimes(1);
  expect(render).toHaveBeenCalledTimes(1);
});
test("unmount removes the widget rather than starting another challenge", async () => {
  await mount();
  await ready();
  await act(async () => root.unmount());
  expect(remove).toHaveBeenCalledWith("widget-test");
  expect(reset).not.toHaveBeenCalled();
});
test("ready callback initializes again on a later mount with an already available script", async () => {
  await mount();
  await ready();
  await act(async () => root.unmount());
  root = createRoot(container);
  await mount();
  await ready();
  expect(render).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledTimes(1);
});
