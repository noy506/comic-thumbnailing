/**
 * coords.ts — THE ONLY place coordinate conversions happen.
 *
 * Systems:
 *   logical-page  : mm, origin = page top-left
 *   logical-panel : mm, origin = panel top-left  (stored for strokes)
 *   display       : CSS px, origin = viewport top-left (never stored)
 *   export        : device px at target DPI       (never stored)
 */

export interface ViewTransform {
  /** CSS-pixel x of the page top-left corner in the viewport */
  offsetX: number;
  /** CSS-pixel y of the page top-left corner in the viewport */
  offsetY: number;
  /** CSS pixels per mm */
  scale: number;
}

// ── Logical-page ↔ Display ──────────────────────────────────────────────────

export function pageToDisplay(
  mmX: number,
  mmY: number,
  vt: ViewTransform,
): { x: number; y: number } {
  return {
    x: vt.offsetX + mmX * vt.scale,
    y: vt.offsetY + mmY * vt.scale,
  };
}

export function displayToPage(
  pxX: number,
  pxY: number,
  vt: ViewTransform,
): { x: number; y: number } {
  return {
    x: (pxX - vt.offsetX) / vt.scale,
    y: (pxY - vt.offsetY) / vt.scale,
  };
}

// ── Logical-panel ↔ Logical-page ───────────────────────────────────────────

export function panelToPage(
  mmX: number,
  mmY: number,
  panelX: number,
  panelY: number,
): { x: number; y: number } {
  return { x: panelX + mmX, y: panelY + mmY };
}

export function pageToPanelCoords(
  mmX: number,
  mmY: number,
  panelX: number,
  panelY: number,
): { x: number; y: number } {
  return { x: mmX - panelX, y: mmY - panelY };
}

// ── Logical-page → Export px ────────────────────────────────────────────────

export function pageToExport(mmX: number, mmY: number, dpi: number): { x: number; y: number } {
  const factor = dpi / 25.4;
  return { x: Math.round(mmX * factor), y: Math.round(mmY * factor) };
}

// ── Convenience: build a ViewTransform from a rendered page element ─────────

export function buildViewTransform(
  pageEl: HTMLElement,
  pageWidthMm: number,
): ViewTransform {
  const rect  = pageEl.getBoundingClientRect();
  const scale = rect.width / pageWidthMm;
  return { offsetX: rect.left, offsetY: rect.top, scale };
}

// ── Unit normalisation to mm ────────────────────────────────────────────────

export function toMm(value: number, unit: 'mm' | 'cm' | 'in' | 'px'): number {
  switch (unit) {
    case 'mm': return value;
    case 'cm': return value * 10;
    case 'in': return value * 25.4;
    case 'px': return value / 96 * 25.4;
  }
}
