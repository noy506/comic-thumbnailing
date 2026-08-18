import type { Page } from '../model/types';

export interface RenderOptions {
  dpi: number;
  format: 'png' | 'jpg';
  jpgQuality: number;
}

const MAX_DIM = 16384;

function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

function drawPageContents(
  ctx: CanvasRenderingContext2D,
  page: Page,
  s: number,
  offsetX: number,
): void {
  const borderPx = 0.3 * s;
  for (const panel of page.panels) {
    const px = panel.x * s + offsetX;
    const py = panel.y * s;
    const pw = panel.width * s;
    const ph = panel.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    for (const stroke of panel.strokes) {
      if (stroke.points.length < 2) continue;
      ctx.beginPath();
      ctx.lineWidth = stroke.width * s;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
      ctx.moveTo((panel.x + stroke.points[0].x) * s + offsetX, (panel.y + stroke.points[0].y) * s);
      for (let j = 1; j < stroke.points.length; j++) {
        ctx.lineTo((panel.x + stroke.points[j].x) * s + offsetX, (panel.y + stroke.points[j].y) * s);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = borderPx;
    ctx.strokeRect(px, py, pw, ph);
  }
}

export function renderPageToCanvas(
  page: Page,
  pageWidthMm: number,
  pageHeightMm: number,
  dpi: number,
): { canvas: HTMLCanvasElement; warning?: string } {
  let W = mmToPx(pageWidthMm, dpi);
  let H = mmToPx(pageHeightMm, dpi);
  let warning: string | undefined;
  if (W > MAX_DIM || H > MAX_DIM) {
    const scale = Math.min(MAX_DIM / W, MAX_DIM / H);
    W = Math.round(W * scale);
    H = Math.round(H * scale);
    warning = `Output capped at ${MAX_DIM}px — reduce DPI for full resolution.`;
  }
  const s = W / pageWidthMm;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  drawPageContents(ctx, page, s, 0);
  return { canvas, warning };
}

export function renderSpreadToCanvas(
  spread: (Page | null)[],
  pageWidthMm: number,
  pageHeightMm: number,
  dpi: number,
): { canvas: HTMLCanvasElement; warning?: string } {
  const nonNull = spread.filter((p): p is Page => p !== null);
  const isSingle = nonNull.length <= 1;
  const spreadMm = isSingle ? pageWidthMm : pageWidthMm * 2;
  let W = mmToPx(spreadMm, dpi);
  let H = mmToPx(pageHeightMm, dpi);
  let warning: string | undefined;
  if (W > MAX_DIM || H > MAX_DIM) {
    const scale = Math.min(MAX_DIM / W, MAX_DIM / H);
    W = Math.round(W * scale);
    H = Math.round(H * scale);
    warning = `Output capped at ${MAX_DIM}px — reduce DPI.`;
  }
  const pagePx = isSingle ? W : Math.round(W / 2);
  const s = pagePx / pageWidthMm;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  spread.forEach((page, i) => {
    if (!page) return;
    const offsetX = isSingle ? 0 : i * pagePx;
    drawPageContents(ctx, page, s, offsetX);
  });
  return { canvas, warning };
}

export function canvasToBlob(canvas: HTMLCanvasElement, opts: RenderOptions): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      opts.format === 'jpg' ? 'image/jpeg' : 'image/png',
      opts.format === 'jpg' ? opts.jpgQuality : undefined,
    );
  });
}
