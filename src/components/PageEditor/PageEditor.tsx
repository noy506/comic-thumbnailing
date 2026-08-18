import { useState, useEffect, useRef, useCallback } from 'react';
import type { Project, Panel, LineWidth } from '../../model/types';
import type { ProjectAction } from '../../hooks/useProject';
import { uid } from '../../model/factory';
import { displayToPage } from '../../coords';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { SessionSetup } from '../SessionSetup/SessionSetup';
import { SessionCanvas } from '../SessionCanvas/SessionCanvas';
import styles from './PageEditor.module.css';

// ── Types ────────────────────────────────────────────────────────────────────

interface PageEditorProps {
  project: Project;
  pageId: string;
  onBack: () => void;
  dispatch: (action: ProjectAction) => void;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface ActiveDrag {
  panelId: string;
  kind: { type: 'move' } | { type: 'resize'; handle: Handle };
  startMm: { x: number; y: number };
  startPanel: Panel;
  pointerId: number;
}

// Phase 3 — ordering mode state
interface OrderState {
  panels: Panel[];       // working copy during ordering
  history: string[];     // panelIds in the order they were tapped
}

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SNAP_THRESHOLD = 2; // mm
const MIN_SIZE = 10; // mm

// ── applyDrag ────────────────────────────────────────────────────────────────

function snap(value: number, candidates: number[], enabled: boolean): number {
  if (!enabled) return value;
  let best = value;
  let bestDelta = Infinity;
  for (const c of candidates) {
    const d = Math.abs(value - c);
    if (d < bestDelta && d <= SNAP_THRESHOLD) {
      bestDelta = d;
      best = c;
    }
  }
  return best;
}

function getEdgeCandidates(panels: Panel[], excludeId: string, pageW: number, pageH: number) {
  const xs = [0, pageW];
  const ys = [0, pageH];
  for (const p of panels) {
    if (p.id === excludeId) continue;
    xs.push(p.x, p.x + p.width);
    ys.push(p.y, p.y + p.height);
  }
  return { xs, ys };
}

function applyDrag(
  startPanel: Panel,
  deltaMm: { x: number; y: number },
  kind: ActiveDrag['kind'],
  allPanels: Panel[],
  pageW: number,
  pageH: number,
  snapEnabled: boolean,
): Partial<Panel> {
  const { xs: candX, ys: candY } = getEdgeCandidates(allPanels, startPanel.id, pageW, pageH);
  const dx = deltaMm.x;
  const dy = deltaMm.y;

  if (kind.type === 'move') {
    let nx = startPanel.x + dx;
    let ny = startPanel.y + dy;

    if (snapEnabled) {
      // Snap leading edge (left/top) and trailing edge (right/bottom), pick best
      const snapLeft = snap(nx, candX, true);
      const snapRight = snap(nx + startPanel.width, candX, true);
      const dLeft = Math.abs(snapLeft - nx);
      const dRight = Math.abs(snapRight - (nx + startPanel.width));
      nx = dLeft <= dRight ? snapLeft : snapRight - startPanel.width;

      const snapTop = snap(ny, candY, true);
      const snapBottom = snap(ny + startPanel.height, candY, true);
      const dTop = Math.abs(snapTop - ny);
      const dBottom = Math.abs(snapBottom - (ny + startPanel.height));
      ny = dTop <= dBottom ? snapTop : snapBottom - startPanel.height;
    }

    // Clamp
    nx = Math.max(0, Math.min(pageW - startPanel.width, nx));
    ny = Math.max(0, Math.min(pageH - startPanel.height, ny));

    return { x: nx, y: ny };
  }

  // Resize
  const handle = kind.handle;
  let nx = startPanel.x;
  let ny = startPanel.y;
  let nw = startPanel.width;
  let nh = startPanel.height;

  if (handle.includes('w')) {
    const newW = Math.max(MIN_SIZE, startPanel.width - dx);
    nx = startPanel.x + (startPanel.width - newW);
    nw = newW;
  }
  if (handle.includes('e')) {
    nw = Math.max(MIN_SIZE, startPanel.width + dx);
  }
  if (handle.includes('n')) {
    const newH = Math.max(MIN_SIZE, startPanel.height - dy);
    ny = startPanel.y + (startPanel.height - newH);
    nh = newH;
  }
  if (handle.includes('s')) {
    nh = Math.max(MIN_SIZE, startPanel.height + dy);
  }

  // Snap moving edges
  if (snapEnabled) {
    if (handle.includes('w')) {
      nx = snap(nx, candX, true);
      nw = (startPanel.x + startPanel.width) - nx;
      nw = Math.max(MIN_SIZE, nw);
    }
    if (handle.includes('e')) {
      const snappedRight = snap(nx + nw, candX, true);
      nw = Math.max(MIN_SIZE, snappedRight - nx);
    }
    if (handle.includes('n')) {
      ny = snap(ny, candY, true);
      nh = (startPanel.y + startPanel.height) - ny;
      nh = Math.max(MIN_SIZE, nh);
    }
    if (handle.includes('s')) {
      const snappedBottom = snap(ny + nh, candY, true);
      nh = Math.max(MIN_SIZE, snappedBottom - ny);
    }
  }

  // Clamp
  nx = Math.max(0, nx);
  ny = Math.max(0, ny);
  nw = Math.min(nw, pageW - nx);
  nh = Math.min(nh, pageH - ny);
  nw = Math.max(MIN_SIZE, nw);
  nh = Math.max(MIN_SIZE, nh);

  return { x: nx, y: ny, width: nw, height: nh };
}

// ── PanelOverlay ─────────────────────────────────────────────────────────────

interface PanelOverlayProps {
  panel: Panel;
  scale: number;
  selected: boolean;
  orderMode: boolean;
}

function PanelOverlay({ panel, scale, selected, orderMode }: PanelOverlayProps) {
  const left = panel.x * scale;
  const top = panel.y * scale;
  const width = panel.width * scale;
  const height = panel.height * scale;

  const isOrdered = panel.order !== null;

  const cls = [
    styles.panel,
    !orderMode && selected ? styles.panelSelected : '',
    orderMode ? (isOrdered ? styles.panelOrdered : styles.panelOrderable) : '',
  ].join(' ');

  return (
    <div
      className={cls}
      style={{ left, top, width, height }}
      data-role="panel"
      data-panel-id={panel.id}
    >
      {isOrdered && (
        <span className={orderMode ? styles.orderBadgeLarge : styles.orderBadge}>
          {panel.order}
        </span>
      )}
      {!orderMode && selected && HANDLES.map(h => (
        <div
          key={h}
          className={`${styles.handle} ${styles[`handle_${h}`]}`}
          data-role="handle"
          data-panel-id={panel.id}
          data-handle={h}
        />
      ))}
    </div>
  );
}

// ── PageEditor — pure router (no conditional hooks) ──────────────────────────

export function PageEditor({ project, pageId, onBack, dispatch }: PageEditorProps) {
  const [pageMode, setPageMode] = useState<'grid' | 'session-setup' | 'session'>('grid');
  const [sessionLineWidth, setSessionLineWidth] = useState<LineWidth>(project.settings.lineWidth);
  const [sessionKey, setSessionKey] = useState(0);

  if (pageMode === 'session-setup') {
    return (
      <SessionSetup
        initialSeconds={project.settings.secondsPerPanel}
        initialLineWidth={project.settings.lineWidth}
        onStart={(seconds, lw) => {
          dispatch({ type: 'UPDATE_SETTINGS', settings: { secondsPerPanel: seconds, lineWidth: lw } });
          setSessionLineWidth(lw);
          setPageMode('session');
        }}
        onBack={() => setPageMode('grid')}
      />
    );
  }

  if (pageMode === 'session') {
    return (
      <SessionCanvas
        key={sessionKey}
        project={project}
        pageId={pageId}
        secondsPerPanel={project.settings.secondsPerPanel}
        lineWidthType={sessionLineWidth}
        dispatch={dispatch}
        onFinished={() => setPageMode('grid')}
        onRetry={() => setSessionKey(k => k + 1)}
        onBack={() => setPageMode('grid')}
        onOverview={onBack}
      />
    );
  }

  return (
    <GridEditor
      project={project}
      pageId={pageId}
      onBack={onBack}
      dispatch={dispatch}
      onStartSession={() => setPageMode('session-setup')}
    />
  );
}

// ── GridEditor — all grid hooks live here (never rendered conditionally) ──────

interface GridEditorProps {
  project: Project;
  pageId: string;
  onBack: () => void;
  dispatch: (action: ProjectAction) => void;
  onStartSession: () => void;
}

function GridEditor({ project, pageId, onBack, dispatch, onStartSession }: GridEditorProps) {
  const page = project.pages.find(p => p.id === pageId);
  const initialPanels = page?.panels ?? [];

  const { value: panels, push, undo, redo, canUndo, canRedo } = useUndoRedo<Panel[]>(initialPanels);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Panel | null>(null);
  const [pagePx, setPagePx] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [orderState, setOrderState] = useState<OrderState | null>(null);

  const [showGridGen, setShowGridGen] = useState(false);
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(3);
  const [gridMargin, setGridMargin] = useState(5);
  const [gridGutter, setGridGutter] = useState(3);

  const activeDragRef = useRef<ActiveDrag | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const pageElRef = useRef<HTMLDivElement | null>(null);
  const strokesCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const firstRenderRef = useRef(true);

  const { pageWidthMm, pageHeightMm } = project;

  // Sync panels → project (skip first render)
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    dispatch({ type: 'UPDATE_PAGE_PANELS', pageId, panels });
  }, [panels, pageId, dispatch]);

  // ResizeObserver for workspace
  useEffect(() => {
    const container = workspaceRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const availW = container.clientWidth - 40;
      const availH = container.clientHeight - 40;
      const ratio = pageWidthMm / pageHeightMm;
      let w = Math.min(availW, availH * ratio);
      let h = w / ratio;
      w = Math.round(w);
      h = Math.round(h);
      setPagePx({ w, h });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [pageWidthMm, pageHeightMm]);

  const scale = pagePx.w > 0 ? pagePx.w / pageWidthMm : 1;

  // ── Draw strokes on background canvas ────────────────────────────────────

  useEffect(() => {
    const canvas = strokesCanvasRef.current;
    if (!canvas || pagePx.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = pagePx.w * dpr;
    canvas.height = pagePx.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, pagePx.w, pagePx.h);
    const s = pagePx.w / pageWidthMm;
    for (const panel of panels) {
      if (!panel.strokes.length) continue;
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
    }
    ctx.restore();
  }, [panels, pagePx, pageWidthMm]);

  const getVt = useCallback(() => {
    const el = pageElRef.current;
    if (!el) return { offsetX: 0, offsetY: 0, scale };
    const rect = el.getBoundingClientRect();
    return { offsetX: rect.left, offsetY: rect.top, scale: rect.width / pageWidthMm };
  }, [pageWidthMm, scale]);

  // ── Pointer handlers ──────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const pageEl = pageElRef.current;
    if (!pageEl) return;

    // ── Order mode: tap a panel to assign the next order number ──────────────
    if (orderState) {
      const panelEl = (e.target as Element).closest('[data-role="panel"]') as HTMLElement | null;
      const panelId = panelEl?.dataset.panelId;
      if (!panelId) return;
      const already = orderState.panels.find(p => p.id === panelId);
      if (already?.order !== null) return; // already ordered → ignore
      e.preventDefault();
      const nextNum = orderState.history.length + 1;
      const updated = orderState.panels.map(p =>
        p.id === panelId ? { ...p, order: nextNum } : p,
      );
      const next: OrderState = { panels: updated, history: [...orderState.history, panelId] };
      setOrderState(next);
      dispatch({ type: 'UPDATE_PAGE_PANELS', pageId, panels: next.panels });
      return;
    }

    // Walk up from target looking for panel or handle
    let el: Element | null = e.target as Element;
    let foundPanelId: string | null = null;
    let foundRole: string | null = null;
    let foundHandle: string | null = null;

    while (el && el !== pageEl) {
      const role = (el as HTMLElement).dataset.role;
      if (role === 'handle' || role === 'panel') {
        foundRole = role;
        foundPanelId = (el as HTMLElement).dataset.panelId ?? null;
        if (role === 'handle') {
          foundHandle = (el as HTMLElement).dataset.handle ?? null;
        }
        break;
      }
      el = el.parentElement;
    }

    if (!foundPanelId || !foundRole) {
      setSelectedId(null);
      return;
    }

    e.preventDefault();
    setSelectedId(foundPanelId);

    const panel = panels.find(p => p.id === foundPanelId);
    if (!panel) return;

    const vt = getVt();
    const mm = displayToPage(e.clientX, e.clientY, vt);

    const kind: ActiveDrag['kind'] =
      foundRole === 'handle' && foundHandle
        ? { type: 'resize', handle: foundHandle as Handle }
        : { type: 'move' };

    activeDragRef.current = {
      panelId: foundPanelId,
      kind,
      startMm: mm,
      startPanel: panel,
      pointerId: e.pointerId,
    };

    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [panels, getVt, orderState, dispatch, pageId]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.preventDefault();

    const vt = getVt();
    const mm = displayToPage(e.clientX, e.clientY, vt);
    const deltaMm = { x: mm.x - drag.startMm.x, y: mm.y - drag.startMm.y };

    const result = applyDrag(
      drag.startPanel, deltaMm, drag.kind,
      panels, pageWidthMm, pageHeightMm, project.settings.snap,
    );
    setDraft({ ...drag.startPanel, ...result });
  }, [panels, pageWidthMm, pageHeightMm, project.settings.snap, getVt]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const vt = getVt();
    const mm = displayToPage(e.clientX, e.clientY, vt);
    const deltaMm = { x: mm.x - drag.startMm.x, y: mm.y - drag.startMm.y };

    const result = applyDrag(
      drag.startPanel, deltaMm, drag.kind,
      panels, pageWidthMm, pageHeightMm, project.settings.snap,
    );

    push(panels.map(p => p.id === drag.panelId ? { ...p, ...result } : p));
    activeDragRef.current = null;
    setDraft(null);
  }, [panels, pageWidthMm, pageHeightMm, project.settings.snap, push, getVt]);

  const handlePointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = activeDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    activeDragRef.current = null;
    setDraft(null);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const addPanel = () => {
    const w = Math.min(40, pageWidthMm * 0.5);
    const h = Math.min(30, pageHeightMm * 0.5);
    const x = (pageWidthMm - w) / 2;
    const y = (pageHeightMm - h) / 2;
    const newPanel: Panel = { id: uid(), x, y, width: w, height: h, order: null, strokes: [] };
    push([...panels, newPanel]);
    setSelectedId(newPanel.id);
  };

  const duplicatePanel = () => {
    if (!selectedId) return;
    const src = panels.find(p => p.id === selectedId);
    if (!src) return;
    const nx = Math.min(src.x + 5, pageWidthMm - src.width);
    const ny = Math.min(src.y + 5, pageHeightMm - src.height);
    const copy: Panel = { ...src, id: uid(), x: nx, y: ny, order: null, strokes: [] };
    push([...panels, copy]);
    setSelectedId(copy.id);
  };

  const deletePanel = () => {
    if (!selectedId) return;
    const panel = panels.find(p => p.id === selectedId);
    if (!panel) return;
    if (panel.strokes.length > 0) {
      if (!window.confirm('This panel has strokes. Delete anyway?')) return;
    }
    push(panels.filter(p => p.id !== selectedId));
    setSelectedId(null);
  };

  const toggleSnap = () => {
    dispatch({ type: 'UPDATE_SETTINGS', settings: { snap: !project.settings.snap } });
  };

  // ── Order mode ────────────────────────────────────────────────────────────

  const enterOrderMode = () => {
    setSelectedId(null);
    // Build history from panels that already have an order (sorted ascending)
    const alreadyOrdered = [...panels]
      .filter(p => p.order !== null)
      .sort((a, b) => (a.order as number) - (b.order as number))
      .map(p => p.id);
    setOrderState({ panels: panels.map(p => ({ ...p })), history: alreadyOrdered });
  };

  const undoLastOrder = () => {
    if (!orderState || orderState.history.length === 0) return;
    const lastId = orderState.history[orderState.history.length - 1];
    const updated = orderState.panels.map(p => p.id === lastId ? { ...p, order: null } : p);
    const next: OrderState = {
      panels: updated,
      history: orderState.history.slice(0, -1),
    };
    setOrderState(next);
    dispatch({ type: 'UPDATE_PAGE_PANELS', pageId, panels: next.panels });
  };

  const clearOrder = () => {
    if (!orderState) return;
    const updated = orderState.panels.map(p => ({ ...p, order: null }));
    const next: OrderState = { panels: updated, history: [] };
    setOrderState(next);
    dispatch({ type: 'UPDATE_PAGE_PANELS', pageId, panels: next.panels });
  };

  const doneOrdering = () => {
    if (!orderState) return;
    push(orderState.panels);   // commits to undo stack; sync effect saves to project
    setOrderState(null);
  };

  // ── Grid generator ────────────────────────────────────────────────────────

  const generateGrid = () => {
    const cols = Math.max(1, gridCols);
    const rows = Math.max(1, gridRows);
    const margin = Math.max(0, gridMargin);
    const gutter = Math.max(0, gridGutter);
    const panelW = (pageWidthMm - 2 * margin - (cols - 1) * gutter) / cols;
    const panelH = (pageHeightMm - 2 * margin - (rows - 1) * gutter) / rows;
    if (panelW < 5 || panelH < 5) return; // too small
    const generated: Panel[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        generated.push({
          id: uid(),
          x: margin + c * (panelW + gutter),
          y: margin + r * (panelH + gutter),
          width: panelW,
          height: panelH,
          order: null,
          strokes: [],
        });
      }
    }
    push(generated);
    setShowGridGen(false);
    setSelectedId(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const displayPanels = orderState
    ? orderState.panels
    : draft
      ? panels.map(p => p.id === draft.id ? draft : p)
      : panels;

  const allOrdered = displayPanels.every(p => p.order !== null);

  const pageIndex = project.pages.findIndex(p => p.id === pageId);

  return (
    <div className={styles.root}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        {orderState ? (
          // ── Order mode toolbar ──────────────────────────────────────────
          <>
            <button
              className={`${styles.toolBtn} ${allOrdered ? styles.active : ''}`}
              onClick={doneOrdering}
            >
              {allOrdered ? '✓ Done' : 'Done'}
            </button>
            <span className={styles.pageIndicator}>
              Order mode — {orderState.history.length} / {orderState.panels.length} panels
            </span>
            <button
              className={styles.toolBtn}
              onClick={undoLastOrder}
              disabled={orderState.history.length === 0}
            >
              Undo Last
            </button>
            <button
              className={styles.toolBtn}
              onClick={clearOrder}
              disabled={orderState.history.length === 0}
            >
              Clear Order
            </button>
          </>
        ) : (
          // ── Grid mode toolbar ───────────────────────────────────────────
          <>
            <button className={styles.toolBtn} onClick={onBack}>← Overview</button>
            <span className={styles.pageIndicator}>
              Page {pageIndex + 1} / {project.pages.length}
            </span>
            <button className={styles.toolBtn} onClick={undo} disabled={!canUndo}>Undo</button>
            <button className={styles.toolBtn} onClick={redo} disabled={!canRedo}>Redo</button>
            <button className={styles.toolBtn} onClick={addPanel}>+ Panel</button>
            <button
              className={`${styles.toolBtn} ${showGridGen ? styles.active : ''}`}
              onClick={() => setShowGridGen(v => !v)}
            >
              ⊞ Grid
            </button>
            <button
              className={`${styles.toolBtn} ${project.settings.snap ? styles.active : ''}`}
              onClick={toggleSnap}
            >
              Snap
            </button>
            <button
              className={`${styles.toolBtn} ${allOrdered && panels.length > 0 ? styles.ordered : ''}`}
              onClick={enterOrderMode}
              disabled={panels.length === 0}
            >
              {allOrdered && panels.length > 0 ? '✓ Order' : 'Set Order'}
            </button>
            <button
              className={styles.toolBtn}
              onClick={onStartSession}
              disabled={!allOrdered || panels.length === 0}
            >
              ▶ Session
            </button>
          </>
        )}
      </div>

      {/* Grid generator bar */}
      {!orderState && showGridGen && (
        <div className={styles.gridGenBar}>
          <label className={styles.gridGenField}>
            <span>Rows</span>
            <input type="number" min={1} max={20} value={gridRows}
              onChange={e => setGridRows(Math.max(1, Math.min(20, Number(e.target.value))))} />
          </label>
          <label className={styles.gridGenField}>
            <span>Cols</span>
            <input type="number" min={1} max={20} value={gridCols}
              onChange={e => setGridCols(Math.max(1, Math.min(20, Number(e.target.value))))} />
          </label>
          <label className={styles.gridGenField}>
            <span>Margin mm</span>
            <input type="number" min={0} max={50} value={gridMargin}
              onChange={e => setGridMargin(Math.max(0, Number(e.target.value)))} />
          </label>
          <label className={styles.gridGenField}>
            <span>Gutter mm</span>
            <input type="number" min={0} max={30} value={gridGutter}
              onChange={e => setGridGutter(Math.max(0, Number(e.target.value)))} />
          </label>
          <button className={styles.gridGenApply} onClick={generateGrid}>
            Generate
          </button>
        </div>
      )}

      {/* Context bar — hidden in order mode */}
      {!orderState && selectedId && (
        <div className={styles.contextBar}>
          <button className={styles.toolBtn} onClick={duplicatePanel}>Duplicate</button>
          <button className={styles.toolBtn} onClick={deletePanel}>Delete</button>
        </div>
      )}

      {/* Workspace */}
      <div className={styles.workspace} ref={workspaceRef}>
        {pagePx.w > 0 && (
          <div
            className={styles.page}
            ref={pageElRef}
            style={{ width: pagePx.w, height: pagePx.h }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {/* Strokes layer — rendered behind panel overlays */}
            <canvas
              ref={strokesCanvasRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: pagePx.w,
                height: pagePx.h,
                pointerEvents: 'none',
              }}
            />
            {displayPanels.map(panel => (
              <PanelOverlay
                key={panel.id}
                panel={panel}
                scale={scale}
                selected={panel.id === selectedId}
                orderMode={orderState !== null}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
