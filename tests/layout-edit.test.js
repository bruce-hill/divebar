// Drives the bar layout editor through its interface against jsdom: a
// fake #bar with widget children, a fake invoke recording save_config
// calls, and synthetic pointer events for the drag path (element rects
// are stubbed — jsdom has no layout).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLayoutEditor, reorderTarget } from "../src/lib/layout-edit.js";
import WIDGET_NAMES from "../src/widgets/index.js";

function stubRect(el, left, width) {
  el.getBoundingClientRect = () => ({
    left,
    width,
    right: left + width,
    x: left,
    y: 0,
    top: 0,
    bottom: 30,
    height: 30,
  });
}

function makeBar(entries) {
  const barEl = document.createElement("div");
  barEl.id = "bar";
  document.body.appendChild(barEl);
  const els = new Map();
  entries.forEach((entry, i) => {
    const el = document.createElement("div");
    el.className = `fake-${entry.widget}`;
    stubRect(el, i * 100, 90);
    barEl.appendChild(el);
    els.set(el, entry);
  });
  return { barEl, els };
}

function makeEditor(entries) {
  const config = { bar: { height: 48 }, widgets: entries };
  const { barEl, els } = makeBar(entries);
  const invoke = vi.fn(() => Promise.resolve());
  invoke.savedWidgets = () =>
    invoke.mock.calls
      .filter(([cmd]) => cmd === "save_config")
      .map(([, args]) => args.config.widgets);
  const editor = createLayoutEditor({
    barEl,
    invoke,
    getConfig: () => config,
    entryFor: (el) => els.get(el) ?? null,
  });
  return { editor, barEl, els, invoke, config };
}

function pointer(type, target, clientX = 0) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX }),
  );
}

const entries = () => [
  { widget: "logo", options: {} },
  { widget: "time", options: { seconds: true } },
  { widget: "settings", options: {} },
];

let editor;

afterEach(async () => {
  editor?.stop();
  editor = null;
  await Promise.resolve(); // popup out-animation finishes
  document.body.replaceChildren();
  document.documentElement.className = "";
});

describe("reorderTarget", () => {
  it("returns the first sibling whose midpoint is right of x", () => {
    const { barEl } = makeBar(entries());
    const [a, b, c] = barEl.children;
    // Midpoints: a=45, b=145, c=245. Dragging c leftwards:
    expect(reorderTarget(barEl, c, 30)).toBe(a);
    expect(reorderTarget(barEl, c, 100)).toBe(b);
    expect(reorderTarget(barEl, c, 200)).toBe(null); // stays at the end
    expect(reorderTarget(barEl, a, 300)).toBe(null); // past everything
  });
});

describe("createLayoutEditor", () => {
  it("start() enters edit mode: root class, badges, toolbar with controls", () => {
    ({ editor } = makeEditor(entries()));
    expect(editor.isActive()).toBe(false);

    editor.start();

    expect(editor.isActive()).toBe(true);
    expect(document.documentElement.classList.contains("layout-editing")).toBe(true);
    expect(document.querySelectorAll("#bar .layout-x")).toHaveLength(3);
    const toolbar = document.querySelector(".dpanel.layout-toolbar");
    expect(toolbar).not.toBeNull();
    const labels = [...toolbar.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toContain("Done");
    expect(labels).toContain("＋ Add widget");
  });

  it("Done exits edit mode and removes all edit chrome", async () => {
    ({ editor } = makeEditor(entries()));
    editor.start();

    const done = [...document.querySelectorAll(".layout-toolbar button")].find(
      (b) => b.textContent === "Done",
    );
    done.click();

    expect(editor.isActive()).toBe(false);
    expect(document.documentElement.classList.contains("layout-editing")).toBe(false);
    expect(document.querySelectorAll(".layout-x")).toHaveLength(0);
    await Promise.resolve();
    expect(document.querySelector(".dpanel")).toBeNull();
  });

  it("Escape also exits", () => {
    ({ editor } = makeEditor(entries()));
    editor.start();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(editor.isActive()).toBe(false);
  });

  it("✕ badge saves the config without that widget", () => {
    let invoke, barEl;
    ({ editor, invoke, barEl } = makeEditor(entries()));
    editor.start();

    barEl.children[1].querySelector(".layout-x").click();

    expect(invoke.savedWidgets()).toEqual([[entries()[0], entries()[2]]]);
  });

  it("dragging a widget reorders the DOM live and saves the new order", () => {
    let invoke, barEl;
    ({ editor, invoke, barEl } = makeEditor(entries()));
    editor.start();
    const [logo, time, settings] = barEl.children;

    pointer("pointerdown", settings, 250);
    pointer("pointermove", barEl, 30); // past the 5px threshold, before logo's midpoint
    expect([...barEl.children]).toEqual([settings, logo, time]);
    expect(settings.classList.contains("layout-dragging")).toBe(true);

    pointer("pointerup", barEl);

    expect(settings.classList.contains("layout-dragging")).toBe(false);
    expect(invoke.savedWidgets().at(-1).map((e) => e.widget)).toEqual([
      "settings",
      "logo",
      "time",
    ]);
  });

  it("a sub-threshold press is not a drag and saves nothing", () => {
    let invoke, barEl;
    ({ editor, invoke, barEl } = makeEditor(entries()));
    editor.start();

    pointer("pointerdown", barEl.children[0], 10);
    pointer("pointermove", barEl, 12);
    pointer("pointerup", barEl);

    expect(invoke.savedWidgets()).toEqual([]);
  });

  it("clicks and contextmenu on widgets are swallowed while editing", () => {
    let barEl;
    ({ editor, barEl } = makeEditor(entries()));
    const widgetClick = vi.fn();
    barEl.children[0].addEventListener("click", widgetClick);
    editor.start();

    pointer("click", barEl.children[0], 10);
    expect(widgetClick).not.toHaveBeenCalled();

    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    barEl.children[0].dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);

    editor.stop();
    pointer("click", barEl.children[0], 10);
    expect(widgetClick).toHaveBeenCalledOnce();
  });

  it("the add menu lists the manifest and appends the picked widget", () => {
    let invoke;
    ({ editor, invoke } = makeEditor(entries()));
    editor.start();

    const add = [...document.querySelectorAll(".layout-toolbar button")].find(
      (b) => b.textContent === "＋ Add widget",
    );
    add.click();

    const items = [...document.querySelectorAll(".layout-add-menu button")];
    expect(items.map((b) => b.textContent)).toEqual([...WIDGET_NAMES].sort());

    items.find((b) => b.textContent === "cpu").click();

    const saved = invoke.savedWidgets().at(-1);
    expect(saved.map((e) => e.widget)).toEqual(["logo", "time", "settings", "cpu"]);
    expect(saved.at(-1)).toEqual({ widget: "cpu", options: {} });
    expect(document.querySelector(".layout-add-menu").childElementCount).toBe(0);
  });

  it("refresh() badges widgets added after start, once each", () => {
    let barEl, els;
    ({ editor, barEl, els } = makeEditor(entries()));
    editor.start();

    const added = document.createElement("div");
    stubRect(added, 300, 90);
    barEl.appendChild(added);
    els.set(added, { widget: "cpu", options: {} });
    editor.refresh();
    editor.refresh();

    expect(added.querySelectorAll(".layout-x")).toHaveLength(1);
    expect(barEl.querySelectorAll(".layout-x")).toHaveLength(4);
  });
});
