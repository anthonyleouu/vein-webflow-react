import { useEffect, useRef } from 'react';
import './ArchiveCanvas.css';
import GradualBlur from '../GradualBlur/GradualBlur';


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

      const cursorEl = document.querySelector('.archive-cursor-label');
      const cursor = document.querySelector('.archive-cursor');
      if (cursor) {
        cursor.style.left = pos.x + 'px';
        cursor.style.top = pos.y + 'px';
      }

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
    };

    const onUp = e => {
      if (s._locked) return;
      const pos = getPos(e);
      const moved = Math.hypot(pos.x - s.dragStartX, pos.y - s.dragStartY);
      s.dragging = false;

      if (moved < 8 && s.hoveredSlug) {
        s._locked = true;

        // Fade to black then navigate
        const fade = document.createElement('div');
        fade.style.cssText = `
          position: fixed; inset: 0; background: #000;
          opacity: 0; z-index: 99999;
          transition: opacity 0.5s ease;
          pointer-events: none;
        `;
        document.body.appendChild(fade);
        requestAnimationFrame(() => {
          fade.style.opacity = '1';
          setTimeout(() => {
            window.location.href = `/archive/${s.hoveredSlug}`;
          }, 500);
        });
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
    <canvas ref={canvasRef} />
    <GradualBlur
      target="parent"
      position="top"
      height="8.4rem"
      strength={2}
      divCount={5}
      curve="bezier"
      exponential
      opacity={1}
    />
    <div className="archive-cursor">
      <div className="archive-cursor-label">DRAG OR CLICK</div>
    </div>
  </div>
);
}