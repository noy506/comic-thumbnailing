import { useState } from 'react';
import type { LineWidth } from '../../model/types';
import styles from './SessionSetup.module.css';

interface SessionSetupProps {
  initialSeconds: number;
  initialLineWidth: LineWidth;
  onStart: (seconds: number, lineWidth: LineWidth) => void;
  onBack: () => void;
}

type Preset = 15 | 30 | 45 | 60 | 120 | 'custom';

const PRESETS: Preset[] = [15, 30, 45, 60, 120, 'custom'];

function presetLabel(p: Preset): string {
  if (p === 'custom') return 'Custom';
  if (p === 120) return '2 min';
  return `${p}s`;
}

function secondsToPreset(s: number): Preset {
  if (s === 15) return 15;
  if (s === 30) return 30;
  if (s === 45) return 45;
  if (s === 60) return 60;
  if (s === 120) return 120;
  return 'custom';
}

export function SessionSetup({ initialSeconds, initialLineWidth, onStart, onBack }: SessionSetupProps) {
  const [selectedPreset, setSelectedPreset] = useState<Preset>(secondsToPreset(initialSeconds));
  const [customSeconds, setCustomSeconds] = useState<number>(
    secondsToPreset(initialSeconds) === 'custom' ? initialSeconds : 30,
  );
  const [lineWidth, setLineWidth] = useState<LineWidth>(initialLineWidth);

  const resolvedSeconds = selectedPreset === 'custom'
    ? Math.max(5, customSeconds)
    : selectedPreset;

  const handleStart = () => {
    onStart(resolvedSeconds, lineWidth);
  };

  const LINE_HEIGHTS: Record<LineWidth, number> = { thin: 2, medium: 4, thick: 7 };
  const LINE_LABELS: Record<LineWidth, string> = { thin: 'Thin', medium: 'Medium', thick: 'Thick' };

  return (
    <div className={styles.overlay}>
      <button className={styles.backBtn} onClick={onBack}>← Back</button>

      <h1 className={styles.heading}>Session Setup</h1>

      {/* Time per panel */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Time per panel</h2>
        <div className={styles.presetRow}>
          {PRESETS.map(p => (
            <button
              key={p}
              className={`${styles.presetBtn} ${selectedPreset === p ? styles.presetActive : ''}`}
              onClick={() => setSelectedPreset(p)}
            >
              {presetLabel(p)}
            </button>
          ))}
        </div>
        {selectedPreset === 'custom' && (
          <div className={styles.customRow}>
            <label className={styles.customLabel} htmlFor="custom-seconds">
              Seconds:
            </label>
            <input
              id="custom-seconds"
              className={styles.customInput}
              type="number"
              min={5}
              value={customSeconds}
              onChange={e => setCustomSeconds(Math.max(5, parseInt(e.target.value, 10) || 5))}
            />
          </div>
        )}
      </section>

      {/* Line width */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Line width</h2>
        <div className={styles.lineWidthRow}>
          {(['thin', 'medium', 'thick'] as LineWidth[]).map(lw => (
            <button
              key={lw}
              className={`${styles.lineWidthBtn} ${lineWidth === lw ? styles.lineWidthActive : ''}`}
              onClick={() => setLineWidth(lw)}
            >
              <span className={styles.linePreview} style={{ height: LINE_HEIGHTS[lw] }} />
              {LINE_LABELS[lw]}
            </button>
          ))}
        </div>
      </section>

      <button className={styles.startBtn} onClick={handleStart}>
        Start Session →
      </button>
    </div>
  );
}
