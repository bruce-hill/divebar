// renderSettingsRows turns a settings schema into labeled rows whose
// controls report coerced values through onChange(key, value). Both the
// settings window and the bar's right-click popup trust this contract.

import { describe, it, expect, vi } from "vitest";
import { renderSettingsRows, hasFocusedControl } from "../src/lib/settings-form.js";

function makeRows(schemas, options = {}, { invoke } = {}) {
  const onChange = vi.fn();
  const container = document.createElement("div");
  renderSettingsRows(container, {
    schemas,
    options,
    invoke: invoke ?? (() => Promise.resolve(null)),
    onChange,
  });
  document.body.appendChild(container);
  return { container, onChange };
}

// Renders a single-schema form and returns its control element.
function make(schema, current, opts = {}) {
  const options = current === undefined ? {} : { [schema.key]: current };
  const { container, onChange } = makeRows([schema], options, opts);
  const el = container.querySelector(".dform-row > :not(label)");
  return { el, container, onChange };
}

function fireChange(input) {
  input.dispatchEvent(new Event("change"));
}

describe("renderSettingsRows", () => {
  it("renders one labeled row per schema entry, falling back to the key", () => {
    const { container } = makeRows([
      { key: "alpha", label: "Alpha setting" },
      { key: "beta" },
    ]);
    const rows = [...container.querySelectorAll(".dform-row")];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.querySelector("label").textContent)).toEqual([
      "Alpha setting",
      "beta",
    ]);
  });

  it("keys onChange by the schema entry that changed", () => {
    const { container, onChange } = makeRows([
      { key: "first" },
      { key: "second" },
    ]);
    const inputs = container.querySelectorAll("input");
    inputs[1].value = "hello";
    fireChange(inputs[1]);
    expect(onChange).toHaveBeenCalledWith("second", "hello");
  });

  it("resolves values as options[key] ?? schema.default", () => {
    const { container } = makeRows(
      [
        { key: "set", default: "fallback" },
        { key: "unset", default: "fallback" },
      ],
      { set: "saved" },
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs[0].value).toBe("saved");
    expect(inputs[1].value).toBe("fallback");
  });

  it("boolean renders a checkbox and reports toggles", () => {
    const { el, onChange } = make({ type: "boolean", key: "x" }, true);
    expect(el.type).toBe("checkbox");
    expect(el.checked).toBe(true);
    el.checked = false;
    fireChange(el);
    expect(onChange).toHaveBeenCalledWith("x", false);
  });

  it("select renders the choices and reports the picked one", () => {
    const { el, onChange } = make(
      { type: "select", key: "x", choices: ["a", "b"] },
      "b",
    );
    expect([...el.options].map((o) => o.value)).toEqual(["a", "b"]);
    expect(el.value).toBe("b");
    el.value = "a";
    fireChange(el);
    expect(onChange).toHaveBeenCalledWith("x", "a");
  });

  it("number clamps to min/max (an emptied field counts as 0)", () => {
    const { el, onChange } = make(
      { type: "number", key: "x", min: 10, max: 20, default: 15 },
      12,
    );
    el.value = "99";
    fireChange(el);
    expect(onChange).toHaveBeenLastCalledWith("x", 20);
    el.value = "";
    fireChange(el);
    expect(onChange).toHaveBeenLastCalledWith("x", 10);
  });

  it("unknown types fall back to a text input", () => {
    const { el, onChange } = make({ key: "x" }, "hello");
    expect(el.type).toBe("text");
    el.value = "world";
    fireChange(el);
    expect(onChange).toHaveBeenCalledWith("x", "world");
  });

  it("location shows what the value resolves to", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({ area: "Greenwich Village", region: "New York", country: "USA" }),
    );
    const { el } = make({ type: "location", key: "x" }, "10001", { invoke });
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("resolve_location", { location: "10001" });
    expect(el.querySelector(".loc-status").textContent).toBe(
      "→ Greenwich Village, New York, USA",
    );
  });

  it("location surfaces resolve failures", async () => {
    const invoke = vi.fn(() => Promise.reject("couldn't resolve this location"));
    const { el } = make({ type: "location", key: "x" }, "Brooklyn", { invoke });
    await Promise.resolve();
    await Promise.resolve();
    const status = el.querySelector(".loc-status");
    expect(status.textContent).toBe("couldn't resolve this location");
    expect(status.classList.contains("error")).toBe(true);
  });
});

describe("hasFocusedControl", () => {
  it("holds only while a sustained-focus control inside the container is active", () => {
    const { container } = makeRows([
      { key: "text" },
      { type: "boolean", key: "check" },
    ]);
    expect(hasFocusedControl(container)).toBe(false);

    container.querySelector('input[type="text"]').focus();
    expect(hasFocusedControl(container)).toBe(true);

    // Checkboxes don't need sustained focus — clicks resolve instantly.
    container.querySelector('input[type="checkbox"]').focus();
    expect(hasFocusedControl(container)).toBe(false);

    // A focused control outside the container doesn't count.
    const outside = document.createElement("input");
    outside.type = "text";
    document.body.appendChild(outside);
    outside.focus();
    expect(hasFocusedControl(container)).toBe(false);
    expect(hasFocusedControl(null)).toBe(false);
  });
});
