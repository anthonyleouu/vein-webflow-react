import { createRoot } from 'react-dom/client';
import ArchiveCanvas from './ArchiveCanvas/ArchiveCanvas';
import Noise         from './Noise/Noise';
import Crosshair     from './Crosshair/Crosshair';
import Intro         from './Intro/Intro';

// Mount Intro (first visit per session only)
const introContainer = document.getElementById('intro-root');
if (introContainer && !introContainer._mounted && !sessionStorage.getItem('intro-seen')) {
  introContainer._mounted = true;
  document.body.classList.add('intro-active');
  const introRoot = createRoot(introContainer);
  const handleIntroComplete = () => {
    sessionStorage.setItem('intro-seen', '1');
    document.body.classList.remove('intro-active');
    document.documentElement.classList.add('intro-done');
  };
  introRoot.render(<Intro onComplete={handleIntroComplete} />);
}

// Mount Noise globally
const noiseContainer = document.getElementById('noise-root');
if (noiseContainer && !noiseContainer._mounted) {
  noiseContainer._mounted = true;
  createRoot(noiseContainer).render(
    <Noise patternRefreshInterval={2} patternAlpha={25} />
  );
}

// Mount Crosshair globally
const crosshairContainer = document.getElementById('crosshair-root');
if (crosshairContainer && !crosshairContainer._mounted) {
  crosshairContainer._mounted = true;
  createRoot(crosshairContainer).render(<Crosshair color="#ff2425" />);
}

window.mountAll = function mountAll() {
  // Archive
  const archiveContainer = document.getElementById('archive-root');
  if (archiveContainer && !archiveContainer._mounted) {
    archiveContainer._mounted = true;
    createRoot(archiveContainer).render(<ArchiveCanvas />);
  }

  // Work list — defined in global footer
  if (window.initWorkList) window.initWorkList();

  // Studio loop — defined in global footer
  if (window.initStudioLoop) window.initStudioLoop();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}