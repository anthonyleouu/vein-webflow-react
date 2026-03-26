import { createRoot } from 'react-dom/client';
import WorkSlider from './WorkSlider/WorkSlider';

window.mountAll = function mountAll() {
  // Mount WorkSlider
  const workContainer = document.getElementById('work-slider-root');
  if (workContainer && !workContainer._mounted) {
    workContainer._mounted = true;
    const root = createRoot(workContainer);
    root.render(<WorkSlider />);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAll);
} else {
  mountAll();
}
