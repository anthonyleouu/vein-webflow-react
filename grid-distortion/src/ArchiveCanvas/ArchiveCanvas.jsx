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

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      #archive-root { cursor: grab; }
      #archive-root.dragging { cursor: grabbing; }
      .arc-item {
        position: absolute;
        left: 0; top: 0;
        will-change: transform;
        transition: opacity 0.35s, filter 0.35s;
        user-select: none;
      }
      .arc-item img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
        draggable: false;
      }
      .arc-item.dimmed {
        opacity: 0.15;
        filter: blur(4px);
      }
      .arc-item.hovered {
        z-index: 50;
      }
    `;
    document.head.appendChild(style);

    let rawItems  = [];  // from API
    let tiles     = [];  // { el, imgIndex, offX, offY, w, h, speedX, speedY }

    // Canvas offset (drag)
    let camX = 0, camY = 0;
    let velX = 0, velY = 0;

    // Mouse position for parallax
    let mouseNX = 0, mouseNY = 0;

    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dragCamX = 0, dragCamY = 0;
    let lastDragX = 0, lastDragY = 0;

    let hoveredTile = null;
    let animId = null;

    const W = window.innerWidth;
    const H = window.innerHeight;

    // Tile grid config
    // We create a large grid of tiles. Each tile has a random offset within its cell.
    const COLS       = 6;
    const ROWS       = 6;
    const CELL_W     = Math.round(W * 0.38);
    const CELL_H     = Math.round(H * 0.45);
    const TOTAL_W    = COLS * CELL_W;
    const TOTAL_H    = ROWS * CELL_H;

    function buildTiles() {
      container.innerHTML = '';
      tiles = [];

      if (!rawItems.length) return;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const imgIndex = (row * COLS + col) % rawItems.length;
          const item     = rawItems[imgIndex];

          const el = document.createElement('div');
          el.className = 'arc-item';

          // Random size within cell
          const w = randInt(CELL_W * 0.45, CELL_W * 0.85);
          const h = randInt(CELL_H * 0.45, CELL_H * 0.85);

          // Random offset within cell so items don't all align
          const cellX = col * CELL_W;
          const cellY = row * CELL_H;
          const offX  = cellX + rand(CELL_W * 0.05, CELL_W - w - CELL_W * 0.05);
          const offY  = cellY + rand(CELL_H * 0.05, CELL_H - h - CELL_H * 0.05);

          el.style.width  = w + 'px';
          el.style.height = h + 'px';

          const img = document.createElement('img');
          img.src = item.image || '';
          img.alt = item.title || '';
          img.draggable = false;
          el.appendChild(img);

          container.appendChild(el);

          // Random parallax speed (subtle — between 0.9 and 1.1)
          const speedX = rand(0.88, 1.12);
          const speedY = rand(0.88, 1.12);

          // Mouse parallax amount (5-10px)
          const mxAmt = rand(5, 10) * (Math.random() > 0.5 ? 1 : -1);
          const myAmt = rand(5, 10) * (Math.random() > 0.5 ? 1 : -1);

          tiles.push({ el, item, offX, offY, w, h, speedX, speedY, mxAmt, myAmt });
        }
      }

      // Start camera centered so items fill screen
      camX = -(TOTAL_W / 2 - W / 2);
      camY = -(TOTAL_H / 2 - H / 2);
    }

    function wrapValue(val, total) {
      return ((val % total) + total) % total;
    }

    function renderTiles() {
      tiles.forEach(function(t) {
        // Wrap position for infinite tiling
        let x = wrapValue(t.offX + camX * t.speedX, TOTAL_W);
        let y = wrapValue(t.offY + camY * t.speedY, TOTAL_H);

        // Shift so items wrap from opposite side
        // We need to check if item would be off screen and wrap it
        if (x > W + 50) x -= TOTAL_W;
        if (y > H + 50) y -= TOTAL_H;

        // Mouse parallax on top
        x += mouseNX * t.mxAmt;
        y += mouseNY * t.myAmt;

        t.el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
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
      // Clear previous
      if (hoveredTile) {
        hoveredTile.el.classList.remove('hovered');
      }
      hoveredTile = tile;

      if (tile) {
        tile.el.classList.add('hovered');
        setInfo(tile.item);
        // Dim all others
        tiles.forEach(t => {
          if (t !== tile) t.el.classList.add('dimmed');
          else t.el.classList.remove('dimmed');
        });
      } else {
        clearInfo();
        tiles.forEach(t => t.el.classList.remove('dimmed'));
      }
    }

    // Events
    function onMouseMove(e) {
      mouseNX = (e.clientX / W - 0.5);
      mouseNY = (e.clientY / H - 0.5);

      if (isDragging) {
        velX  = e.clientX - lastDragX;
        velY  = e.clientY - lastDragY;
        camX  = dragCamX + (e.clientX - dragStartX);
        camY  = dragCamY + (e.clientY - dragStartY);
        lastDragX = e.clientX;
        lastDragY = e.clientY;
      }
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      isDragging = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      dragCamX = camX; dragCamY = camY;
      lastDragX = e.clientX; lastDragY = e.clientY;
      velX = 0; velY = 0;
      container.classList.add('dragging');
    }

    function onMouseUp(e) {
      if (!isDragging) return;
      isDragging = false;
      container.classList.remove('dragging');
    }

    function onMouseOver(e) {
      if (isDragging) return;
      const arcEl = e.target.closest('.arc-item');
      if (!arcEl) {
        setHover(null);
        return;
      }
      const tile = tiles.find(t => t.el === arcEl);
      if (tile) setHover(tile);
    }

    function onMouseOut(e) {
      if (!e.relatedTarget || !e.relatedTarget.closest('.arc-item')) {
        setHover(null);
      }
    }

    function onClick(e) {
      if (isDragging) return;
      const arcEl = e.target.closest('.arc-item');
      if (!arcEl) return;

      const tile = tiles.find(t => t.el === arcEl);
      if (!tile) return;

      // Toggle scale
      if (arcEl.dataset.scaled === '1') {
        arcEl.dataset.scaled = '0';
        arcEl.style.transition = 'transform 0.45s cubic-bezier(0.16,1,0.3,1), opacity 0.35s, filter 0.35s';
        arcEl.style.zIndex = '';
        // Restore normal render on next frame
        return;
      }

      arcEl.dataset.scaled = '1';
      arcEl.style.zIndex = '200';
      arcEl.style.transition = 'transform 0.45s cubic-bezier(0.16,1,0.3,1), opacity 0.35s, filter 0.35s';

      // Center + scale
      const rect   = arcEl.getBoundingClientRect();
      const scaleF = Math.min(1.5, (W * 0.55) / rect.width);
      const dx     = W / 2 - (rect.left + rect.width  / 2);
      const dy     = H / 2 - (rect.top  + rect.height / 2);

      const cur    = new DOMMatrix(getComputedStyle(arcEl).transform);
      arcEl.style.transform = `translate(${cur.m41 + dx}px, ${cur.m42 + dy}px) scale(${scaleF})`;

      // Click anywhere else to dismiss
      setTimeout(() => {
        function dismiss(ev) {
          if (!ev.target.closest('.arc-item') || ev.target.closest('.arc-item') !== arcEl) {
            arcEl.dataset.scaled = '0';
            arcEl.style.zIndex = '';
            arcEl.style.transition = 'transform 0.45s cubic-bezier(0.16,1,0.3,1), opacity 0.35s, filter 0.35s';
            window.removeEventListener('click', dismiss);
          }
        }
        window.addEventListener('click', dismiss);
      }, 50);
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