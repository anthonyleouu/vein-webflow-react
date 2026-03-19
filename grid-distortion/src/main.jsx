import { createRoot } from 'react-dom/client';
import GridDistortion from './GridDistortion/GridDistortion';
import ArchiveCanvas from './ArchiveCanvas/ArchiveCanvas';
import WorkGrid from './WorkGrid/WorkGrid';

const mountAll = () => {
  // Mount GridDistortion
  const gridContainer = document.getElementById('grid-distortion-root');
  if (gridContainer && !gridContainer._mounted) {
    gridContainer._mounted = true;
    const videoSrc = gridContainer.getAttribute('data-video-src');
    const grid = parseInt(gridContainer.getAttribute('data-grid')) || 15;
    const mouse = parseFloat(gridContainer.getAttribute('data-mouse')) || 0.1;
    const strength = parseFloat(gridContainer.getAttribute('data-strength')) || 0.15;
    const relaxation = parseFloat(gridContainer.getAttribute('data-relaxation')) || 0.9;
    const root = createRoot(gridContainer);
    root.render(
      <GridDistortion
        videoSrc={videoSrc}
        grid={grid}
        mouse={mouse}
        strength={strength}
        relaxation={relaxation}
      />
    );
  }

  // Mount ArchiveCanvas
  const archiveContainer = document.getElementById('archive-canvas-root');
  if (archiveContainer && !archiveContainer._mounted) {
    archiveContainer._mounted = true;
    const root = createRoot(archiveContainer);
    root.render(<ArchiveCanvas />);
  }

  // Mount WorkGrid
  const workContainer = document.getElementById('work-grid-root');
  if (workContainer && !workContainer._mounted) {
    workContainer._mounted = true;
    const root = createRoot(workContainer);
    root.render(<WorkGrid />);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}
