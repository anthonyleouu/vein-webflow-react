import { useEffect, useRef, useState } from 'react';
import './ArchiveCanvas.css';

const GAP = 6;
const BLOCK_WIDTH = Math.round(window.innerWidth * 0.3);
const BLOCK_HEIGHT = Math.round(window.innerHeight * 0.7);

const CELL_W = BLOCK_WIDTH + GAP;
const CELL_H = BLOCK_HEIGHT + GAP;

// Masonry offsets — each column is shifted vertically by a different amount
const MASONRY_OFFSETS = [0, 0.3, 0.15, 0.45, 0.22, 0.38, 0.08, 0.52];

export default function ArchiveCanvas() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    x: 0, y: 0,
    vx: 0, vy: 0,
    dragging: false,
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    animId: null,
    items: [],
    images: {},
    hoveredSlug: null,
  });
  const [cursorLabel, setCursorLabel] = useState('DRAG OR CLICK');
  const [cursorPos, setCursorPos] = useState({ x: -200, y: -200 });
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch archive:', err);
        setLoading(false);
      }
    }
    fetchArchive();
  }, []);

  useEffect(() => {
    if (loading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;

    let blockW = Math.round(window.innerWidth * 0.3);
    let blockH = Math.round(window.innerHeight * 0.7);
    let cellW = blockW + GAP;
    let cellH = blockH + GAP;

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
      // Different item per row AND col for variety
      const index = (((col * 3 + row * 7) % items.length) + items.length) % items.length;
      return items[index];
    };

    const getMasonryOffset = (col) => {
      const absCol = ((col % MASONRY_OFFSETS.length) + MASONRY_OFFSETS.length) % MASONRY_OFFSETS.length;
      return MASONRY_OFFSETS[absCol] * cellH;
    };

    const drawFrame = () => {
      const W = canvas.width;
      const H = canvas.height;

      // Inertia — 0.96 instead of 0.92 = 40% more travel
      if (!s.dragging) {
        s.vx *= 0.96;
        s.vy *= 0.96;
        s.x += s.vx;
        s.y += s.vy;
      }

      ctx.clearRect(0, 0, W, H);

      const startCol = Math.floor(-s.x / cellW) - 1;
      const startRow = Math.floor(-s.y / cellH) - 2;
      const endCol = startCol + Math.ceil(W / cellW) + 3;
      const endRow = startRow + Math.ceil(H / cellH) + 4;

      for (let col = startCol; col < endCol; col++) {
        const masonryOffset = getMasonryOffset(col);

        for (let row = startRow; row < endRow; row++) {
          const item = getItem(col, row);
          const img = item ? s.images[item.id] : null;

          const screenX = col * cellW + s.x;
          const screenY = row * cellH + s.y + masonryOffset;

          ctx.save();

          if (img) {
            const scale = Math.max(
              blockW / img.naturalWidth,
              blockH / img.naturalHeight
            );
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            const dx = screenX - (dw - blockW) / 2;
            const dy = screenY - (dh - blockH) / 2;

            ctx.beginPath();
            ctx.rect(screenX, screenY, blockW, blockH);
            ctx.clip();
            ctx.drawImage(img, dx, dy, dw, dh);
          } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(screenX, screenY, blockW, blockH);
          }

          ctx.restore();
        }
      }

      s.animId = requestAnimationFrame(drawFrame);
    };

    drawFrame();

    const getPos = e => e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };

    const onDown = e => {
      const pos = getPos(e);
      s.dragging = true;
      s.startX = pos.x - s.x;
      s.startY = pos.y - s.y;
      s.lastX = pos.x;
      s.lastY = pos.y;
      s.vx = 0;
      s.vy = 0;
    };

    const onMove = e => {
      const pos = getPos(e);
      setCursorPos({ x: pos.x, y: pos.y });

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
          setCursorLabel(found.name.toUpperCase());
          s.hoveredSlug = found.slug;
        } else {
          setCursorLabel('DRAG OR CLICK');
          s.hoveredSlug = null;
        }
      }
    };

    const onUp = e => {
      const pos = getPos(e);
      const moved = Math.abs(pos.x - s.lastX) + Math.abs(pos.y - s.lastY);
      s.dragging = false;

      if (moved < 5 && s.hoveredSlug) {
        window.location.href = `/archive/${s.hoveredSlug}`;
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
  }, [loading]);

  return (
    <div className="archive-canvas-wrapper">
      {loading && <div className="archive-loading">LOADING ARCHIVE...</div>}
      <canvas ref={canvasRef} />
      <div
        className="archive-cursor"
        style={{ left: cursorPos.x, top: cursorPos.y }}
      >
        <div className="archive-cursor-label">{cursorLabel}</div>
      </div>
    </div>
  );
}