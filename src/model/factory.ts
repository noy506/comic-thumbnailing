import type { Project, Page, Panel } from './types';

/**
 * Generates a UUID v4 string.
 * crypto.randomUUID() requires a secure context (HTTPS / localhost).
 * On plain HTTP (iPad over LAN) we fall back to a Math.random-based UUID v4.
 * IDs are only used for local IndexedDB keys — collision probability is negligible.
 */
export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 §4.4 UUID v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createPage(): Page {
  return { id: uid(), panels: [] };
}

export function createPanel(x: number, y: number, w: number, h: number): Panel {
  return { id: uid(), x, y, width: w, height: h, order: null, strokes: [] };
}

export function createProject(
  name: string,
  pageCount: number,
  pageWidthMm: number,
  pageHeightMm: number,
  direction: 'ltr' | 'rtl',
  firstPageIsSingle: boolean,
): Project {
  const pages: Page[] = Array.from({ length: pageCount }, () => createPage());
  return {
    id: uid(),
    name,
    createdAt: Date.now(),
    pageWidthMm,
    pageHeightMm,
    direction,
    firstPageIsSingle,
    pages,
    settings: { secondsPerPanel: 15, lineWidth: 'medium', snap: true },
    activeSession: null,
  };
}
