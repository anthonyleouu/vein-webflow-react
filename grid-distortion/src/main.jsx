import { createRoot } from 'react-dom/client';
import ArchiveCanvas from './ArchiveCanvas/ArchiveCanvas';
 
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