import { useEffect, useRef, useState } from 'react';
import './ArchiveCanvas.css';

const BLOCK_WIDTH = 400;
const BLOCK_HEIGHT = 280;
const GAP = 24;

const CELL_W = BLOCK_WIDTH + GAP;
const CELL_H = BLOCK_HEIGHT + GAP;

export default function ArchiveCanvas() {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    x: 0, y: 0,
    vx: 0, vy: 0,
    dragging: false,
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    distortion: 0,
    targetDistortion: 0,
    animId: null,
    items: [],
    images: {},
    hoveredSlug: null,
    cursorX: 0,
    cursorY: 0,
  });
  const [cursorLabel, setCursorLabel] = useState('DRAG OR CLICK');
  const [cursorPos, setCursorPos] = useState({ x: -200, y: -200 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArchive() {
      try {
        const res = await fetch('https://vein-webflow-react.vercel.app/api/archive');
        const data = await res.json();
        console.log('Archive data:', data);
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

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const getItem = (col, row) => {
      const items = s.items;
      if (!items.length) return null;
      const index = ((col % items.length) + items.length) % items.length;
      return items[index];
    };

    const drawFrame = () => {
      const W = canvas.width;
      const H = canvas.height;

      if (!s.dragging) {
        s.vx *= 0.92;
        s.vy *= 0.92;
        s.x += s.vx;
        s.y += s.vy;
      }

      s.targetDistortion = s.dragging
        ? Math.min(Math.sqrt(s.vx * s.vx + s.vy * s.vy) * 0.5, 1)
        : 0;
      s.distortion += (s.targetDistortion - s.distortion) * 0.08;

      ctx.clearRect(0, 0, W, H);

      const startCol = Math.floor(-s.x / CELL_W) - 1;
      const startRow = Math.floor(-s.y / CELL_H) - 1;
      const endCol = startCol + Math.ceil(W / CELL_W) + 3;
      const endRow = startRow + Math.ceil(H / CELL_H) + 3;

      for (let col = startCol; col < endCol; col++) {
        for (let row = startRow; row < endRow; row++) {
          const item = getItem(col, row);
          const img = item ? s.images[item.id] : null;

          const screenX = col * CELL_W + s.x;
          const screenY = row * CELL_H + s.y;

          const distX = s.distortion * s.vx * 0.3;
          const distY = s.distortion * s.vy * 0.3;

          ctx.save();
          ctx.translate(screenX + BLOCK_WIDTH / 2, screenY + BLOCK_HEIGHT / 2);
          ctx.transform(1, distY * 0.01, distX * 0.01, 1, 0, 0);

          if (img) {
            const scale = Math.max(
              BLOCK_WIDTH / img.naturalWidth,
              BLOCK_HEIGHT / img.naturalHeight
            );
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            const dx = -dw / 2;
            const dy = -dh / 2;

            ctx.beginPath();
            ctx.rect(-BLOCK_WIDTH / 2, -BLOCK_HEIGHT / 2, BLOCK_WIDTH, BLOCK_HEIGHT);
            ctx.clip();
            ctx.drawImage(img, dx, dy, dw, dh);
          } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(-BLOCK_WIDTH / 2, -BLOCK_HEIGHT / 2, BLOCK_WIDTH, BLOCK_HEIGHT);
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
        const startCol = Math.floor(-s.x / CELL_W) - 1;
        const startRow = Math.floor(-s.y / CELL_H) - 1;
        const endCol = startCol + Math.ceil(canvas.width / CELL_W) + 3;
        const endRow = startRow + Math.ceil(canvas.height / CELL_H) + 3;

        let found = null;
        for (let col = startCol; col < endCol; col++) {
          for (let row = startRow; row < endRow; row++) {
            const screenX = col * CELL_W + s.x;
            const screenY = row * CELL_H + s.y;
            if (
              pos.x >= screenX && pos.x <= screenX + BLOCK_WIDTH &&
              pos.y >= screenY && pos.y <= screenY + BLOCK_HEIGHT
            ) {
              found = getItem(col, row);
              break;
            }
          }
          if (found) break;
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