import { useState, useEffect, useCallback } from 'react';
import type { Project } from '../../model/types';
import { listProjects, deleteProject } from '../../db';
import styles from './HomeScreen.module.css';

interface Props {
  onOpen: (id: string) => void;
  onNew: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function HomeScreen({ onOpen, onNew }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listProjects()
      .then(all => {
        const sorted = [...all].sort((a, b) => b.createdAt - a.createdAt);
        setProjects(sorted);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    deleteProject(id).then(load);
  };

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>Comic Thumbnailing</h1>
        <button className={styles.newBtn} onClick={onNew}>+ New</button>
      </header>

      {loading ? (
        <div className={styles.splash}>Loading…</div>
      ) : projects.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyText}>No projects yet.</p>
          <button className={styles.createFirstBtn} onClick={onNew}>
            Create first project
          </button>
        </div>
      ) : (
        <ul className={styles.list}>
          {projects.map(p => (
            <li
              key={p.id}
              className={styles.card}
              onClick={() => onOpen(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(p.id); }}
            >
              <div className={styles.cardBody}>
                <span className={styles.cardName}>{p.name}</span>
                <span className={styles.cardMeta}>
                  {p.pages.length} {p.pages.length === 1 ? 'page' : 'pages'} &middot;{' '}
                  {p.pageWidthMm}&thinsp;&times;&thinsp;{p.pageHeightMm}&thinsp;mm &middot;{' '}
                  {p.direction.toUpperCase()}
                </span>
                <span className={styles.cardDate}>{formatDate(p.createdAt)}</span>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={e => handleDelete(e, p.id)}
                aria-label={`Delete ${p.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
