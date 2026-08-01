// The widget manifest (src/widgets/index.js) is hand-maintained and the
// settings window trusts it: a widget missing from it works on the bar
// but silently never appears in the add-widget picker. This test makes
// that failure loud.

import { it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import WIDGET_NAMES from "../src/widgets/index.js";

it("manifest lists exactly the widget modules on disk", () => {
  // vitest runs with cwd at the project root.
  const files = readdirSync(resolve(process.cwd(), "src/widgets"))
    .filter((f) => f.endsWith(".js") && f !== "index.js")
    .map((f) => f.replace(/\.js$/, ""))
    .sort();
  expect([...WIDGET_NAMES].sort()).toEqual(files);
});
