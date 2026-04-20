import { useEffect } from 'react';

export default function WorkList() {
  useEffect(() => {
    const listWrapper = document.querySelector('.work-list-wrapper');
    const list        = document.querySelector('.work-list');
    const items       = Array.from(document.querySelectorAll('.work-item'));

    const numEl   = document.getElementById('work-number');
    const totalEl = document.getElementById('work-total');
    const nameEl  = document.getElementById('work-project-name');
    const linkEl  = document.getElementById('work-project-link');
    const videoEl = document.getElementById('work-video');
    const photoEl = document.getElementById('work-photo');

    if (!listWrapper || !list || !items.length) return;

    if (totalEl) totalEl.textContent = '/' + String(items.length).padStart(3, '0');

    const projectData = items.map(item => {
      const nameText   = item.querySelector('.client-bind-txt');
      const videoText  = item.querySelector('.cover-video-txt');
      const photoImg   = item.querySelector('.image-bind');
      const linkAnchor = item.querySelector('.project-link-bind');
      return {
        name:  nameText   ? nameText.textContent.trim()  : '',
        video: videoText  ? videoText.textContent.trim() : '',
        photo: photoImg   ? photoImg.src                 : '',
        href:  linkAnchor ? linkAnchor.href              : '',
      };
    });

    function wrapInClip(el) {
      if (!el || (el.parentNode && el.parentNode.classList.contains('clip-wrap'))) return;
      const wrap = document.createElement('div');
      wrap.className = 'clip-wrap';
      wrap.style.cssText = 'overflow:hidden;display:block;';
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      el.style.display    = 'block';
      el.style.transition = 'transform 0.2s cubic-bezier(0.16,1,0.3,1)';
    }
    wrapInClip(numEl);
    wrapInClip(nameEl);

    function slideUpdate(el, newText) {
      if (!el) return;
      el.style.transition = 'transform 0.15s ease-in';
      el.style.transform  = 'translateY(-110%)';
      setTimeout(() => {
        el.style.transition = 'none';
        el.style.transform  = 'translateY(110%)';
        el.textContent      = newText;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = 'transform 0.2s cubic-bezier(0.16,1,0.3,1)';
            el.style.transform  = 'translateY(0%)';
          });
        });
      }, 150);
    }

    const GAP       = 5;
    const listH     = list.offsetHeight + GAP;
    const viewH     = window.innerHeight;
    const numCopies = Math.ceil(viewH / listH) * 3 + 4;

    const container = document.createElement('div');
    container.style.cssText = 'position:relative;width:100%;';
    container.style.height  = (numCopies * listH) + 'px';

    const copies = [];
    for (let i = 0; i < numCopies; i++) {
      const copy = list.cloneNode(true);
      copy.style.cssText = `position:absolute;left:0;width:100%;top:${i * listH}px;`;
      copy.querySelectorAll('.work-item').forEach((el, j) => {
        el.setAttribute('data-real-index', j % items.length);
        el.style.cursor     = 'pointer';
        el.style.opacity    = '0.2';
        el.style.transition = 'opacity 0.3s, color 0.3s';
      });
      container.appendChild(copy);
      copies.push({ el: copy, top: i * listH });
    }

    listWrapper.innerHTML = '';
    listWrapper.appendChild(container);
    listWrapper.style.opacity   = '1';
    listWrapper.style.transition = 'opacity 0.3s ease';

    let scrollY  = listH * Math.floor(numCopies / 2);
    let velocity = 0;
    const decay  = 0.88;
    let activeEl = null;

    const getVisibleTop    = () => scrollY;
    const getVisibleBottom = () => scrollY + viewH;

    function repositionCopies() {
      const bufferH = listH * 2;
      copies.forEach(c => {
        while (c.top + listH < getVisibleTop() - bufferH) {
          c.top += numCopies * listH;
          c.el.style.top = c.top + 'px';
        }
        while (c.top > getVisibleBottom() + bufferH) {
          c.top -= numCopies * listH;
          c.el.style.top = c.top + 'px';
        }
      });
    }

    function resetAll() {
      container.querySelectorAll('.work-item').forEach(el => {
        el.style.opacity = '0.2';
        el.style.color   = '';
      });
      activeEl = null;
    }

    function setActive(el, animate) {
      if (el === activeEl) return;
      resetAll();
      el.style.opacity = '1';
      el.style.color   = '#ff2425';
      activeEl = el;

      const realIndex = parseInt(el.getAttribute('data-real-index'), 10);
      if (isNaN(realIndex)) return;
      const data = projectData[realIndex];
      if (!data) return;

      if (linkEl) linkEl.href = data.href;

      if (animate) {
        slideUpdate(numEl, String(realIndex + 1).padStart(3, '0'));
        slideUpdate(nameEl, data.name);
      } else {
        if (numEl)  numEl.textContent  = String(realIndex + 1).padStart(3, '0');
        if (nameEl) nameEl.textContent = data.name;
      }

      if (videoEl && data.video && videoEl.getAttribute('data-current') !== data.video) {
        videoEl.setAttribute('data-current', data.video);
        if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = data.video;
          videoEl.play().catch(() => {});
        } else if (window.Hls && window.Hls.isSupported()) {
          if (window._workHls) window._workHls.destroy();
          window._workHls = new window.Hls({ enableWorker: false });
          window._workHls.loadSource(data.video);
          window._workHls.attachMedia(videoEl);
          window._workHls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            videoEl.play().catch(() => {});
          });
        }
      }

      if (photoEl && data.photo) {
        photoEl.removeAttribute('srcset');
        photoEl.removeAttribute('sizes');
        photoEl.src = data.photo;
      }
    }

    function initCenter() {
      const centerY  = viewH / 2 + scrollY;
      const allItems = Array.from(container.querySelectorAll('.work-item'));
      let closest = null;
      let minDist = Infinity;
      allItems.forEach(el => {
        const copy = el.closest('[style*="position:absolute"]');
        if (!copy) return;
        const copyTop = parseFloat(copy.style.top) || 0;
        const mid     = copyTop + el.offsetTop + el.offsetHeight / 2;
        const dist    = Math.abs(mid - centerY);
        if (dist < minDist) { minDist = dist; closest = el; }
      });
      if (closest) setActive(closest, false);
    }

    container.addEventListener('mouseover', e => {
      const item = e.target.closest('.work-item');
      if (!item || item === activeEl) return;
      setActive(item, true);
    });

    container.addEventListener('click', e => {
      const item = e.target.closest('.work-item');
      if (!item) return;
      const realIndex = parseInt(item.getAttribute('data-real-index'), 10);
      const data = projectData[realIndex];
      if (data && data.href) window.location.href = data.href;
    });

    function tick() {
      scrollY  += velocity;
      velocity *= decay;
      if (Math.abs(velocity) < 0.01) velocity = 0;
      repositionCopies();
      container.style.transform = `translateY(${-scrollY}px)`;
    }

    const gsap = window.gsap;
    gsap.ticker.add(tick);

    const onWheel = e => {
      e.preventDefault();
      velocity += e.deltaY * 0.25;
      velocity = Math.max(-30, Math.min(30, velocity));
    };
    window.addEventListener('wheel', onWheel, { passive: false });

    let dragging = false, dragStartY = 0, dragStartScroll = 0, lastDragY = 0, dragVel = 0;

    listWrapper.addEventListener('mousedown', e => {
      dragging = true;
      dragStartY = e.clientY; lastDragY = e.clientY;
      dragStartScroll = scrollY; dragVel = 0; velocity = 0;
    });

    const onMouseMove = e => {
      if (!dragging) return;
      dragVel   = lastDragY - e.clientY;
      scrollY   = dragStartScroll + (dragStartY - e.clientY) * 0.5;
      lastDragY = e.clientY;
    };
    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      velocity = dragVel * 0.4;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    let tStartY = 0, tStartScroll = 0, lastTY = 0, tVel = 0;
    listWrapper.addEventListener('touchstart', e => {
      tStartY = e.touches[0].clientY; lastTY = tStartY;
      tStartScroll = scrollY; tVel = 0; velocity = 0;
    });
    listWrapper.addEventListener('touchmove', e => {
      e.preventDefault();
      tVel    = lastTY - e.touches[0].clientY;
      scrollY = tStartScroll + (tStartY - e.touches[0].clientY) * 0.5;
      lastTY  = e.touches[0].clientY;
    }, { passive: false });
    listWrapper.addEventListener('touchend', () => { velocity = tVel * 0.4; });

    setTimeout(initCenter, 100);

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return null;
}