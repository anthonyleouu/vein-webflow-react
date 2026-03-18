import { createRoot } from 'react-dom/client';
import GridDistortion from './GridDistortion/GridDistortion';
import ArchiveCanvas from './ArchiveCanvas/ArchiveCanvas';

// Mount GridDistortion
const gridContainer = document.getElementById('grid-distortion-root');
if (gridContainer) {
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
if (archiveContainer) {
  const root = createRoot(archiveContainer);
  root.render(<ArchiveCanvas />);
}