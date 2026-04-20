import { useEffect } from 'react';

export default function StudioLoop() {
  useEffect(() => {
    const scrollEl = document.querySelector('.studio-content-wrap');
    const wrap     = document.querySelector('.studio-wrap');
    if (!scrollEl || !wrap) return;

    // Remove any previous clones
    Array.from(scrollEl.querySelectorAll('.studio-wrap')).forEach((el, i) => {
      if (i > 0) el.remove();
    });
    scrollEl.scrollTop = 0;

    // Mark originals so global reveal skips them
    wrap.querySelectorAll('[data-reveal="text"]').forEach(el => {
      el._revealReady = true;
    });

    const clone = wrap.cloneNode(true);
    const cloneLeft = clone.querySelector('.studio-left');
    if (cloneLeft) cloneLeft.style.visibility = 'hidden';

    clone.querySelectorAll('[data-reveal="text"]').forEach(el => {
      el.removeAttribute('data-reveal');
    });

    const cloneTextEls = Array.from(clone.querySelectorAll('.studio-text'));
    cloneTextEls.forEach(el => { el.style.opacity = '0'; });

    scrollEl.appendChild(clone);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const contentH = wrap.offsetHeight;
        scrollEl.scrollTop = contentH;

        cloneTextEls.forEach(el => {
          if (window.revealText) window.revealText(el);
        });

        let ticking = false;
        scrollEl.addEventListener('scroll', () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            const st = scrollEl.scrollTop;
            if (st >= contentH * 2 - scrollEl.clientHeight) {
              scrollEl.scrollTop = st - contentH;
            } else if (st <= 0) {
              scrollEl.scrollTop = st + contentH;
            }
            ticking = false;
          });
        });
      });
    });

    return () => {
      // Cleanup clone on unmount
      Array.from(scrollEl.querySelectorAll('.studio-wrap')).forEach((el, i) => {
        if (i > 0) el.remove();
      });
    };
  }, []);

  return null;
}