export type Unit      = 'mm' | 'cm' | 'in' | 'px';
export type Direction = 'rtl' | 'ltr';
export type LineWidth = 'thin' | 'medium' | 'thick'; // 0.4 / 0.8 / 1.4 mm

export type Point  = { x: number; y: number };  // mm, panel-relative
export type Stroke = { id: string; points: Point[]; width: number }; // width mm

export type Panel = {
  id: string;
  x: number; y: number; width: number; height: number; // mm, page-relative
  order: number | null;
  strokes: Stroke[];
};

export type Page = { id: string; panels: Panel[] };

export type SessionState = {
  pageId: string;
  panelIndex: number;   // index into ordered panels
  remainingMs: number;  // frozen value; meaningful only while paused
  status: 'running' | 'paused' | 'finished';
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  pageWidthMm: number;
  pageHeightMm: number;
  direction: Direction;
  firstPageIsSingle: boolean;
  pages: Page[];
  settings: { secondsPerPanel: number; lineWidth: LineWidth; snap: boolean };
  activeSession: SessionState | null;
};

// Convenience
export const LINE_WIDTH_MM: Record<LineWidth, number> = {
  thin:   0.4,
  medium: 0.8,
  thick:  1.4,
};

export const PAGE_PRESETS: Record<string, { w: number; h: number }> = {
  A4:     { w: 210,   h: 297   },
  A5:     { w: 148,   h: 210   },
  Square: { w: 200,   h: 200   },
};
