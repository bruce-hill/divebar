// Coordinates pop-down panels (sliders, tray menus) so at most one is open
// at a time — important because they share the backend's single popup
// input-region/shape state.

let currentClose = null;

export function popupWillOpen(close) {
  if (currentClose && currentClose !== close) currentClose();
  currentClose = close;
}

export function popupDidClose(close) {
  if (currentClose === close) currentClose = null;
}

/// Whether a real popup (slider/menu) is open — tooltips suppress
/// themselves while one is, since they share the window shape state.
export function hasOpenPopup() {
  return currentClose !== null;
}
