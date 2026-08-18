import { useState, useRef, useEffect } from 'react';
import type { Project, Page } from '../../model/types';
import { getSpreads } from '../../spreads';
import { renderPageToCanvas, renderSpreadToCanvas, canvasToBlob, type RenderOptions } from '../../export/render';
import styles from './ExportDialog.module.css';

interface Props {
  project: Project;
  onClose: () => void;
}

export function ExportDialog({ project, onClose }: Props) {
  const [view, setView] = useState<'pages' | 'spreads'>('pages');
  const [selectedPages, setSelectedPages] = useState<Set<string>>(
    () => new Set(project.pages.map(p => p.id)),
  );
  const [selectedSpreads, setSelectedSpreads] = useState<Set<number>>(() => {
    const spreadsInit = getSpreads(project.pages, project.direction, project.firstPageIsSingle);
    return new Set(spreadsInit.map((_, i) => i));
  });
  const [dpiPreset, setDpiPreset] = useState<'screen' | '150' | '300' | 'custom'>('150');
  const [customDpi, setCustomDpi] = useState(150);
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [jpgQuality, setJpgQuality] = useState(0.9);
  const [exporting, setExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const spreads = getSpreads(project.pages, project.direction, project.firstPageIsSingle);
  const dpiMap: Record<string, number> = { screen: 96, '150': 150, '300': 300, custom: customDpi };
  const dpi = dpiMap[dpiPreset];
  const ext = format === 'jpg' ? 'jpg' : 'png';

  const togglePage = (id: string) =>
    setSelectedPages(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleSpread = (i: number) =>
    setSelectedSpreads(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });

  const handleExport = async () => {
    setExporting(true);
    setStatusMsg('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const opts: RenderOptions = { dpi, format, jpgQuality };

      if (view === 'pages') {
        const pages = project.pages.filter(p => selectedPages.has(p.id));
        for (const page of pages) {
          const n = project.pages.indexOf(page) + 1;
          setStatusMsg(`Rendering page ${n}…`);
          await new Promise(r => setTimeout(r, 0));
          const { canvas, warning } = renderPageToCanvas(page, project.pageWidthMm, project.pageHeightMm, dpi);
          if (warning) setStatusMsg(warning);
          zip.file(`page-${String(n).padStart(3, '0')}.${ext}`, await canvasToBlob(canvas, opts));
        }
      } else {
        const selected = spreads.filter((_, i) => selectedSpreads.has(i));
        for (const spread of selected) {
          const n = spreads.indexOf(spread) + 1;
          setStatusMsg(`Rendering spread ${n}…`);
          await new Promise(r => setTimeout(r, 0));
          const { canvas, warning } = renderSpreadToCanvas(spread, project.pageWidthMm, project.pageHeightMm, dpi);
          if (warning) setStatusMsg(warning);
          zip.file(`spread-${String(n).padStart(2, '0')}.${ext}`, await canvasToBlob(canvas, opts));
        }
      }

      setStatusMsg('Bundling…');
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}-export.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg('Done!');
    } catch (e) {
      setStatusMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Export</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${view === 'pages' ? styles.active : ''}`}
            onClick={() => setView('pages')}
          >
            Pages
          </button>
          <button
            className={`${styles.tab} ${view === 'spreads' ? styles.active : ''}`}
            onClick={() => setView('spreads')}
          >
            Spreads
          </button>
        </div>

        {/* Selection area */}
        <div className={styles.selectionArea}>
          <div className={styles.selectionControls}>
            {view === 'pages' ? (
              <>
                <button className={styles.selBtn} onClick={() => setSelectedPages(new Set(project.pages.map(p => p.id)))}>Select All</button>
                <button className={styles.selBtn} onClick={() => setSelectedPages(new Set())}>None</button>
                <span className={styles.selCount}>{selectedPages.size} / {project.pages.length}</span>
              </>
            ) : (
              <>
                <button className={styles.selBtn} onClick={() => setSelectedSpreads(new Set(spreads.map((_, i) => i)))}>Select All</button>
                <button className={styles.selBtn} onClick={() => setSelectedSpreads(new Set())}>None</button>
                <span className={styles.selCount}>{selectedSpreads.size} / {spreads.length}</span>
              </>
            )}
          </div>

          <div className={styles.thumbGrid}>
            {view === 'pages'
              ? project.pages.map((page, idx) => (
                  <label
                    key={page.id}
                    className={`${styles.thumbItem} ${selectedPages.has(page.id) ? styles.selectedItem : ''}`}
                  >
                    <input
                      type="checkbox"
                      className={styles.hiddenCheck}
                      checked={selectedPages.has(page.id)}
                      onChange={() => togglePage(page.id)}
                    />
                    <ExportPageThumb page={page} widthMm={project.pageWidthMm} heightMm={project.pageHeightMm} size={80} />
                    <span className={styles.thumbLabel}>{idx + 1}</span>
                  </label>
                ))
              : spreads.map((spread, si) => (
                  <label
                    key={si}
                    className={`${styles.thumbItem} ${styles.spreadThumbItem} ${selectedSpreads.has(si) ? styles.selectedItem : ''}`}
                  >
                    <input
                      type="checkbox"
                      className={styles.hiddenCheck}
                      checked={selectedSpreads.has(si)}
                      onChange={() => toggleSpread(si)}
                    />
                    <div className={styles.spreadPair}>
                      {spread.map((page, pi) =>
                        page
                          ? <ExportPageThumb key={pi} page={page} widthMm={project.pageWidthMm} heightMm={project.pageHeightMm} size={38} />
                          : <div key={pi} className={styles.emptyThumb} style={{ width: 38 }} />,
                      )}
                    </div>
                    <span className={styles.thumbLabel}>Spread {si + 1}</span>
                  </label>
                ))}
          </div>
        </div>

        {/* Settings */}
        <div className={styles.settings}>
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>Format</span>
            <div className={styles.btnGroup}>
              {(['png', 'jpg'] as const).map(f => (
                <button
                  key={f}
                  className={`${styles.settingBtn} ${format === f ? styles.active : ''}`}
                  onClick={() => setFormat(f)}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {format === 'jpg' && (
            <div className={styles.settingRow}>
              <span className={styles.settingLabel}>Quality {Math.round(jpgQuality * 100)}%</span>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={jpgQuality}
                onChange={e => setJpgQuality(Number(e.target.value))}
                className={styles.slider}
              />
            </div>
          )}
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>Resolution</span>
            <div className={styles.btnGroup}>
              {(['screen', '150', '300', 'custom'] as const).map(p => (
                <button
                  key={p}
                  className={`${styles.settingBtn} ${dpiPreset === p ? styles.active : ''}`}
                  onClick={() => setDpiPreset(p)}
                >
                  {p === 'screen' ? 'Screen' : p === 'custom' ? 'Custom' : `${p} DPI`}
                </button>
              ))}
            </div>
          </div>
          {dpiPreset === 'custom' && (
            <div className={styles.settingRow}>
              <span className={styles.settingLabel}>DPI</span>
              <input
                type="number"
                min={72}
                max={600}
                value={customDpi}
                onChange={e => setCustomDpi(Math.max(72, Math.min(600, Number(e.target.value))))}
                className={styles.numInput}
              />
            </div>
          )}
        </div>

        {statusMsg && <p className={styles.status}>{statusMsg}</p>}

        <div className={styles.footer}>
          <button
            className={styles.exportBtn}
            onClick={handleExport}
            disabled={exporting || (view === 'pages' ? selectedPages.size === 0 : selectedSpreads.size === 0)}
          >
            {exporting
              ? statusMsg || 'Exporting…'
              : `Export ZIP (${view === 'pages' ? selectedPages.size : selectedSpreads.size} items)`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportPageThumb({
  page,
  widthMm,
  heightMm,
  size,
}: {
  page: Page;
  widthMm: number;
  heightMm: number;
  size: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = size;
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
