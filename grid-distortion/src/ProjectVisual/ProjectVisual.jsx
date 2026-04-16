import { useEffect } from 'react';

export default function ProjectVisual() {
  useEffect(() => {
    const container = document.getElementById('project-visual-root');
    if (!container) return;

    const slug = window.location.pathname
      .replace(/^\/work\//, '')
      .replace(/\/$/, '');

    const GAP = 16;
    let scrollY  = 0;
    let velocity = 0;
    let animId   = null;
    let trackH   = 0;
    let items    = []; // all media DOM elements in one track

    const style = document.createElement('style');
    style.textContent = `
      #project-visual-root {
        width: 100%;
        height: 100%;
        overflow: hidden;
        position: relative;
        cursor: grab;
      }
      #project-visual-root.grabbing { cursor: grabbing; }
      .pv-track {
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        will-change: transform;
      }
      .pv-item {
        width: 100%;
        display: block;
        line-height: 0;
      }
      .pv-item + .pv-item { margin-top: ${GAP}px; }
      .pv-item img,
      .pv-item video {
        width: 100%;
        height: auto;
        display: block;
        object-fit: cover;
      }
    `;
    document.head.appendChild(style);

    function createVideoEl(src) {
      const video       = document.createElement('video');
      video.muted       = true;
      video.loop        = true;
      video.playsInline = true;
      video.autoplay    = true;
      video.crossOrigin = 'anonymous';

      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        video.play().catch(() => {});
      } else if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({ enableWorker: false, maxBufferLength: 10 });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      } else {
        video.src = src;
        video.play().catch(() => {});
      }
      return video;
    }

    function createItem(mediaItem) {
      const div     = document.createElement('div');
      div.className = 'pv-item';
      if (mediaItem.type === 'video') {
        div.appendChild(createVideoEl(mediaItem.src));
      } else {
        const img   = document.createElement('img');
        img.src     = mediaItem.src;
        img.alt     = '';
        img.loading = 'lazy';
        div.appendChild(img);
      }
      return div;
    }

    function buildTrack(media) {
      // Track A
      const trackA = document.createElement('div');
      trackA.className = 'pv-track';
      media.forEach(m => trackA.appendChild(createItem(m)));
      container.appendChild(trackA);

      // Measure after paint
      requestAnimationFrame(() => requestAnimationFrame(() => {
        trackH = trackA.offsetHeight + GAP;

        // Track B (clone) — re-init videos separately
        const trackB = document.createElement('div');
        trackB.className = 'pv-track';
        media.forEach(m => trackB.appendChild(createItem(m)));
        container.appendChild(trackB);

        // Start so video (index 0) is centered vertically
        // video is first item — center it: scrollY = -(containerH/2 - videoH/2)
        // But since we start at trackH to allow upward scroll:
        const containerH = container.offsetHeight;
        const firstItemH = trackA.children[0]
          ? trackA.children[0].offsetHeight : 0;
        // Center the first item (video) in the viewport
        const centerOffset = (containerH / 2) - (firstItemH / 2);
        scrollY = trackH - centerOffset;

        tick();
      }));
    }

    function tick() {
      animId = requestAnimationFrame(tick);

      if (!isDragging) {
        velocity *= 0.90;
        if (Math.abs(velocity) < 0.02) velocity = 0;
        scrollY += velocity;
      }

      // Seamless wrap
      if (scrollY >= trackH * 2) scrollY -= trackH;
      if (scrollY <= 0)          scrollY += trackH;

      const tracks = container.querySelectorAll('.pv-track');
      if (tracks[0]) tracks[0].style.transform = `translateY(${-scrollY}px)`;
      if (tracks[1]) tracks[1].style.transform = `translateY(${-scrollY + trackH}px)`;
    }

    // ── Events ────────────────────────────────────────────────────────────
    let isDragging    = false;
    let dragStartY    = 0;
    let dragStartScroll = 0;
    let lastDragY     = 0;
    let dragVel       = 0;

    function onWheel(e) {
      e.preventDefault();
      e.stopPropagation();
      velocity += e.deltaY * 0.35;
      velocity = Math.max(-50, Math.min(50, velocity));
    }

    function onMouseDown(e) {
      isDragging      = true;
      dragStartY      = e.clientY;
      dragStartScroll = scrollY;
      lastDragY       = e.clientY;
      dragVel         = 0;
      velocity        = 0;
      container.classList.add('grabbing');
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      const dy  = e.clientY - lastDragY;
      dragVel   = -dy;
      scrollY   = dragStartScroll - (e.clientY - dragStartY);
      lastDragY = e.clientY;
    }

    function onMouseUp() {
      if (!isDragging) return;
      isDragging = false;
      velocity   = dragVel * 0.8;
      container.classList.remove('grabbing');
    }

    let tStartY = 0, tStartScroll = 0, lastTY = 0, tVel = 0;

    function onTouchStart(e) {
      tStartY      = e.touches[0].clientY;
      tStartScroll = scrollY;
      lastTY       = tStartY;
      tVel         = 0;
      velocity     = 0;
    }

    function onTouchMove(e) {
      e.preventDefault();
      const dy = e.touches[0].clientY - lastTY;
      tVel     = -dy;
      scrollY  = tStartScroll - (e.touches[0].clientY - tStartY);
      lastTY   = e.touches[0].clientY;
    }

    function onTouchEnd() {
      velocity = tVel * 0.8;
    }

    function onMouseLeave() {
      if (isDragging) onMouseUp();
    }

    container.addEventListener('wheel',      onWheel,      { passive: false });
    container.addEventListener('mousedown',  onMouseDown);
    container.addEventListener('mousemove',  onMouseMove);
    container.addEventListener('mouseup',    onMouseUp);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove',  onTouchMove,  { passive: false });
    container.addEventListener('touchend',   onTouchEnd);

    // ── Fetch ─────────────────────────────────────────────────────────────
    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        const project = (data.items || []).find(p => p.slug === slug);
        if (!project) return;

        const media = [];
        if (project.videoUrl) media.push({ type: 'video', src: project.videoUrl });
        (project.gallery || []).forEach(url => media.push({ type: 'image', src: url }));

        if (media.length) buildTrack(media);
      })
      .catch(err => console.error('ProjectVisual:', err));

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('wheel',      onWheel);
      container.removeEventListener('mousedown',  onMouseDown);
      container.removeEventListener('mousemove',  onMouseMove);
      container.removeEventListener('mouseup',    onMouseUp);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove',  onTouchMove);
      container.removeEventListener('touchend',   onTouchEnd);
      style.remove();
      container.innerHTML = '';
    };
  }, []);

  return null;
}