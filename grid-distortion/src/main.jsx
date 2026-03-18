import { createRoot } from 'react-dom/client';
import GridDistortion from './GridDistortion/GridDistortion';

const container = document.getElementById('grid-distortion-root');

if (container) {
  const videoSrc = container.getAttribute('data-video-src');
  const grid = parseInt(container.getAttribute('data-grid')) || 15;
  const mouse = parseFloat(container.getAttribute('data-mouse')) || 0.1;
  const strength = parseFloat(container.getAttribute('data-strength')) || 0.15;
  const relaxation = parseFloat(container.getAttribute('data-relaxation')) || 0.9;

  const root = createRoot(container);
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