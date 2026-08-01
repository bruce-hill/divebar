// Drives the bar-config schema and applyBarStyle through their
// interfaces against jsdom's documentElement.

import { describe, it, expect, afterEach } from "vitest";
import { BAR_SETTINGS, barDefaults, applyBarStyle } from "../src/lib/bar-config.js";

const rootStyle = () => document.documentElement.style;

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("schema", () => {
  it("exposes the five bar settings with defaults", () => {
    expect(barDefaults()).toEqual({
      height: 48,
      paddingX: 10,
      paddingY: 6,
      accent: "#7aa2f7",
      font: "",
    });
    for (const s of BAR_SETTINGS) {
      expect(s.label).toBeTruthy();
      expect(s.type).toBeTruthy();
    }
  });
});

describe("applyBarStyle", () => {
  it("derives all sizing from the defaults when config is empty", () => {
    applyBarStyle({});
    expect(rootStyle().getPropertyValue("--bar-height")).toBe("48px");
    expect(rootStyle().getPropertyValue("--chip-height")).toBe("36px"); // 48 - 2*6
    expect(rootStyle().getPropertyValue("--chip-radius")).toBe("18px");
    expect(rootStyle().getPropertyValue("--bar-font")).toBe("20px"); // round(36*0.55)
    expect(rootStyle().getPropertyValue("--icon-size")).toBe("32px"); // round(36*0.88)
    // Accent/font unset: the stylesheet defaults stay in charge.
    expect(rootStyle().getPropertyValue("--accent")).toBe("");
    expect(rootStyle().getPropertyValue("--font")).toBe("");
  });

  it("applies configured values and overrides", () => {
    applyBarStyle({
      bar: { height: 60, paddingY: 10, accent: "#ff0000", font: "Iosevka" },
    });
    expect(rootStyle().getPropertyValue("--bar-height")).toBe("60px");
    expect(rootStyle().getPropertyValue("--chip-height")).toBe("40px");
    expect(rootStyle().getPropertyValue("--bar-pad-x")).toBe("10px"); // default
    expect(rootStyle().getPropertyValue("--accent")).toBe("#ff0000");
    expect(rootStyle().getPropertyValue("--font")).toContain('"Iosevka"');
  });

  it("clearing an override removes the property again", () => {
    applyBarStyle({ bar: { accent: "#ff0000" } });
    applyBarStyle({ bar: {} });
    expect(rootStyle().getPropertyValue("--accent")).toBe("");
  });

  it("chip height never collapses below the floor", () => {
    applyBarStyle({ bar: { height: 24, paddingY: 12 } });
    expect(rootStyle().getPropertyValue("--chip-height")).toBe("14px");
  });
});
