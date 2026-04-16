import { createRoot } from 'react-dom/client';
import ArchiveCanvas  from './ArchiveCanvas/ArchiveCanvas';
import ProjectVisual  from './ProjectVisual/ProjectVisual';

window.mountAll = function mountAll() {
  // Mount ArchiveCanvas
  const archiveContainer = document.getElementById('archive-root');
  if (archiveContainer && !archiveContainer._mounted) {
    archiveContainer._mounted = true;
    const root = createRoot(archiveContainer);
    root.render(<ArchiveCanvas />);
  }

  // Mount ProjectVisual
  const projectContainer = document.getElementById('project-visual-root');
  if (projectContainer && !projectContainer._mounted) {
    projectContainer._mounted = true;
    const root = createRoot(projectContainer);
    root.render(<ProjectVisual />);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}