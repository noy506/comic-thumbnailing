import { useState, useEffect, useCallback } from 'react';
import type { Project, Page, Panel } from '../model/types';
import { scheduleSave, saveProject, loadProject } from '../db';

export type ProjectAction =
  | { type: 'SET'; project: Project }
  | { type: 'UPDATE_PAGES'; pages: Page[] }
  | { type: 'UPDATE_PAGE_PANELS'; pageId: string; panels: Panel[] }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Project['settings']> }
  | { type: 'SET_SESSION'; session: Project['activeSession'] };

export function useProject(projectId: string | null) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    if (projectId === null) { setLoading(false); return; }
    setLoading(true);
    loadProject(projectId).then(p => {
      setProject(p ?? null);
      setLoading(false);
    });
  }, [projectId]);

  const dispatch = useCallback((action: ProjectAction) => {
    setProject(prev => {
      if (!prev) return prev;
      let next: Project;

      switch (action.type) {
        case 'SET':
          next = action.project;
          break;
        case 'UPDATE_PAGES':
          next = { ...prev, pages: action.pages };
          break;
        case 'UPDATE_PAGE_PANELS':
          next = {
            ...prev,
            pages: prev.pages.map(p =>
              p.id === action.pageId ? { ...p, panels: action.panels } : p,
            ),
          };
          break;
        case 'UPDATE_SETTINGS':
          next = { ...prev, settings: { ...prev.settings, ...action.settings } };
          break;
        case 'SET_SESSION':
          next = { ...prev, activeSession: action.session };
          break;
      }

      scheduleSave(next);
      return next;
    });
  }, []);

  // Persist immediately (e.g. on first creation)
  const persistNow = useCallback((p: Project) => {
    setProject(p);
    return saveProject(p);
  }, []);

  return { project, loading, dispatch, persistNow };
}
