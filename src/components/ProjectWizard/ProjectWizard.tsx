import { useState } from 'react';
import type { Direction, Unit } from '../../model/types';
import { PAGE_PRESETS } from '../../model/types';
import { toMm } from '../../coords';
import { createProject } from '../../model/factory';
import { saveProject } from '../../db';
import type { Project } from '../../model/types';
import styles from './ProjectWizard.module.css';

interface Props {
  onCreated: (project: Project) => void;
}

type PresetKey = 'A4' | 'A5' | 'Square' | 'Custom';

export function ProjectWizard({ onCreated }: Props) {
  const [name,          setName]          = useState('Untitled');
  const [pageCount,     setPageCount]     = useState(8);
  const [preset,        setPreset]        = useState<PresetKey>('A4');
  const [customW,       setCustomW]       = useState(200);
  const [customH,       setCustomH]       = useState(270);
  const [unit,          setUnit]          = useState<Unit>('mm');
  const [direction,     setDirection]     = useState<Direction>('ltr');
  const [firstSingle,   setFirstSingle]   = useState(true);
  const [error,         setError]         = useState('');

  const resolvedMm = (): { w: number; h: number } => {
    if (preset !== 'Custom') return PAGE_PRESETS[preset];
    return { w: toMm(customW, unit), h: toMm(customH, unit) };
  };

  const handleCreate = async () => {
    const { w, h } = resolvedMm();
    if (w < 10 || h < 10) { setError('Page must be at least 10 mm in each dimension.'); return; }
    if (pageCount < 1 || pageCount > 500) { setError('Page count must be 1 – 500.'); return; }
    const project = createProject(name.trim() || 'Untitled', pageCount, w, h, direction, firstSingle);
    await saveProject(project);
    onCreated(project);
  };

  const { w: previewW, h: previewH } = resolvedMm();

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h1 className={styles.title}>New Project</h1>

        <label className={styles.label}>
          Name
          <input className={styles.input} value={name} onChange={e => setName(e.target.value)} />
        </label>

        <label className={styles.label}>
          Pages
          <input
            className={styles.input}
            type="number" min={1} max={500}
            value={pageCount}
            onChange={e => setPageCount(Number(e.target.value))}
          />
        </label>

        <fieldset className={styles.fieldset}>
          <legend>Page size</legend>
          <div className={styles.presetRow}>
            {(['A4', 'A5', 'Square', 'Custom'] as PresetKey[]).map(p => (
              <button
                key={p}
                className={`${styles.presetBtn} ${preset === p ? styles.active : ''}`}
                onClick={() => setPreset(p)}
              >{p}</button>
            ))}
          </div>

          {preset === 'Custom' && (
            <div className={styles.customRow}>
              <input
                className={styles.dimInput}
                type="number" min={1}
                value={customW}
                onChange={e => setCustomW(Number(e.target.value))}
              />
              <span>×</span>
              <input
                className={styles.dimInput}
                type="number" min={1}
                value={customH}
                onChange={e => setCustomH(Number(e.target.value))}
              />
              <select className={styles.unitSelect} value={unit} onChange={e => setUnit(e.target.value as Unit)}>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="in">in</option>
                <option value="px">px</option>
              </select>
            </div>
          )}

          <p className={styles.hint}>{Math.round(previewW)} × {Math.round(previewH)} mm</p>
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend>Reading direction</legend>
          <div className={styles.toggleRow}>
            <button
              className={`${styles.toggleBtn} ${direction === 'ltr' ? styles.active : ''}`}
              onClick={() => setDirection('ltr')}
            >LTR →</button>
            <button
              className={`${styles.toggleBtn} ${direction === 'rtl' ? styles.active : ''}`}
              onClick={() => setDirection('rtl')}
            >← RTL</button>
          </div>
        </fieldset>

        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={firstSingle}
            onChange={e => setFirstSingle(e.target.checked)}
          />
          Page 1 is a single page (not part of a spread)
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.createBtn} onClick={handleCreate}>
          Create Project
        </button>
      </div>
    </div>
  );
}
