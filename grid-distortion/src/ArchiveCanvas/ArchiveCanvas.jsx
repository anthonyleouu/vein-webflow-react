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
    hoveredCol: null,
    hoveredRow: null,
    _locked: false,
    activeCol: null,
    activeRow: null,
    originX: 0,
    originY: 0,
    animating: false,
    targetX: 0,
    targetY: 0,
    activeScale: 1,
    targetScale: 1,
    globalOpacity: 1,
    targetOpacity: 1,
  });

  useEffect(() => {
    const overlay = document.createElement('div');
    overlay.id = 'archive-canvas-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0;
      z-index: 200;
      display: none;
      pointer-events: all;
    `;
    document.body.appendChild(overlay);

    const closePanel = () => {
      const s = stateRef.current;
      if (!s._locked) return;

      const panel = document.getElementById('archive-panel');
      if (panel) {
        panel.style.transform = 'translateX(100%)';
        panel.style.opacity = '0';
      }

      // Remove active block DOM overlay
      const activeImg = document.getElementById('archive-active-block');
      if (activeImg) activeImg.remove();

      overlay.style.display = 'none';

      s.animating = true;
      s.targetX = s.originX;
      s.targetY = s.originY;
      s.targetScale = 1;
      s.targetOpacity = 1;
      s.activeCol = null;
      s.activeRow = null;

      setTimeout(() => {
        s._locked = false;
        s.animating = false;
      }, 700);
    };

    overlay.addEventListener('click', closePanel);

    const wireClose = () => {
      const closeBtn = document.getElementById('archive-panel-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closePanel();
        });
      }
    };

    wireClose();
    setTimeout(wireClose, 1000);

    window._archiveClosePanel = closePanel;

    return () => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      delete window._archiveClosePanel;
    };
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

    const drawWarpedImage = (img, dx, dy, dw, dh, warpAmount, opacity = 1, scale = 1) => {
      const scale2 = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      const sw = img.naturalWidth * scale2;
      const sh = img.naturalHeight * scale2;
      const sx = -(sw - dw) / 2;
      const sy = -(sh - dh) / 2;

      ctx.save();
      ctx.globalAlpha = opacity;

      if (scale !== 1) {
        ctx.translate(dx + dw / 2, dy + dh / 2);
        ctx.scale(scale, scale);
        ctx.translate(-(dx + dw / 2), -(dy + dh / 2));
      }

      if (warpAmount < 0.01) {
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

      if (s.animating) {
        s.x += (s.targetX - s.x) * 0.08;
        s.y += (s.targetY - s.y) * 0.08;
      } else if (!s.dragging) {
        s.vx *= 0.96;
        s.vy *= 0.96;
        s.x += s.vx;
        s.y += s.vy;
      }

      s.activeScale += (s.targetScale - s.activeScale) * 0.08;
      s.globalOpacity += (s.targetOpacity - s.globalOpacity) * 0.08;
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

          const isActive = s.activeCol === col && s.activeRow === row;
          if (isActive) continue;

          const opacity = s._locked ? s.globalOpacity : 1;

          if (img) {
            drawWarpedImage(img, screenX, screenY, blockW, blockH, s.speed, opacity, 1);
          } else {
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.fillStyle = '#111';
            ctx.fillRect(screenX, screenY, blockW, blockH);
            ctx.restore();
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
        let foundCol = null, foundRow = null;
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
              foundCol = col;
              foundRow = row;
              break outer;
            }
          }
        }

        if (found) {
          if (cursorEl) cursorEl.textContent = found.name.toUpperCase();
          s.hoveredSlug = found.slug;
          s.hoveredCol = foundCol;
          s.hoveredRow = foundRow;
        } else {
          if (cursorEl) cursorEl.textContent = 'DRAG OR CLICK';
          s.hoveredSlug = null;
          s.hoveredCol = null;
          s.hoveredRow = null;
        }
      }
    };

    const onUp = e => {
      if (s._locked) return;
      const pos = getPos(e);
      const moved = Math.hypot(pos.x - s.dragStartX, pos.y - s.dragStartY);
      s.dragging = false;

      if (moved < 8 && s.hoveredSlug) {
        const item = s.items.find(i => i.slug === s.hoveredSlug);
        if (!item) return;

        s._locked = true;
        s.activeCol = s.hoveredCol;
        s.activeRow = s.hoveredRow;

        s.originX = s.x;
        s.originY = s.y;

        const masonryOffset = getMasonryOffset(s.activeCol);
        const currentBlockScreenX = s.activeCol * cellW + s.x;
        const currentBlockScreenY = s.activeRow * cellH + s.y + masonryOffset;

        const targetBlockCenterX = window.innerWidth * 0.25;
        const targetBlockCenterY = window.innerHeight * 0.5;

        const currentBlockCenterX = currentBlockScreenX + blockW / 2;
        const currentBlockCenterY = currentBlockScreenY + blockH / 2;

        s.targetX = s.x + (targetBlockCenterX - currentBlockCenterX);
        s.targetY = s.y + (targetBlockCenterY - currentBlockCenterY);
        s.animating = true;
        s.targetScale = 1.2;
        s.targetOpacity = 0.6;

        // Create DOM overlay for active block — sits above everything
        let activeImg = document.getElementById('archive-active-block');
        if (activeImg) activeImg.remove();

        activeImg = document.createElement('div');
        activeImg.id = 'archive-active-block';
        activeImg.style.cssText = `
          position: fixed;
          z-index: 1003;
          pointer-events: none;
          background-image: url(${item.image});
          background-size: cover;
          background-position: center;
          left: ${currentBlockScreenX}px;
          top: ${currentBlockScreenY}px;
          width: ${blockW}px;
          height: ${blockH}px;
          transform: scale(1);
          transform-origin: center;
          transition: left 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      top 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      width 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      height 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        `;
        document.body.appendChild(activeImg);

        // Animate to target position
        const scaledW = blockW * 1.2;
        const scaledH = blockH * 1.2;
        const targetLeft = targetBlockCenterX - scaledW / 2;
        const targetTop = targetBlockCenterY - scaledH / 2;

        setTimeout(() => {
          activeImg.style.left = targetLeft + 'px';
          activeImg.style.top = targetTop + 'px';
          activeImg.style.width = scaledW + 'px';
          activeImg.style.height = scaledH + 'px';
        }, 50);

        // Populate panel
        const title = document.getElementById('archive-panel-title');
        const creator = document.getElementById('archive-panel-creator');
        const description = document.getElementById('archive-panel-description');
        if (title) title.textContent = item.name || '';
        if (creator) creator.textContent = item.creator || '';
        if (description) description.textContent = item.description || '';

        // Show overlay
        const overlay = document.getElementById('archive-canvas-overlay');
        if (overlay) overlay.style.display = 'block';

        // Slide panel in
        const panel = document.getElementById('archive-panel');
        if (panel) {
          panel.style.transition = 'none';
          panel.style.transform = 'translateX(100%)';
          panel.style.opacity = '0';
          setTimeout(() => {
            panel.style.transition = 'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.7s ease';
            panel.style.transform = 'translateX(0)';
            panel.style.opacity = '1';
          }, 400);
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
