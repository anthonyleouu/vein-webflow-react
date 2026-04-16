import { createRoot } from 'react-dom/client';
import ArchiveCanvas from './ArchiveCanvas/ArchiveCanvas';
import Noise from './Noise/Noise';

// Mount Noise globally — runs once on page load
const noiseContainer = document.getElementById('noise-root');
if (noiseContainer && !noiseContainer._mounted) {
  noiseContainer._mounted = true;
  const noiseRoot = createRoot(noiseContainer);
  noiseRoot.render(
    <Noise
      patternSize={300}
      patternScaleX={2.8}
      patternScaleY={3}
      patternRefreshInterval={2}
      patternAlpha={7.5}
    />
  );
}

window.mountAll = function mountAll() {
  // Mount ArchiveCanvas
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