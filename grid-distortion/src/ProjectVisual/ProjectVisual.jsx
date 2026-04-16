import { useEffect } from 'react';

export default function ProjectVisual() {
  useEffect(() => {
    const container = document.getElementById('project-visual-root');
    if (!container) return;

    const slug = window.location.pathname
      .replace(/^\/work\//, '')
      .replace(/\/$/, '');

    let scrollY   = 0;
    let velocity  = 0;
    let animId    = null;
    let trackEl   = null;
    let cloneEl   = null;
    let trackH    = 0;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #project-visual-root {
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
      }
      .pv-track {
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        will-change: transform;
      }
      .pv-item {
        width: 100%;
        margin-bottom: 2px;
        display: block;
        line-height: 0;
      }
      .pv-item img {
        width: 100%;
        height: auto;
        display: block;
        object-fit: cover;
      }
      .pv-item video {
        width: 100%;
        height: auto;
        display: block;
        object-fit: cover;
      }
    `;
    document.head.appendChild(style);

    function buildMedia(project) {
      // Order: video first, then gallery images
      const media = [];

      if (project.videoUrl) {
        media.push({ type: 'video', src: project.videoUrl });
      }

      (project.gallery || []).forEach(url => {
        media.push({ type: 'image', src: url });
      });

      return media;
    }

    function createItem(mediaItem) {
      const div = document.createElement('div');
      div.className = 'pv-item';

      if (mediaItem.type === 'video') {
        const video = document.createElement('video');
        video.muted      = true;
        video.loop       = true;
        video.playsInline = true;
        video.autoplay   = true;
        video.crossOrigin = 'anonymous';

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = mediaItem.src;
          video.play().catch(() => {});
        } else if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({ enableWorker: false, maxBufferLength: 10 });
          hls.loadSource(mediaItem.src);
          hls.attachMedia(video);
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => {});
          });
        } else {
          video.src = mediaItem.src;
          video.play().catch(() => {});
        }

        div.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src     = mediaItem.src;
        img.alt     = '';
        img.loading = 'lazy';
        div.appendChild(img);
      }

      return div;
    }

    function buildTrack(media) {
      // Create track with all media items
      trackEl = document.createElement('div');
      trackEl.className = 'pv-track';

      media.forEach(m => trackEl.appendChild(createItem(m)));
      container.appendChild(trackEl);

      // Wait for images to load to get accurate height
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          trackH = trackEl.offsetHeight;

          // Clone track for seamless loop
          cloneEl = trackEl.cloneNode(true);
          container.appendChild(cloneEl);

          // Start scroll in middle so both directions work
          scrollY = trackH;

          // Re-init any HLS videos in clone
          cloneEl.querySelectorAll('video').forEach((video, i) => {
            const original = media[i];
            if (!original || original.type !== 'video') return;

            if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = original.src;
              video.play().catch(() => {});
            } else if (window.Hls && window.Hls.isSupported()) {
              const hls = new window.Hls({ enableWorker: false, maxBufferLength: 10 });
              hls.loadSource(original.src);
              hls.attachMedia(video);
              hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {});
              });
            }
          });

          startLoop();
        });
      });
    }

    function startLoop() {
      function tick() {
        animId = requestAnimationFrame(tick);

        // Momentum decay
        velocity *= 0.92;
        if (Math.abs(velocity) < 0.01) velocity = 0;
        scrollY += velocity;

        // Seamless infinite loop
        if (scrollY >= trackH * 2) scrollY -= trackH;
        if (scrollY <= 0)           scrollY += trackH;

        const y = -scrollY;
        if (trackEl) trackEl.style.transform  = `translateY(${y}px)`;
        if (cloneEl) cloneEl.style.transform  = `translateY(${y + trackH}px)`;
      }

      tick();
    }

    // Wheel
    function onWheel(e) {
      e.preventDefault();
      velocity += e.deltaY * 0.4;
      velocity = Math.max(-60, Math.min(60, velocity));
    }

    // Drag
    let dragging      = false;
    let dragStartY    = 0;
    let dragStartScroll = 0;
    let lastDragY     = 0;
    let dragVel       = 0;

    function onMouseDown(e) {
      dragging        = true;
      dragStartY      = e.clientY;
      dragStartScroll = scrollY;
      lastDragY       = e.clientY;
      dragVel         = 0;
      velocity        = 0;
    }

    function onMouseMove(e) {
      if (!dragging) return;
      dragVel  = lastDragY - e.clientY;
      scrollY  = dragStartScroll + (dragStartY - e.clientY);
      lastDragY = e.clientY;
    }

    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      velocity = dragVel * 0.8;
    }

    // Touch
    let touchStartY      = 0;
    let touchStartScroll = 0;
    let lastTouchY       = 0;
    let touchVel         = 0;

    function onTouchStart(e) {
      touchStartY      = e.touches[0].clientY;
      touchStartScroll = scrollY;
      lastTouchY       = touchStartY;
      touchVel         = 0;
      velocity         = 0;
    }

    function onTouchMove(e) {
      e.preventDefault();
      touchVel  = lastTouchY - e.touches[0].clientY;
      scrollY   = touchStartScroll + (touchStartY - e.touches[0].clientY);
      lastTouchY = e.touches[0].clientY;
    }

    function onTouchEnd() {
      velocity = touchVel * 0.8;
    }

    container.addEventListener('wheel',      onWheel,      { passive: false });
    container.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove',     onMouseMove);
    window.addEventListener('mouseup',       onMouseUp);
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove',  onTouchMove,  { passive: false });
    container.addEventListener('touchend',   onTouchEnd);

    // Fetch and init
    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        const project = (data.items || []).find(p => p.slug === slug);
        if (!project) {
          console.warn('ProjectVisual: no project found for slug', slug);
          return;
        }
        const media = buildMedia(project);
        if (!media.length) {
          console.warn('ProjectVisual: no media for project', slug);
          return;
        }
        buildTrack(media);
      })
      .catch(err => console.error('ProjectVisual fetch error:', err));

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('wheel',      onWheel);
      container.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener('mousemove',     onMouseMove);
      window.removeEventListener('mouseup',       onMouseUp);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove',  onTouchMove);
      container.removeEventListener('touchend',   onTouchEnd);
      style.remove();
      container.innerHTML = '';
    };
  }, []);

  return null;
}