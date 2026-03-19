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
    globalOpacity: 1,
    targetOpacity: 1,
    activeBlockX: 0,
    activeBlockY: 0,
    activeBlockTargetX: 0,
    activeBlockTargetY: 0,
    activeBlockW: 0,
    activeBlockH: 0,
    activeBlockTargetW: 0,
    activeBlockTargetH: 0,
    activeBlockImg: null,
    activeBlockAnimating: false,
    activeBlockSettled: false,
    gridData: null,
    mouseVX: 0,
    mouseVY: 0,
    lastMouseX: 0,
    lastMouseY: 0,
  });

  useEffect(() => {
    const GRID = 15;
    stateRef.current.gridData = new Float32Array(4 * GRID * GRID);

    const overlay = document.createElement('div');
    overlay.id = 'archive-canvas-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0;
      z-index: 200; display: none; pointer-events: all;
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

      overlay.style.display = 'none';

      s.animating = true;
      s.targetX = s.originX;
      s.targetY = s.originY;
      s.targetOpacity = 1;
      s.activeCol = null;
      s.activeRow = null;
      s.activeBlockAnimating = false;
      s.activeBlockSettled = false;
      s.activeBlockImg = null;
      if (s.gridData) s.gridData.fill(0);

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
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
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
    const GRID = 15;
    const EASE = 0.07;

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

    const onMouseMove = e => {
      s.mouseVX = e.clientX - s.lastMouseX;
      s.mouseVY = e.clientY - s.lastMouseY;
      s.lastMouseX = e.clientX;
      s.lastMouseY = e.clientY;
    };
    window.addEventListener('mousemove', onMouseMove);

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

    const drawWarpedImage = (img, dx, dy, dw, dh, warpAmount, opacity = 1) => {
      if (!img) return;
      const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const sx = -(sw - dw) / 2;
      const sy = -(sh - dh) / 2;

      ctx.save();
      ctx.globalAlpha = opacity;

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
        ctx.drawImage(offscreen, 0, sy2, dw, stripH + 1, dx + waveX, dy + sy2, dw, stripH + 1);
      }
      ctx.restore();
    };

    const drawActiveBlock = (img, dx, dy, dw, dh) => {
      if (!img) return;

      const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      const sx = -(sw - dw) / 2;
      const sy = -(sh - dh) / 2;

      // Before settled or on mobile — draw normally
      if (!s.activeBlockSettled || window.innerWidth < 1024) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, dw, dh);
        ctx.clip();
        ctx.drawImage(img, dx + sx, dy + sy, sw, sh);
        ctx.restore();
        return;
      }

      // Update grid distortion data
      const d = s.gridData;
      const mouse = 0.1;
      const strength = 0.15;
      const relaxation = 0.9;

      for (let i = 0; i < GRID * GRID; i++) {
        d[i * 4] *= relaxation;
        d[i * 4 + 1] *= relaxation;
      }

      const mouseXInBlock = s.lastMouseX - dx;
      const mouseYInBlock = s.lastMouseY - dy;
      const gridMouseX = GRID * (mouseXInBlock / dw);
      const gridMouseY = GRID * (mouseYInBlock / dh);
      const maxDist = GRID * mouse;

      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const distSq = Math.pow(gridMouseX - i, 2) + Math.pow(gridMouseY - j, 2);
          if (distSq < maxDist * maxDist) {
            const index = 4 * (i + GRID * j);
            const power = Math.min(maxDist / Math.sqrt(distSq), 10);
            d[index] += strength * 100 * (s.mouseVX * 0.01) * power;
            d[index + 1] -= strength * 100 * (s.mouseVY * 0.01) * power;
          }
        }
      }

      // Draw with smooth strip distortion
      offscreen.width = dw;
      offscreen.height = dh;
      offCtx.clearRect(0, 0, dw, dh);
      offCtx.drawImage(img, sx, sy, sw, sh);

      ctx.save();
      ctx.beginPath();
      ctx.rect(dx, dy, dw, dh);
      ctx.clip();

      const strips = 60;
      const stripH = dh / strips;

      for (let i = 0; i < strips; i++) {
  const sy2 = i * stripH;
  // Sample the full grid row and average the X offset across all columns
  const gridRow = Math.floor((i / strips) * GRID);
  let avgWaveX = 0;
  for (let gc = 0; gc < GRID; gc++) {
    const index = 4 * (gc + GRID * gridRow);
    avgWaveX += d[index];
  }
  avgWaveX = (avgWaveX / GRID) * dw * 0.02;
  ctx.drawImage(
    offscreen,
    0, sy2, dw, stripH + 1,
    dx + avgWaveX, dy + sy2, dw, stripH + 1
  );
}

      ctx.restore();

      s.mouseVX *= 0.85;
      s.mouseVY *= 0.85;
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
          const opacity = (s._locked && !isActive) ? s.globalOpacity : 1;

          if (img) {
            drawWarpedImage(img, screenX, screenY, blockW, blockH, s.speed, opacity);
          } else {
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.fillStyle = '#111';
            ctx.fillRect(screenX, screenY, blockW, blockH);
            ctx.restore();
          }
        }
      }

      // Animate and draw active block on top — pure canvas, zero flash
      if (s.activeBlockAnimating && s.activeBlockImg) {
        s.activeBlockX += (s.activeBlockTargetX - s.activeBlockX) * EASE;
        s.activeBlockY += (s.activeBlockTargetY - s.activeBlockY) * EASE;
        s.activeBlockW += (s.activeBlockTargetW - s.activeBlockW) * EASE;
        s.activeBlockH += (s.activeBlockTargetH - s.activeBlockH) * EASE;

        const ddx = Math.abs(s.activeBlockX - s.activeBlockTargetX);
        const ddy = Math.abs(s.activeBlockY - s.activeBlockTargetY);
        if (ddx < 1 && ddy < 1 && !s.activeBlockSettled) {
          s.activeBlockSettled = true;
        }

        drawActiveBlock(
          s.activeBlockImg,
          s.activeBlockX,
          s.activeBlockY,
          s.activeBlockW,
          s.activeBlockH
        );
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
            if (window._archiveSetCursorText) {
                 window._archiveSetCursorText(found.name.toUpperCase(), true);
            }
            s.hoveredSlug = found.slug;
            s.hoveredCol = foundCol;
            s.hoveredRow = foundRow;
        } else {
        if (window._archiveResetCursor) window._archiveResetCursor();
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
        const scaledW = blockW * 1.1;
        const scaledH = blockH * 1.1;
        const targetLeft = targetBlockCenterX - scaledW / 2;
        const targetTop = targetBlockCenterY - scaledH / 2;

        s.targetX = s.x + (targetBlockCenterX - (currentBlockScreenX + blockW / 2));
        s.targetY = s.y + (targetBlockCenterY - (currentBlockScreenY + blockH / 2));
        s.animating = true;
        s.targetOpacity = 0.6;

        s.activeBlockX = currentBlockScreenX;
        s.activeBlockY = currentBlockScreenY;
        s.activeBlockW = blockW;
        s.activeBlockH = blockH;
        s.activeBlockTargetX = targetLeft;
        s.activeBlockTargetY = targetTop;
        s.activeBlockTargetW = scaledW;
        s.activeBlockTargetH = scaledH;
        s.activeBlockImg = s.images[item.id] || null;
        s.activeBlockAnimating = true;
        s.activeBlockSettled = false;
        if (s.gridData) s.gridData.fill(0);

        const title = document.getElementById('archive-panel-title');
        const creator = document.getElementById('archive-panel-creator');
        const description = document.getElementById('archive-panel-description');
        if (title) title.textContent = item.name || '';
        if (creator) creator.textContent = item.creator || '';
        if (description) description.textContent = item.description || '';

        const overlay = document.getElementById('archive-canvas-overlay');
        if (overlay) overlay.style.display = 'block';

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
      window.removeEventListener('mousemove', onMouseMove);
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
