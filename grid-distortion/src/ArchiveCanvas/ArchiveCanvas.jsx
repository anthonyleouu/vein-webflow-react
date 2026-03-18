import { useEffect, useRef } from 'react';
import './ArchiveCanvas.css';

const GAP = 10;
const MASONRY_OFFSETS = [0, 0.3, 0.15, 0.45, 0.22, 0.38, 0.08, 0.52];
const PARALLAX = [0, 0.15, -0.1, 0.2, -0.15, 0.08, -0.2, 0.12];

export default function ArchiveCanvas() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    x: 0, y: 0,
    vx: 0, vy: 0,
    smoothVy: 0,
    dragging: false,
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    dragStartX: 0, dragStartY: 0,
    speed: 0,
    time: 0,
    animId: null,
    items: [],
    images: {},
    hoveredSlug: null,
    _locked: false,
  });

  // Inject overlay HTML directly into DOM — bypasses React state entirely
  useEffect(() => {
    const overlay = document.createElement('div');
    overlay.id = 'archive-detail-overlay';
    overlay.innerHTML = `
      <div id="archive-detail-media"></div>
      <div id="archive-detail-panel">
        <div id="archive-detail-inner">
          <p id="archive-detail-category">ARCHIVE</p>
          <h2 id="archive-detail-title"></h2>
          <p id="archive-detail-creator"></p>
          <p id="archive-detail-description"></p>
          <button id="archive-detail-close">CLOSE</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('archive-detail-close');
    closeBtn.addEventListener('click', () => {
      overlay.classList.remove('visible');
      const panel = document.getElementById('archive-detail-panel');
      const media = document.getElementById('archive-detail-media');
      panel.classList.remove('visible');
      media.classList.remove('visible');
      setTimeout(() => {
        stateRef.current._locked = false;
        // Clear video if any
        const video = media.querySelector('video');
        if (video) { video.pause(); video.src = ''; }
        media.innerHTML = '';
      }, 700);
    });

    return () => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    };
  }, []);

  const openItem = (item) => {
    const overlay = document.getElementById('archive-detail-overlay');
    const media = document.getElementById('archive-detail-media');
    const panel = document.getElementById('archive-detail-panel');
    const title = document.getElementById('archive-detail-title');
    const creator = document.getElementById('archive-detail-creator');
    const description = document.getElementById('archive-detail-description');
    if (!overlay) return;

    // Populate content
    title.textContent = item.name || '';
    creator.textContent = item.creator || '';
    description.textContent = item.description || '';
    creator.style.display = item.creator ? 'block' : 'none';
    description.style.display = item.description ? 'block' : 'none';

    // Set media
    media.innerHTML = '';
    if (item.video) {
      const video = document.createElement('video');
      video.src = item.video;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.className = 'archive-detail-video';
      media.appendChild(video);
    } else if (item.image) {
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.name;
      img.className = 'archive-detail-image';
      media.appendChild(img);
    }

    // Check mobile
    const isMobile = window.innerWidth < 1024;
    overlay.className = isMobile ? 'mobile' : '';

    // Trigger animation
    overlay.classList.add('visible');
    setTimeout(() => {
      media.classList.add('visible');
      panel.classList.add('visible');
    }, 50);
  };

  useEffect(() => {
    const handler = (e) => openItem(e.detail);
    window.addEventListener('archive:open', handler);
    return () => window.removeEventListener('archive:open', handler);
  }, []);

  useEffect(() => {
    async function fetchArchive() {
      try {
        const res = await fetch('https://vein-webflow-react.vercel.app/api/archive');
        const data = await res.json();
        const items = data.items || [];
        stateRef.current.items = items;

        const imageMap = {};
        await Promise.all(
          items.map(item => new Promise(resolve => {
            if (!item.image) return resolve();
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => { imageMap[item.id] = img; resolve(); };
            img.onerror = () => resolve();
            img.src = item.image;
          }))
        );
        stateRef.current.images = imageMap;

        // Remove loading state
        const wrapper = document.querySelector('.archive-canvas-wrapper');
        if (wrapper) wrapper.classList.remove('is-loading');
      } catch (err) {
        console.error('Failed to fetch archive:', err);
      }
    }
    fetchArchive();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;

    let blockW, blockH, cellW, cellH;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      blockW = Math.round(window.innerWidth * 0.3);
      blockH = Math.round(window.innerHeight * 0.7);
      cellW = blockW + GAP;
      cellH = blockH + GAP;
    };
    resize();
    window.addEventListener('resize', resize);

    const getItem = (col, row) => {
      const items = s.items;
      if (!items.length) return null;
      const index = (((col * 3 + row * 7) % items.length) + items.length) % items.length;
      return items[index];
    };

    const getMasonryOffset = (col) => {
      const i = ((col % MASONRY_OFFSETS.length) + MASONRY_OFFSETS.length) % MASONRY_OFFSETS.length;
      return MASONRY_OFFSETS[i] * cellH;
    };

    const getParallaxOffset = (col) => {
      const i = ((col % PARALLAX.length) + PARALLAX.length) % PARALLAX.length;
      return PARALLAX[i];
    };

    const offscreen = document.createElement('canvas');
    const offCtx = offscreen.getContext('2d');

    const drawWarpedImage = (img, dx, dy, dw, dh, warpAmount) => {
      const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const sx = -(sw - dw) / 2;
      const sy = -(sh - dh) / 2;

      if (warpAmount < 0.01) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, dw, dh);
        ctx.clip();
        ctx.drawImage(img, dx + sx, dy + sy, sw, sh);
        ctx.restore();
        return;
      }

      offscreen.width = dw;
      offscreen.height = dh;
      offCtx.clearRect(0, 0, dw, dh);
      offCtx.drawImage(img, sx, sy, sw, sh);

      const strips = 60;
      const stripH = dh / strips;

      ctx.save();
      ctx.beginPath();
      ctx.rect(dx, dy, dw, dh);
      ctx.clip();

      for (let i = 0; i < strips; i++) {
        const sy2 = i * stripH;
        const waveX = Math.sin((i / strips) * Math.PI * 4 + s.time * 2) * warpAmount * dw * 0.03;
        ctx.drawImage(
          offscreen,
          0, sy2, dw, stripH + 1,
          dx + waveX, dy + sy2, dw, stripH + 1
        );
      }
      ctx.restore();
    };

    const drawFrame = () => {
      const W = canvas.width;
      const H = canvas.height;

      if (!s.dragging) {
        s.vx *= 0.96;
        s.vy *= 0.96;
        s.x += s.vx;
        s.y += s.vy;
      }

      s.smoothVy += (s.vy - s.smoothVy) * 0.15;

      const rawSpeed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const targetSpeed = s.dragging ? Math.min(rawSpeed * 0.1, 1.0) : 0;
      s.speed += (targetSpeed - s.speed) * 0.06;
      s.time += 0.04;

      ctx.clearRect(0, 0, W, H);

      const startCol = Math.floor(-s.x / cellW) - 1;
      const startRow = Math.floor(-s.y / cellH) - 2;
      const endCol = startCol + Math.ceil(W / cellW) + 3;
      const endRow = startRow + Math.ceil(H / cellH) + 4;

      for (let col = startCol; col < endCol; col++) {
        const masonryOffset = getMasonryOffset(col);
        const parallax = getParallaxOffset(col);
        for (let row = startRow; row < endRow; row++) {
          const item = getItem(col, row);
          const img = item ? s.images[item.id] : null;

          const screenX = col * cellW + s.x;
          const verticalDominance = Math.abs(s.vy) / (Math.abs(s.vx) + Math.abs(s.vy) + 0.001);
          const screenY = row * cellH + s.y + masonryOffset + s.smoothVy * parallax * 20 * verticalDominance;

          if (img) {
            drawWarpedImage(img, screenX, screenY, blockW, blockH, s.speed);
          } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(screenX, screenY, blockW, blockH);
          }
        }
      }

      s.animId = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const getPos = e => {
      if (e.touches && e.touches.length > 0)
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches.length > 0)
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };

    const onDown = e => {
      if (s._locked) return;
      const pos = getPos(e);
      s.dragging = true;
      s.startX = pos.x - s.x;
      s.startY = pos.y - s.y;
      s.lastX = pos.x;
      s.lastY = pos.y;
      s.dragStartX = pos.x;
      s.dragStartY = pos.y;
      s.vx = 0;
      s.vy = 0;
    };

    const onMove = e => {
      if (s._locked) return;
      const pos = getPos(e);

      // Update cursor label via DOM
      const cursorEl = document.querySelector('.archive-cursor-label');

      if (s.dragging) {
        s.vx = pos.x - s.lastX;
        s.vy = pos.y - s.lastY;
        s.x = pos.x - s.startX;
        s.y = pos.y - s.startY;
        s.lastX = pos.x;
        s.lastY = pos.y;
      } else {
        const startCol = Math.floor(-s.x / cellW) - 1;
        const startRow = Math.floor(-s.y / cellH) - 2;
        const endCol = startCol + Math.ceil(canvas.width / cellW) + 3;
        const endRow = startRow + Math.ceil(canvas.height / cellH) + 4;

        let found = null;
        outer: for (let col = startCol; col < endCol; col++) {
          const masonryOffset = getMasonryOffset(col);
          for (let row = startRow; row < endRow; row++) {
            const screenX = col * cellW + s.x;
            const screenY = row * cellH + s.y + masonryOffset;
            if (
              pos.x >= screenX && pos.x <= screenX + blockW &&
              pos.y >= screenY && pos.y <= screenY + blockH
            ) {
              found = getItem(col, row);
              break outer;
            }
          }
        }

        if (found) {
          if (cursorEl) cursorEl.textContent = found.name.toUpperCase();
          s.hoveredSlug = found.slug;
        } else {
          if (cursorEl) cursorEl.textContent = 'DRAG OR CLICK';
          s.hoveredSlug = null;
        }
      }

      // Move cursor via DOM
      const cursor = document.querySelector('.archive-cursor');
      if (cursor) {
        cursor.style.left = pos.x + 'px';
        cursor.style.top = pos.y + 'px';
      }
    };

    const onUp = e => {
      if (s._locked) return;
      const pos = getPos(e);
      const moved = Math.hypot(pos.x - s.dragStartX, pos.y - s.dragStartY);
      s.dragging = false;

      if (moved < 8 && s.hoveredSlug) {
        const item = s.items.find(i => i.slug === s.hoveredSlug);
        if (item) {
          s._locked = true;
          window.dispatchEvent(new CustomEvent('archive:open', { detail: item }));
        }
      }
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: true });
    canvas.addEventListener('touchmove', onMove, { passive: true });
    canvas.addEventListener('touchend', onUp);

    return () => {
      cancelAnimationFrame(s.animId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('touchstart', onDown);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onUp);
    };
  }, []);

  return (
    <div className="archive-canvas-wrapper">
      <div className="archive-loading-screen">LOADING ARCHIVE...</div>
      <canvas ref={canvasRef} />
      <div className="archive-cursor">
        <div className="archive-cursor-label">DRAG OR CLICK</div>
      </div>
    </div>
  );
}