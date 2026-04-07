import { useEffect } from 'react';

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b)); }

export default function ArchiveCanvas() {
  useEffect(() => {
    const container = document.getElementById('archive-root');
    if (!container) return;

    const numberEl = document.getElementById('archive-number');
    const titleEl  = document.getElementById('archive-title');
    const descEl   = document.getElementById('archive-desc');

    const style = document.createElement('style');
    style.textContent = `
      #archive-root { cursor: grab; overflow: hidden; }
      #archive-root.dragging { cursor: grabbing; }
      .arc-item {
        position: absolute;
        left: 0; top: 0;
        will-change: transform;
        user-select: none;
        transition: opacity 0.35s, filter 0.35s;
      }
      .arc-item img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
      }
      .arc-item.dimmed {
        opacity: 0.15;
        filter: blur(4px);
      }
      .arc-item.hovered {
        z-index: 50;
      }
      .arc-item.scaled {
        z-index: 200;
        transition: transform 0.45s cubic-bezier(0.16,1,0.3,1), opacity 0.35s, filter 0.35s !important;
      }
    `;
    document.head.appendChild(style);

    let rawItems = [];
    let tiles    = [];

    let camX = 0, camY = 0;
    let velX = 0, velY = 0;
    let mouseNX = 0, mouseNY = 0;

    let isDragging   = false;
    let dragStartX   = 0, dragStartY   = 0;
    let dragCamX     = 0, dragCamY     = 0;
    let lastDragX    = 0, lastDragY    = 0;
    let dragMoved    = false; // track if actual drag happened
    let dragDist     = 0;

    let hoveredTile  = null;
    let scaledTile   = null;
    let animId       = null;

    const W = window.innerWidth;
    const H = window.innerHeight;

    const COLS    = 6;
    const ROWS    = 6;
    const CELL_W  = Math.round(W * 0.38);
    const CELL_H  = Math.round(H * 0.45);
    const TOTAL_W = COLS * CELL_W;
    const TOTAL_H = ROWS * CELL_H;

    function buildTiles() {
      container.innerHTML = '';
      tiles = [];
      if (!rawItems.length) return;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const imgIndex = (row * COLS + col) % rawItems.length;
          const item     = rawItems[imgIndex];

          const el  = document.createElement('div');
          el.className = 'arc-item';

          const w = randInt(CELL_W * 0.45, CELL_W * 0.82);
          const h = randInt(CELL_H * 0.45, CELL_H * 0.82);

          const cellX = col * CELL_W;
          const cellY = row * CELL_H;
          const offX  = cellX + rand(CELL_W * 0.05, CELL_W - w - CELL_W * 0.05);
          const offY  = cellY + rand(CELL_H * 0.05, CELL_H - h - CELL_H * 0.05);

          el.style.width  = w + 'px';
          el.style.height = h + 'px';

          const img = document.createElement('img');
          img.src      = item.image || '';
          img.alt      = item.title || '';
          img.draggable = false;
          el.appendChild(img);
          container.appendChild(el);

          tiles.push({
            el, item, offX, offY, w, h,
            speedX: rand(0.88, 1.12),
            speedY: rand(0.88, 1.12),
            mxAmt:  rand(5, 10) * (Math.random() > 0.5 ? 1 : -1),
            myAmt:  rand(5, 10) * (Math.random() > 0.5 ? 1 : -1),
            curX: 0, curY: 0, // track current rendered position
          });
        }
      }

      camX = -(TOTAL_W / 2 - W / 2);
      camY = -(TOTAL_H / 2 - H / 2);
    }

    function wrap(val, total) {
      return ((val % total) + total) % total;
    }

    function renderTiles() {
      tiles.forEach(t => {
        if (t === scaledTile) return; // don't move scaled tile

        let x = wrap(t.offX + camX * t.speedX, TOTAL_W);
        let y = wrap(t.offY + camY * t.speedY, TOTAL_H);
        if (x > W  + 50) x -= TOTAL_W;
        if (y > H + 50) y -= TOTAL_H;

        x += mouseNX * t.mxAmt;
        y += mouseNY * t.myAmt;

        t.curX = x;
        t.curY = y;
        t.el.style.transform = `translate(${x}px,${y}px)`;
      });
    }

    function tick() {
      animId = requestAnimationFrame(tick);
      if (!isDragging) {
        velX *= 0.88;
        velY *= 0.88;
        if (Math.abs(velX) < 0.01) velX = 0;
        if (Math.abs(velY) < 0.01) velY = 0;
        camX += velX;
        camY += velY;
      }
      renderTiles();
    }

    function setInfo(item) {
      if (numberEl) numberEl.textContent = item.count || '';
      if (titleEl)  titleEl.textContent  = item.title || item.name || '';
      if (descEl)   descEl.textContent   = item.description || '';
    }

    function clearInfo() {
      if (numberEl) numberEl.textContent = '';
      if (titleEl)  titleEl.textContent  = '';
      if (descEl)   descEl.textContent   = '';
    }

    function setHover(tile) {
      if (tile === hoveredTile) return;
      if (hoveredTile) hoveredTile.el.classList.remove('hovered');
      hoveredTile = tile;
      if (tile) {
        tile.el.classList.add('hovered');
        setInfo(tile.item);
        tiles.forEach(t => {
          t.el.classList.toggle('dimmed', t !== tile);
        });
      } else {
        clearInfo();
        tiles.forEach(t => t.el.classList.remove('dimmed'));
      }
    }

    function onMouseMove(e) {
      mouseNX = (e.clientX / W - 0.5);
      mouseNY = (e.clientY / H - 0.5);

      if (isDragging) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        dragDist = Math.sqrt(dx * dx + dy * dy);
        if (dragDist > 4) dragMoved = true;

        velX      = e.clientX - lastDragX;
        velY      = e.clientY - lastDragY;
        camX      = dragCamX + dx;
        camY      = dragCamY + dy;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
      }
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      isDragging = true;
      dragMoved  = false;
      dragDist   = 0;
      dragStartX = e.clientX; dragStartY = e.clientY;
      dragCamX   = camX;      dragCamY   = camY;
      lastDragX  = e.clientX; lastDragY  = e.clientY;
      velX = 0; velY = 0;
      container.classList.add('dragging');
    }

    function onMouseUp() {
      isDragging = false;
      container.classList.remove('dragging');
    }

    function onMouseOver(e) {
      if (dragMoved) return;
      const arcEl = e.target.closest('.arc-item');
      if (!arcEl) { setHover(null); return; }
      const tile = tiles.find(t => t.el === arcEl);
      if (tile) setHover(tile);
    }

    function onMouseOut(e) {
      if (!e.relatedTarget || !e.relatedTarget.closest('.arc-item')) {
        setHover(null);
      }
    }

    function onClick(e) {
      if (dragMoved) return; // was a drag not a click

      const arcEl = e.target.closest('.arc-item');

      // Click outside — unscale
      if (!arcEl) {
        if (scaledTile) {
          scaledTile.el.classList.remove('scaled');
          scaledTile = null;
        }
        return;
      }

      const tile = tiles.find(t => t.el === arcEl);
      if (!tile) return;

      // Unscale previous
      if (scaledTile && scaledTile !== tile) {
        scaledTile.el.classList.remove('scaled');
        scaledTile = null;
      }

      // Toggle
      if (tile === scaledTile) {
        tile.el.classList.remove('scaled');
        scaledTile = null;
        return;
      }

      // Scale up to center
      scaledTile = tile;
      tile.el.classList.add('scaled');

      const rect   = arcEl.getBoundingClientRect();
      const scaleF = Math.min(1.5, (W * 0.5) / rect.width);
      const dx     = W / 2 - (rect.left + rect.width  / 2);
      const dy     = H / 2 - (rect.top  + rect.height / 2);

      arcEl.style.transform = `translate(${tile.curX + dx}px, ${tile.curY + dy}px) scale(${scaleF})`;
    }

    container.addEventListener('mousemove',  onMouseMove);
    container.addEventListener('mousedown',  onMouseDown);
    container.addEventListener('mouseover',  onMouseOver);
    container.addEventListener('mouseout',   onMouseOut);
    container.addEventListener('click',      onClick);
    window.addEventListener('mousemove',     onMouseMove);
    window.addEventListener('mouseup',       onMouseUp);

    fetch('https://vein-webflow-react.vercel.app/api/archive')
      .then(r => r.json())
      .then(data => {
        rawItems = data.items || [];
        buildTiles();
        tick();
      })
      .catch(err => {
        console.error('Archive fetch error:', err);
        tick();
      });

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousemove',  onMouseMove);
      container.removeEventListener('mousedown',  onMouseDown);
      container.removeEventListener('mouseover',  onMouseOver);
      container.removeEventListener('mouseout',   onMouseOut);
      container.removeEventListener('click',      onClick);
      window.removeEventListener('mousemove',     onMouseMove);
      window.removeEventListener('mouseup',       onMouseUp);
      style.remove();
      container.innerHTML = '';
    };
  }, []);

  return null;
}