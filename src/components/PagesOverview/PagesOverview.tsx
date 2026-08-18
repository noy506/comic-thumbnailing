import { useState, useRef, useEffect } from 'react';
import type { Project, Page } from '../../model/types';
import { createPage, uid } from '../../model/factory';
import { getSpreads } from '../../spreads';
import { ExportDialog } from '../ExportDialog/ExportDialog';
import styles from './PagesOverview.module.css';

interface Props {
  project: Project;
  onOpenPage: (pageId: string) => void;
  onPagesChange: (pages: Page[]) => void;
  onHome: () => void;
}

type View = 'pages' | 'spreads';

export function PagesOverview({ project, onOpenPage, onPagesChange, onHome }: Props) {
  const [view, setView] = useState<View>('pages');
  const [showExport, setShowExport] = useState(false);

  const { pages, direction, firstPageIsSingle } = project;

  // ── Page list actions ────────────────────────────────────────────────────

  const addPage = () => onPagesChange([...pages, createPage()]);

  const deletePage = (id: string) => {
    if (pages.length <= 1) return;
    onPagesChange(pages.filter(p => p.id !== id));
  };

  const movePage = (id: string, delta: -1 | 1) => {
    const idx = pages.findIndex(p => p.id === id);
    if (idx < 0) return;
    const next = [...pages];
    const swap = idx + delta;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onPagesChange(next);
  };

  const duplicatePage = (id: string, layoutOnly: boolean) => {
    const src = pages.find(p => p.id === id);
    if (!src) return;
    const copy: Page = {
      id: uid(),
      panels: src.panels.map(panel => ({
        ...panel,
        id: uid(),
        strokes: layoutOnly ? [] : panel.strokes.map(s => ({ ...s, id: uid() })),
      })),
    };
    const idx = pages.findIndex(p => p.id === id);
    const next = [...pages];
    next.splice(idx + 1, 0, copy);
    onPagesChange(next);
  };

  const hasDrawing = (page: Page) => page.panels.some(p => p.strokes.length > 0);

  // ── Spreads view ─────────────────────────────────────────────────────────

  const spreads = getSpreads(pages, direction, firstPageIsSingle);

  const pageNumber = (page: Page) => pages.indexOf(page) + 1;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button className={styles.tabBtn} onClick={onHome}>← Projects</button>
        <h2 className={styles.projectName}>{project.name}</h2>
        <div className={styles.viewToggle}>
          <button className={`${styles.tabBtn} ${view === 'pages' ? styles.active : ''}`} onClick={() => setView('pages')}>Pages</button>
          <button className={`${styles.tabBtn} ${view === 'spreads' ? styles.active : ''}`} onClick={() => setView('spreads')}>Spreads</button>
        </div>
        <button className={styles.tabBtn} onClick={() => setShowExport(true)}>Export</button>
      </div>

      {view === 'pages' && (
        <div className={styles.pageGrid}>
          {pages.map((page, idx) => (
            <div key={page.id} className={styles.pageItem}>
              <button className={styles.thumbnail} onClick={() => onOpenPage(page.id)}>
                <PageThumb page={page} widthMm={project.pageWidthMm} heightMm={project.pageHeightMm} />
                {hasDrawing(page) && <span className={styles.drawnDot} title="Contains drawing" />}
              </button>
              <span className={styles.pageNum}>{String(idx + 1).padStart(2, '0')}</span>
              <div className={styles.pageActions}>
                <button className={styles.actionBtn} onClick={() => movePage(page.id, -1)} disabled={idx === 0}>↑</button>
                <button className={styles.actionBtn} onClick={() => movePage(page.id, 1)} disabled={idx === pages.length - 1}>↓</button>
                <button className={styles.actionBtn} onClick={() => duplicatePage(page.id, false)} title="Duplicate with drawing">⧉</button>
                <button className={styles.actionBtn} onClick={() => duplicatePage(page.id, true)} title="Duplicate layout only">⬜</button>
                <button className={styles.actionBtn} onClick={() => deletePage(page.id)} disabled={pages.length <= 1} title="Delete">✕</button>
              </div>
            </div>
          ))}
          <button className={styles.addPageBtn} onClick={addPage}>+ Page</button>
        </div>
      )}

      {view === 'spreads' && (
        <div className={styles.spreadsContainer}>
          {spreads.map((spread, si) => (
            <div key={si} className={styles.spread}>
              {spread.map((page, pi) => (
                <div key={pi} className={styles.spreadPage}>
                  {page ? (
                    <button className={styles.spreadThumb} onClick={() => onOpenPage(page.id)}>
                      <PageThumb page={page} widthMm={project.pageWidthMm} heightMm={project.pageHeightMm} />
                      <span className={styles.spreadNum}>{String(pageNumber(page)).padStart(2, '0')}</span>
                    </button>
                  ) : (
                    <div className={styles.spreadEmpty} />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {showExport && <ExportDialog project={project} onClose={() => setShowExport(false)} />}
    </div>
  );
}

// Mini thumbnail: canvas-based, draws panel outlines and strokes
function PageThumb({ page, widthMm, heightMm }: { page: Page; widthMm: number; heightMm: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 100;
  const H = Math.round((heightMm / widthMm) * W);
  const s = W / widthMm;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    for (const panel of page.panels) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(panel.x * s, panel.y * s, panel.width * s, panel.height * s);
      ctx.clip();
      for (const stroke of panel.strokes) {
        if (stroke.points.length < 2) continue;
        ctx.beginPath();
        ctx.lineWidth = stroke.width * s;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000';
        ctx.moveTo((panel.x + stroke.points[0].x) * s, (panel.y + stroke.points[0].y) * s);
        for (let j = 1; j < stroke.points.length; j++) {
          ctx.lineTo((panel.x + stroke.points[j].x) * s, (panel.y + stroke.points[j].y) * s);
        }
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(panel.x * s, panel.y * s, panel.width * s, panel.height * s);
    }
    ctx.restore();
  }, [page, W, H, s]);

  return <canvas ref={canvasRef} style={{ display: 'block', width: W, height: H }} />;
}
