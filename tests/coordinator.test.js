// Drives the Coordinator through its interface: claims, popup > tooltip
// priority, eviction, and the set_popup_open traffic it now owns outright.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initCoordinator, claim, release } from "../src/lib/coordinator.js";

function fakeInvoke() {
  const invoke = vi.fn(() => Promise.resolve());
  invoke.shapeCalls = () =>
    invoke.mock.calls
      .filter(([cmd]) => cmd === "set_popup_open")
      .map(([, args]) => args);
  return invoke;
}

function makeEl() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

const ZERO_RECT = { x: 0, y: 0, width: 0, height: 0 };

let invoke;

beforeEach(() => {
  invoke = fakeInvoke();
  initCoordinator(invoke);
});

afterEach(() => {
  // Leave the popup space empty for the next test: a popup claim evicts
  // whatever a test left behind, then releases cleanly.
  initCoordinator(() => Promise.resolve());
  release(claim({ el: document.createElement("div"), kind: "popup" }));
  document.body.replaceChildren();
});

describe("claim", () => {
  it("places the element and widens the shape", () => {
    const el = makeEl();
    const place = vi.fn();
    const c = claim({ el, kind: "popup", place });

    expect(c).not.toBeNull();
    expect(place).toHaveBeenCalledWith(el);
    expect(invoke.shapeCalls()).toEqual([{ open: true, rect: ZERO_RECT }]);
  });

  it("re-places and re-sends the shape when the element resizes", () => {
    const place = vi.fn();
    claim({ el: makeEl(), kind: "popup", place });

    ResizeObserver.trigger();

    expect(place).toHaveBeenCalledTimes(2);
    expect(invoke.shapeCalls().filter((s) => s.open)).toHaveLength(2);
  });

  it("a popup claim evicts an open popup", () => {
    const onEvict = vi.fn();
    claim({ el: makeEl(), kind: "popup", onEvict });

    const second = claim({ el: makeEl(), kind: "popup" });

    expect(second).not.toBeNull();
    expect(onEvict).toHaveBeenCalledOnce();
  });

  it("a popup claim evicts a tooltip", () => {
    const onEvict = vi.fn();
    claim({ el: makeEl(), kind: "tooltip", onEvict });

    const popup = claim({ el: makeEl(), kind: "popup" });

    expect(popup).not.toBeNull();
    expect(onEvict).toHaveBeenCalledOnce();
  });

  it("a tooltip claim is denied while a popup holds the space", () => {
    const onEvict = vi.fn();
    claim({ el: makeEl(), kind: "popup", onEvict });

    const tooltip = claim({ el: makeEl(), kind: "tooltip" });

    expect(tooltip).toBeNull();
    expect(onEvict).not.toHaveBeenCalled();
    // The denied claim sent no shape traffic of its own.
    expect(invoke.shapeCalls()).toEqual([{ open: true, rect: ZERO_RECT }]);
  });

  it("a tooltip claim evicts a tooltip", () => {
    const onEvict = vi.fn();
    claim({ el: makeEl(), kind: "tooltip", onEvict });

    const second = claim({ el: makeEl(), kind: "tooltip" });

    expect(second).not.toBeNull();
    expect(onEvict).toHaveBeenCalledOnce();
  });

  it("stops observing an evicted claim's element", () => {
    const placeA = vi.fn();
    const placeB = vi.fn();
    claim({ el: makeEl(), kind: "popup", place: placeA });
    claim({ el: makeEl(), kind: "popup", place: placeB });

    ResizeObserver.trigger();

    expect(placeA).toHaveBeenCalledTimes(1); // only its own claim-time call
    expect(placeB).toHaveBeenCalledTimes(2);
  });
});

describe("release", () => {
  it("shrinks the shape once; releasing again is a no-op", () => {
    const c = claim({ el: makeEl(), kind: "popup" });

    release(c);
    release(c);

    expect(invoke.shapeCalls().filter((s) => !s.open)).toHaveLength(1);
  });

  it("releasing an evicted claim does not clobber the new claim's shape", () => {
    const evicted = claim({ el: makeEl(), kind: "tooltip" });
    claim({ el: makeEl(), kind: "popup" });

    release(evicted); // the tooltip cleaning up after eviction

    expect(invoke.shapeCalls().at(-1)).toEqual({ open: true, rect: ZERO_RECT });
    expect(invoke.shapeCalls().filter((s) => !s.open)).toHaveLength(0);
  });

  it("a released claim's element is no longer observed", () => {
    const place = vi.fn();
    const c = claim({ el: makeEl(), kind: "popup", place });
    release(c);

    ResizeObserver.trigger();

    expect(place).toHaveBeenCalledTimes(1);
  });
});
