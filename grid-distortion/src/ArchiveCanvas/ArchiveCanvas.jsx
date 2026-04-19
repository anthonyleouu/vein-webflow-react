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
      #archive-number,
      #archive-title,
      #archive-desc {
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      #archive-number.info-visible,
      #archive-title.info-visible,
      #archive-desc.info-visible {
        opacity: 1;
      }
      #archive-root { cursor: grab; overflow: hidden; }
      #archive-root.dragging { cursor: grabbing; }
      .arc-item {
        position: absolute;
        left: 0; top: 0;
        will-change: transform;
        user-select: none;
        transform-origin: top left;
        opacity: 0;
        transition: opacity 0.7s ease, filter 0.35s;
      }
      .arc-item img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
      }
      .arc-item.dimmed {
        opacity: 0.15 !important;
        filter: blur(4px);
        transition: opacity 0.35s, filter 0.35s !important;
      }
      .arc-item.hovered { z-index: 50; }
      .arc-item.scaled {
        z-index: 200;
        transition: transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.35s, filter 0.35s !important;
      }
    `;
    document.head.appendChild(style);

    let rawItems = [];
    let tiles    = [];

    let camX = 0, camY = 0;
    let velX = 0, velY = 0;
    let mouseNX = 0, mouseNY = 0;

    let isDragging  = false;
    let dragStartX  = 0, dragStartY  = 0;
    let dragCamX    = 0, dragCamY    = 0;
    let lastDragX   = 0, lastDragY   = 0;
    let dragMoved   = false;

    let hoveredTile = null;
    let scaledTile  = null;
    let animId      = null;

    const W = window.innerWidth;
    const H = window.innerHeight;

    const COLS    = 6;
    const ROWS    = 6;
    const CELL_W  = Math.round(W * 0.38);
    const CELL_H  = Math.round(H * 0.45);
    const TOTAL_W = COLS * CELL_W;
    const TOTAL_H = ROWS * CELL_H;

    // Hide info els immediately via class — our injected style handles it
    [numberEl, titleEl, descEl].forEach(el => {
      if (!el) return;
      el.textContent = '';
      el.classList.remove('info-visible');
    });

    function buildTiles() {
      container.innerHTML = '';
      tiles = [];
      if (!rawItems.length) return;

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const imgIndex     = (row * COLS + col) % rawItems.length;
          const item         = rawItems[imgIndex];
          const el           = document.createElement('div');
          el.className       = 'arc-item';
          const w            = randInt(CELL_W * 0.45, CELL_W * 0.82);
          const h            = randInt(CELL_H * 0.45, CELL_H * 0.82);
          const cellX        = col * CELL_W;
          const cellY        = row * CELL_H;
          const offX         = cellX + rand(CELL_W * 0.05, CELL_W - w - CELL_W * 0.05);
          const offY         = cellY + rand(CELL_H * 0.05, CELL_H - h - CELL_H * 0.05);
          const defaultScale = rand(0.6, 1.0);
          el.style.width     = w + 'px';
          el.style.height    = h + 'px';
          const img          = document.createElement('img');
          img.src            = item.image || '';
          img.alt            = item.title || '';
          img.draggable      = false;
          el.appendChild(img);
          container.appendChild(el);

          tiles.push({
            el, item, offX, offY, w, h, defaultScale,
            speedX: rand(0.88, 1.12),
            speedY: rand(0.88, 1.12),
            mxAmt:  rand(5, 10) * (Math.random() > 0.5 ? 1 : -1),
            myAmt:  rand(5, 10) * (Math.random() > 0.5 ? 1 : -1),
            curX: 0, curY: 0,
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
        if (t === scaledTile || t.returning) return;
        let x = wrap(t.offX + camX * t.speedX, TOTAL_W);
        let y = wrap(t.offY + camY * t.speedY, TOTAL_H);
        if (x > W + 50) x -= TOTAL_W;
        if (y > H + 50) y -= TOTAL_H;
        x += mouseNX * t.mxAmt;
        y += mouseNY * t.myAmt;
        t.curX = x;
        t.curY = y;
        t.el.style.transform = `translate(${x}px,${y}px) scale(${t.defaultScale})`;
      });
    }

    function tick() {
      animId = requestAnimationFrame(tick);
      if (!isDragging) {
        velX *= 0.96;
        velY *= 0.96;
        if (Math.abs(velX) < 0.005) velX = 0;
        if (Math.abs(velY) < 0.005) velY = 0;
        camX += velX;
        camY += velY;
      }
      renderTiles();
    }

    function setInfo(item) {
      if (numberEl) { numberEl.textContent = item.count || '';               numberEl.classList.add('info-visible'); }
      if (titleEl)  { titleEl.textContent  = item.title || item.name || '';  titleEl.classList.add('info-visible'); }
      if (descEl)   { descEl.textContent   = item.description || '';         descEl.classList.add('info-visible'); }
    }

    function clearInfo() {
      [numberEl, titleEl, descEl].forEach(el => {
        if (el) el.classList.remove('info-visible');
      });
      setTimeout(() => {
        if (hoveredTile) return;
        if (numberEl) numberEl.textContent = '';
        if (titleEl)  titleEl.textContent  = '';
        if (descEl)   descEl.textContent   = '';
      }, 300);
    }

    function clearDimmed() {
      tiles.forEach(t => t.el.classList.remove('dimmed'));
    }

    function setHover(tile) {
      if (tile === hoveredTile) return;
      if (hoveredTile) hoveredTile.el.classList.remove('hovered');
      hoveredTile = tile;
      if (tile) {
        tile.el.classList.add('hovered');
        setInfo(tile.item);
        tiles.forEach(t => t.el.classList.toggle('dimmed', t !== tile));
        if (window.revealText) {
          [numberEl, titleEl, descEl].forEach(el => { if (el) window.revealText(el); });
        }
      } else {
        if (!scaledTile) {
          clearInfo();
          clearDimmed();
          if (window.resetText) {
            [numberEl, titleEl, descEl].forEach(el => { if (el) window.resetText(el); });
          }
        }
      }
    }

    function unscale() {
      if (!scaledTile) return;
      const t    = scaledTile;
      scaledTile = null;
      clearDimmed();
      if (!hoveredTile) clearInfo();
      else tiles.forEach(tt => tt.el.classList.toggle('dimmed', tt !== hoveredTile));
      t.returning = true;
      t.el.style.transform = `translate(${t.curX}px,${t.curY}px) scale(${t.defaultScale})`;
      t.el.classList.remove('scaled');
      setTimeout(() => { t.returning = false; }, 520);
    }

    function stopDrag() {
      isDragging = false;
      container.classList.remove('dragging');
      setTimeout(() => { dragMoved = false; }, 50);
    }

    function onMouseMove(e) {
      mouseNX = (e.clientX / W - 0.5);
      mouseNY = (e.clientY / H - 0.5);
      if (isDragging) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 4) dragMoved = true;
        const newVelX = e.clientX - lastDragX;
        const newVelY = e.clientY - lastDragY;
        velX = velX * 0.5 + newVelX * 0.5;
        velY = velY * 0.5 + newVelY * 0.5;
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
      dragStartX = e.clientX; dragStartY = e.clientY;
      dragCamX   = camX;      dragCamY   = camY;
      lastDragX  = e.clientX; lastDragY  = e.clientY;
      velX = 0; velY = 0;
      container.classList.add('dragging');
    }

    function onMouseUp()       { stopDrag(); }
    function onDocMouseLeave() { if (isDragging) stopDrag(); }

    function onMouseOver(e) {
      if (dragMoved) return;
      if (scaledTile) return;
      const arcEl = e.target.closest('.arc-item');
      if (!arcEl) { setHover(null); return; }
      const tile = tiles.find(t => t.el === arcEl);
      if (tile) setHover(tile);
    }

    function onMouseOut(e) {
      if (dragMoved) return;
      if (scaledTile) return;
      if (!e.relatedTarget || !e.relatedTarget.closest('.arc-item')) {
        setHover(null);
      }
    }

    function onClick(e) {
      if (dragMoved) return;
      const arcEl = e.target.closest('.arc-item');
      if (!arcEl) { unscale(); return; }
      const tile = tiles.find(t => t.el === arcEl);
      if (!tile) return;
      if (tile === scaledTile) { unscale(); return; }
      if (scaledTile) unscale();
      scaledTile = tile;
      tile.el.classList.add('scaled');
      tiles.forEach(t => t.el.classList.toggle('dimmed', t !== tile));
      const rect   = tile.el.getBoundingClientRect();
      const scaleF = Math.min(1.5, (W * 0.5) / rect.width);
      const dx     = W / 2 - (rect.left + rect.width  / 2);
      const dy     = H / 2 - (rect.top  + rect.height / 2);
      tile.el.style.transform = `translate(${tile.curX + dx}px,${tile.curY + dy}px) scale(${scaleF})`;
    }

    container.addEventListener('mousemove',  onMouseMove);
    container.addEventListener('mousedown',  onMouseDown);
    container.addEventListener('mouseover',  onMouseOver);
    container.addEventListener('mouseout',   onMouseOut);
    container.addEventListener('click',      onClick);
    window.addEventListener('mousemove',     onMouseMove);
    window.addEventListener('mouseup',       onMouseUp);
    document.addEventListener('mouseleave',  onDocMouseLeave);

    fetch('https://vein-webflow-react.vercel.app/api/archive')
      .then(r => r.json())
      .then(data => {
        rawItems = data.items || [];
        buildTiles();
        requestAnimationFrame(() => {
          renderTiles();
          requestAnimationFrame(() => {
            tiles.forEach(t => {
              const delay = (Math.random() * 0.2 + 0.1).toFixed(2);
              t.el.style.transitionDelay = delay + 's';
              t.el.style.opacity = '1';
            });
            tick();
          });
        });
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
      document.removeEventListener('mouseleave',  onDocMouseLeave);
      style.remove();
      container.innerHTML = '';
    };
  }, []);

  return null;
}