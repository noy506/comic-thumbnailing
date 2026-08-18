import { useState, useEffect } from 'react';
import { ProjectWizard } from './components/ProjectWizard/ProjectWizard';
import { PagesOverview } from './components/PagesOverview/PagesOverview';
import { HomeScreen } from './components/HomeScreen/HomeScreen';
import { PageEditor } from './components/PageEditor/PageEditor';
import { useProject } from './hooks/useProject';
import './index.css';

type Screen =
  | { tag: 'loading' }
  | { tag: 'home' }
  | { tag: 'wizard' }
  | { tag: 'overview'; projectId: string }
  | { tag: 'page'; projectId: string; pageId: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ tag: 'loading' });

  useEffect(() => {
    setScreen({ tag: 'home' });
  }, []);

  const projectId =
    screen.tag === 'overview' || screen.tag === 'page' ? screen.projectId : null;

  const { project, loading: projLoading, dispatch } = useProject(projectId);

  if (screen.tag === 'loading') {
    return <div className="splash">Loading…</div>;
  }

  if (screen.tag === 'home') {
    return (
      <HomeScreen
        onOpen={id => setScreen({ tag: 'overview', projectId: id })}
        onNew={() => setScreen({ tag: 'wizard' })}
      />
    );
  }

  if (screen.tag === 'wizard') {
    return (
      <ProjectWizard
        onCreated={p => setScreen({ tag: 'overview', projectId: p.id })}
      />
    );
  }

  if (projLoading && (screen.tag === 'overview' || screen.tag === 'page')) {
    return <div className="splash">Loading project…</div>;
  }

  if (!project && (screen.tag === 'overview' || screen.tag === 'page')) {
    return (
      <div className="splash">
        Project not found.{' '}
        <button onClick={() => setScreen({ tag: 'home' })}>Back to home</button>
      </div>
    );
  }

  if (screen.tag === 'overview' && project) {
    return (
      <PagesOverview
        project={project}
        onOpenPage={pageId =>
          setScreen({ tag: 'page', projectId: screen.projectId, pageId })
        }
        onPagesChange={pages => dispatch({ type: 'UPDATE_PAGES', pages })}
        onHome={() => setScreen({ tag: 'home' })}
      />
    );
  }

  if (screen.tag === 'page' && project) {
    return (
      <PageEditor
        project={project}
        pageId={screen.pageId}
        onBack={() =>
          setScreen({ tag: 'overview', projectId: screen.projectId })
        }
        dispatch={dispatch}
      />
    );
  }

  return null;
}
