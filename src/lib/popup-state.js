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
