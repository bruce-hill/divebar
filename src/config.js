// Bar configuration. Hardcoded for the prototype, but kept as plain data so
// a future settings menu can generate/persist this instead. Each entry names
// a module in ./widgets/ and passes it an arbitrary options object.

export default {
  left: [
    { widget: "workspaces" },
    { widget: "window-title" },
  ],
  center: [],
  right: [
    { widget: "wifi" },
    { widget: "volume" },
    { widget: "brightness" },
    { widget: "battery" },
    { widget: "clock" },
  ],
};
