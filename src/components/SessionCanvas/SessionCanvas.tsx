import { useState, useRef, useEffect, useCallback } from 'react';
import type { Project, Panel, Stroke, Point, LineWidth } from '../../model/types';
import type { ProjectAction } from '../../hooks/useProject';
import { LINE_WIDTH_MM } from '../../model/types';
import { uid } from '../../model/factory';
import { getSpreads } from '../../spreads';
import styles from './SessionCanvas.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionCanvasProps {
  project: Project;
  pageId: string;
  spreadSiblingPageId?: string;
  secondsPerPanel: number;
  lineWidthType: LineWidth;
  dispatch: (action: ProjectAction) => void;
  onFinished: () => void;
  onRetry: () => void;
  onBack: () => void;
  onOverview: () => void;
}

type Phase = 'countdown' | 'drawing' | 'paused' | 'finished';

type LiveStroke = { points: Point[]; width: number; pointerId: number };

type SpreadPanel = Panel & { sourcePageId: string; xOffset: number };

const SPREAD_GAP_MM = 4;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const secs = Math.ceil(ms / 1000);
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

// ── SessionCanvas ─────────────────────────────────────────────────────────────

export function SessionCanvas({
  project,
  pageId,
  spreadSiblingPageId,
  secondsPerPanel,
  lineWidthType,
  dispatch,
  onFinished,
  onRetry,
  onBack,
  onOverview,
}: SessionCanvasProps) {
  const durationMs = secondsPerPanel * 1000;
  const lineWidthMm = LINE_WIDTH_MM[lineWidthType];

  const page = project.pages.find(p => p.id === pageId);
  const siblingPage = spreadSiblingPageId
    ? project.pages.find(p => p.id === spreadSiblingPageId)
    : undefined;
  const isSpreadMode = !!siblingPage;
  const totalWidthMm = isSpreadMode
    ? project.pageWidthMm * 2 + SPREAD_GAP_MM
    : project.pageWidthMm;

  // Build ordered panels (with page offset for spread mode)
  let orderedPanels: SpreadPanel[];
  if (isSpreadMode) {
    const spreadList = getSpreads(project.pages, project.direction, project.firstPageIsSingle);
    const spread = spreadList.find(s => s.some(p => p?.id === pageId));
    const [leftP, rightP] = spread ?? [null, null];
    const toSpreadPanels = (pg: typeof leftP, xOff: number): SpreadPanel[] =>
      (pg?.panels ?? [])
        .filter(p => p.order !== null)
        .sort((a, b) => (a.order as number) - (b.order as number))
        .map(p => ({ ...p, sourcePageId: pg!.id, xOffset: xOff }));
    orderedPanels = [
      ...toSpreadPanels(leftP, 0),
      ...toSpreadPanels(rightP, project.pageWidthMm + SPREAD_GAP_MM),
    ];
  } else {
    orderedPanels = (page?.panels ?? [])
      .filter(p => p.order !== null)
      .sort((a, b) => (a.order as number) - (b.order as number))
      .map(p => ({ ...p, sourcePageId: pageId, xOffset: 0 }));
  }

  // ── Refs (never trigger re-renders) ───────────────────────────────────────

  const liveStrokeRef = useRef<LiveStroke | null>(null);
  const currentStrokesRef = useRef<Stroke[]>([]);
  const undoHistoryRef = useRef<Stroke[][]>([]);
  const committedRef = useRef<Map<string, Stroke[]>>(new Map());
  const deadlineRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('countdown');
  const panelIdxRef = useRef<number>(0);
  const frozenMsRef = useRef<number>(durationMs);
  const expirePanelRef = useRef<() => void>(() => undefined);

  // ── State (for UI) ────────────────────────────────────────────────────────

  const [phase_, setPhase_] = useState<Phase>('countdown');
  const [panelIdx_, setPanelIdx_] = useState<number>(0);
  const [countNum, setCountNum] = useState<3 | 2 | 1>(3);
  const [displayMs, setDisplayMs] = useState<number>(durationMs);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [pagePx, setPagePx] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [redrawTick, setRedrawTick] = useState<number>(0);

  const phase = phase_;
  const panelIdx = panelIdx_;

  // ── Sync setters ──────────────────────────────────────────────────────────

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase_(p);
  }, []);

  const setPanelIdx = useCallback((i: number) => {
    panelIdxRef.current = i;
    setPanelIdx_(i);
  }, []);

  // ── Canvas / container refs ────────────────────────────────────────────────

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── redrawCanvas ──────────────────────────────────────────────────────────

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const scale = cssW / totalWidthMm;

    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, cssW, cssH);

    if (isSpreadMode) {
      // Gap between pages
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(0, 0, cssW, cssH);
      // Left page background
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, project.pageWidthMm * scale, cssH);
      // Right page background
      ctx.fillRect((project.pageWidthMm + SPREAD_GAP_MM) * scale, 0, project.pageWidthMm * scale, cssH);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cssW, cssH);
    }

    for (let i = 0; i < orderedPanels.length; i++) {
      const panel = orderedPanels[i];
      const xOff = panel.xOffset;
      const px = (xOff + panel.x) * scale;
      const py = panel.y * scale;
      const pw = panel.width * scale;
      const ph = panel.height * scale;

      // Active panel tint
      if (i === panelIdxRef.current && phaseRef.current === 'drawing') {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(px, py, pw, ph);
      }

      // Panel border
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, pw, ph);

      // Clip to panel
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();

      // Get strokes for this panel
      const strokes: Stroke[] =
        phaseRef.current === 'finished'
          ? (committedRef.current.get(panel.id) ?? panel.strokes)
          : i === panelIdxRef.current
            ? currentStrokesRef.current
            : (committedRef.current.get(panel.id) ?? []);

      for (const stroke of strokes) {
        if (stroke.points.length < 2) continue;
        ctx.beginPath();
        ctx.lineWidth = stroke.width * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000';
        ctx.moveTo((xOff + panel.x + stroke.points[0].x) * scale, (panel.y + stroke.points[0].y) * scale);
        for (let j = 1; j < stroke.points.length; j++) {
          ctx.lineTo((xOff + panel.x + stroke.points[j].x) * scale, (panel.y + stroke.points[j].y) * scale);
        }
        ctx.stroke();
      }

      const live = liveStrokeRef.current;
      if (i === panelIdxRef.current && live && live.points.length >= 2) {
        ctx.beginPath();
        ctx.lineWidth = live.width * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000';
        ctx.moveTo((xOff + panel.x + live.points[0].x) * scale, (panel.y + live.points[0].y) * scale);
        for (let j = 1; j < live.points.length; j++) {
          ctx.lineTo((xOff + panel.x + live.points[j].x) * scale, (panel.y + live.points[j].y) * scale);
        }
        ctx.stroke();
      }

      ctx.restore();
    }

    ctx.restore();
  }, [orderedPanels, totalWidthMm, isSpreadMode, project.pageWidthMm]);

  // ── ResizeObserver ────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const availW = container.clientWidth - 40;
      const availH = container.clientHeight - 40;
      const ratio = totalWidthMm / project.pageHeightMm;
      const w = Math.round(Math.min(availW, availH * ratio));
      const h = Math.round(w / ratio);
      setPagePx({ w, h });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [totalWidthMm, project.pageHeightMm]);

  // Set canvas dimensions when pagePx changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || pagePx.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = pagePx.w * dpr;
    canvas.height = pagePx.h * dpr;
    redrawCanvas();
  }, [pagePx, redrawCanvas]);

  // ── expirePanel ───────────────────────────────────────────────────────────

  const expirePanel = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    deadlineRef.current = null;

    let finalStrokes = [...currentStrokesRef.current];
    if (liveStrokeRef.current && liveStrokeRef.current.points.length >= 2) {
      finalStrokes = [
        ...finalStrokes,
        { id: uid(), points: liveStrokeRef.current.points, width: liveStrokeRef.current.width },
      ];
      liveStrokeRef.current = null;
    }

    const activePanel = orderedPanels[panelIdxRef.current];
    committedRef.current = new Map(committedRef.current).set(activePanel.id, finalStrokes);

    // Dispatch strokes to the correct page(s)
    if (isSpreadMode && siblingPage && page) {
      for (const pg of [page, siblingPage]) {
        const updatedPanels = pg.panels.map(p => {
          const saved = committedRef.current.get(p.id);
          return saved !== undefined ? { ...p, strokes: saved } : p;
        });
        dispatch({ type: 'UPDATE_PAGE_PANELS', pageId: pg.id, panels: updatedPanels });
      }
    } else {
      const updatedPanels = (page?.panels ?? []).map(p => {
        const saved = committedRef.current.get(p.id);
        return saved !== undefined ? { ...p, strokes: saved } : p;
      });
      dispatch({ type: 'UPDATE_PAGE_PANELS', pageId, panels: updatedPanels });
    }

    const nextIdx = panelIdxRef.current + 1;
    if (nextIdx >= orderedPanels.length) {
      currentStrokesRef.current = [];
      undoHistoryRef.current = [];
      setRedrawTick(t => t + 1);
      setPhase('finished');
      return;
    }

    currentStrokesRef.current = [];
    undoHistoryRef.current = [];
    setPanelIdx(nextIdx);
    setRedrawTick(t => t + 1);

    deadlineRef.current = performance.now() + durationMs;
    setDisplayMs(durationMs);
    setPhase_(p => { void p; return 'drawing'; });
    phaseRef.current = 'drawing';

    const tick = () => {
      const dl = deadlineRef.current;
      if (dl === null) return;
      const remaining = dl - performance.now();
      if (remaining <= 0) {
        setDisplayMs(0);
        expirePanelRef.current();
        return;
      }
      setDisplayMs(remaining);
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [orderedPanels, page, pageId, siblingPage, isSpreadMode, dispatch, durationMs, setPhase, setPanelIdx]);

  expirePanelRef.current = expirePanel;

  // ── Countdown effect (once on mount) ──────────────────────────────────────

  useEffect(() => {
    let n = 3;
    setCountNum(3);
    const id = setInterval(() => {
      n--;
      if (n === 0) {
        clearInterval(id);
        deadlineRef.current = performance.now() + durationMs;
        setPhase('drawing');
        setDisplayMs(durationMs);
      } else {
        setCountNum(n as 3 | 2 | 1);
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Timer rAF effect ──────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'drawing') return;

    const tick = () => {
      const dl = deadlineRef.current;
      if (dl === null) return;
      const remaining = dl - performance.now();
      if (remaining <= 0) {
        setDisplayMs(0);
        expirePanelRef.current();
        return;
      }
      setDisplayMs(remaining);
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [phase]);

  // ── Page Visibility effect (once on mount) ────────────────────────────────

  useEffect(() => {
    const handler = () => {
      if (
        document.hidden &&
        phaseRef.current === 'drawing' &&
        deadlineRef.current !== null
      ) {
        const remaining = Math.max(0, deadlineRef.current - performance.now());
        frozenMsRef.current = remaining;
        deadlineRef.current = null;
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (liveStrokeRef.current && liveStrokeRef.current.points.length >= 2) {
          const s: Stroke = {
            id: uid(),
            points: liveStrokeRef.current.points,
            width: liveStrokeRef.current.width,
          };
          const prev = currentStrokesRef.current;
          currentStrokesRef.current = [...prev, s];
          undoHistoryRef.current = [...undoHistoryRef.current, prev];
          liveStrokeRef.current = null;
          setRedrawTick(t => t + 1);
        }
        setDisplayMs(remaining);
        setPhase('paused');
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Canvas redraw on state changes ────────────────────────────────────────

  useEffect(() => {
    redrawCanvas();
  }, [redrawTick, pagePx, redrawCanvas]);

  // ── Pointer event handlers ────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'pen') return;
    if (phaseRef.current !== 'drawing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === 'eraser') {
      const rect = canvas.getBoundingClientRect();
      const s = rect.width / totalWidthMm;
      const panel = orderedPanels[panelIdxRef.current];
      const ptX = (e.clientX - rect.left) / s - panel.xOffset - panel.x;
      const ptY = (e.clientY - rect.top) / s - panel.y;
      const THRESH = 3;
      const hitId =
        currentStrokesRef.current.find(stroke =>
          stroke.points.some(pt => Math.hypot(pt.x - ptX, pt.y - ptY) <= THRESH),
        )?.id ?? null;
      if (hitId) {
        undoHistoryRef.current = [...undoHistoryRef.current, currentStrokesRef.current];
        currentStrokesRef.current = currentStrokesRef.current.filter(st => st.id !== hitId);
        setRedrawTick(t => t + 1);
      }
      return;
    }

    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const s = rect.width / totalWidthMm;
    const panel = orderedPanels[panelIdxRef.current];
    const ptX = (e.clientX - rect.left) / s - panel.xOffset - panel.x;
    const ptY = (e.clientY - rect.top) / s - panel.y;

    liveStrokeRef.current = { points: [{ x: ptX, y: ptY }], width: lineWidthMm, pointerId: e.pointerId };
    redrawCanvas();
  }, [tool, orderedPanels, totalWidthMm, lineWidthMm, redrawCanvas]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== 'drawing') return;
    const live = liveStrokeRef.current;
    if (!live || live.pointerId !== e.pointerId) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const rect = canvas.getBoundingClientRect();
    const s = rect.width / totalWidthMm;
    const panel = orderedPanels[panelIdxRef.current];

    for (const ev of events) {
      if (ev.pointerType !== 'pen') continue;
      const ptX = (ev.clientX - rect.left) / s - panel.xOffset - panel.x;
      const ptY = (ev.clientY - rect.top) / s - panel.y;
      liveStrokeRef.current!.points.push({ x: ptX, y: ptY });
    }

    redrawCanvas();
  }, [orderedPanels, totalWidthMm, redrawCanvas]);

  const commitLiveStroke = useCallback((pointerId: number) => {
    const live = liveStrokeRef.current;
    if (!live || live.pointerId !== pointerId) return;
    if (live.points.length >= 2) {
      undoHistoryRef.current = [...undoHistoryRef.current, currentStrokesRef.current];
      currentStrokesRef.current = [
        ...currentStrokesRef.current,
        { id: uid(), points: live.points, width: live.width },
      ];
    }
    liveStrokeRef.current = null;
    setRedrawTick(t => t + 1);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    commitLiveStroke(e.pointerId);
  }, [commitLiveStroke]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    commitLiveStroke(e.pointerId);
  }, [commitLiveStroke]);

  // ── Undo ──────────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (undoHistoryRef.current.length === 0) return;
    currentStrokesRef.current = undoHistoryRef.current[undoHistoryRef.current.length - 1];
    undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
    setRedrawTick(t => t + 1);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.root}>
      {/* HUD */}
      {(phase === 'drawing' || phase === 'paused') && (
        <div className={styles.hud}>
          <button className={styles.hudBack} onClick={onBack}>✕</button>
          <span className={styles.timer}>{formatTime(displayMs)}</span>
          <span className={styles.panelCount}>Panel {panelIdx + 1} / {orderedPanels.length}</span>
          <div className={styles.tools}>
            <button
              className={`${styles.toolBtn} ${tool === 'pen' ? styles.active : ''}`}
              onClick={() => setTool('pen')}
            >
              Pen
            </button>
            <button
              className={`${styles.toolBtn} ${tool === 'eraser' ? styles.active : ''}`}
              onClick={() => setTool('eraser')}
            >
              Eraser
            </button>
            <button className={styles.toolBtn} onClick={handleUndo}>Undo</button>
          </div>
        </div>
      )}

      {/* Canvas workspace */}
      <div className={styles.workspace} ref={containerRef}>
        {pagePx.w > 0 && (
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            style={{ width: pagePx.w, height: pagePx.h }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          />
        )}
      </div>

      {/* Countdown overlay */}
      {phase === 'countdown' && (
        <div className={styles.countdownOverlay}>
          <span className={styles.countdownNum}>{countNum}</span>
        </div>
      )}

      {/* Paused overlay */}
      {phase === 'paused' && (
        <div className={styles.pausedOverlay}>
          <p className={styles.pausedText}>Session paused</p>
          <button
            className={styles.resumeBtn}
            onClick={() => {
              deadlineRef.current = performance.now() + frozenMsRef.current;
              setPhase('drawing');
            }}
          >
            Continue →
          </button>
        </div>
      )}

      {/* Finished overlay */}
      {phase === 'finished' && (
        <div className={styles.finishedOverlay}>
          <p className={styles.finishedTitle}>Done!</p>
          <div className={styles.finishedActions}>
            <button className={styles.finishedBtn} onClick={onRetry}>↩ Retry</button>
            <button className={styles.finishedBtn} onClick={onFinished}>✏ Edit Grid</button>
            <button className={styles.finishedBtn} onClick={onOverview}>≡ Overview</button>
          </div>
        </div>
      )}
    </div>
  );
}
