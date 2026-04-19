import { createRoot } from 'react-dom/client';
import ArchiveCanvas from './ArchiveCanvas/ArchiveCanvas';
import Noise         from './Noise/Noise';
import Crosshair     from './Crosshair/Crosshair';
import Intro         from './Intro';

// Mount Intro (first visit per session only)
const introContainer = document.getElementById('intro-root');
if (introContainer && !introContainer._mounted && !sessionStorage.getItem('intro-seen')) {
  introContainer._mounted = true;
  const introRoot = createRoot(introContainer);

  const handleIntroComplete = () => {
    sessionStorage.setItem('intro-seen', '1');
  };

  introRoot.render(<Intro onComplete={handleIntroComplete} />);
}

// Mount Noise globally
const noiseContainer = document.getElementById('noise-root');
if (noiseContainer && !noiseContainer._mounted) {
  noiseContainer._mounted = true;
  const noiseRoot = createRoot(noiseContainer);
  noiseRoot.render(
    <Noise patternRefreshInterval={2} patternAlpha={25} />
  );
}

// Mount Crosshair globally
const crosshairContainer = document.getElementById('crosshair-root');
if (crosshairContainer && !crosshairContainer._mounted) {
  crosshairContainer._mounted = true;
  const crosshairRoot = createRoot(crosshairContainer);
  crosshairRoot.render(<Crosshair color="#ff2425" />);
}

window.mountAll = function mountAll() {
  const archiveContainer = document.getElementById('archive-root');
  if (archiveContainer && !archiveContainer._mounted) {
    archiveContainer._mounted = true;
    const root = createRoot(archiveContainer);
    root.render(<ArchiveCanvas />);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}