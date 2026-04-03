import { useEffect, useRef } from 'react';

// Each item gets a random parallax speed factor
function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

export default function ArchiveCanvas() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = document.getElementById('archive-root');
    if (!container) return;

    const numberEl = document.getElementById('archive-number');
    const titleEl  = document.getElementById('archive-title');
    const descEl   = document.getElementById('archive-desc');

    let items      = [];
    let elements   = []; // { el, baseX, baseY, speedX, speedY, currentX, currentY }

    // Canvas state
    let canvasX    = 0;
    let canvasY    = 0;
    let targetX    = 0;
    let targetY    = 0;
    let mouseX     = 0;
    let mouseY     = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragOriginX = 0;
    let dragOriginY = 0;
    let velX       = 0;
    let velY       = 0;
    let lastDragX  = 0;
    let lastDragY  = 0;
    let hoveredEl  = null;
    let scaledEl   = null;
    let animId     = null;

    const W = window.innerWidth;
    const H = window.innerHeight;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      .arc-item {
        position: absolute;
        cursor: pointer;
        transition: opacity 0.3s, filter 0.3s, transform 0.4s cubic-bezier(0.16,1,0.3,1);
        user-select: none;
        will-change: transform;
      }
      .arc-item img {
        display: block;
        pointer-events: none;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .arc-item.dimmed {
        opacity: 0.2;
        filter: blur(5px);
      }
      .arc-item.scaled {
        z-index: 100;
      }
    `;
    document.head.appendChild(style);

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

    function buildCanvas() {
      container.innerHTML = '';
      elements = [];

      // Spread items across 150vw × 150vh canvas
      // Center the canvas on screen initially
      const spreadW = W * 1.5;
      const spreadH = H * 1.5;
      const offsetX = -spreadW * 0.25; // shift left so items start off-screen left
      const offsetY = -spreadH * 0.25;

      items.forEach(function(item, i) {
        var el = document.createElement('div');
        el.className = 'arc-item';
        el.dataset.index = i;

        // Random size — width between 180-360px, height proportional
        var w = Math.round(randomBetween(180, 360));
        var h = Math.round(w * randomBetween(0.6, 1.2));
        el.style.width  = w + 'px';
        el.style.height = h + 'px';

        // Random position across the spread canvas
        var baseX = offsetX + randomBetween(0, spreadW);
        var baseY = offsetY + randomBetween(0, spreadH);

        var img = document.createElement('img');
        img.src = item.image || '';
        img.alt = item.title || '';
        img.draggable = false;
        el.appendChild(img);

        container.appendChild(el);

        // Random parallax speed per item (0.8 to 1.2 — subtle difference)
        var speedX = randomBetween(0.85, 1.15);
        var speedY = randomBetween(0.85, 1.15);

        elements.push({
          el,
          item,
          baseX,
          baseY,
          speedX,
          speedY,
          mouseOffsetX: randomBetween(5, 10) * (Math.random() > 0.5 ? 1 : -1),
          mouseOffsetY: randomBetween(5, 10) * (Math.random() > 0.5 ? 1 : -1),
        });
      });
    }

    function applyPositions() {
      // Normalized mouse position (-1 to 1)
      var normMX = (mouseX / W - 0.5) * 2;
      var normMY = (mouseY / H - 0.5) * 2;

      elements.forEach(function(e) {
        // Canvas drag offset + per-item parallax speed
        var x = e.baseX + canvasX * e.speedX + normMX * e.mouseOffsetX;
        var y = e.baseY + canvasY * e.speedY + normMY * e.mouseOffsetY;
        e.el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      });
    }

    function setDimmed(activeEl) {
      elements.forEach(function(e) {
        if (e.el === activeEl) {
          e.el.classList.remove('dimmed');
        } else {
          e.el.classList.add('dimmed');
        }
      });
    }

    function clearDimmed() {
      elements.forEach(function(e) {
        e.el.classList.remove('dimmed');
      });
    }

    function tick() {
      animId = requestAnimationFrame(tick);

      if (!isDragging) {
        velX *= 0.88;
        velY *= 0.88;
        canvasX += velX;
        canvasY += velY;
      }

      applyPositions();
    }

    // Events
    function onMouseMove(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (isDragging) {
        velX      = e.clientX - lastDragX;
        velY      = e.clientY - lastDragY;
        canvasX   = dragOriginX + (e.clientX - dragStartX);
        canvasY   = dragOriginY + (e.clientY - dragStartY);
        lastDragX = e.clientX;
        lastDragY = e.clientY;
      }
    }

    function onMouseDown(e) {
      if (e.button !== 0) return;
      isDragging  = true;
      dragStartX  = e.clientX;
      dragStartY  = e.clientY;
      dragOriginX = canvasX;
      dragOriginY = canvasY;
      lastDragX   = e.clientX;
      lastDragY   = e.clientY;
      velX        = 0;
      velY        = 0;
      container.style.cursor = 'grabbing';
    }

    function onMouseUp() {
      isDragging = false;
      container.style.cursor = 'grab';
    }

    function onMouseOver(e) {
      var item = e.target.closest('.arc-item');
      if (!item || item === hoveredEl) return;
      hoveredEl = item;
      var idx   = parseInt(item.dataset.index, 10);
      setInfo(items[idx]);
      setDimmed(item);
    }

    function onMouseOut(e) {
      var item = e.target.closest('.arc-item');
      if (!item) return;
      // Only clear if leaving to outside arc-item
      if (!e.relatedTarget || !e.relatedTarget.closest('.arc-item')) {
        hoveredEl = null;
        clearInfo();
        clearDimmed();
      }
    }

    function onClick(e) {
      var item = e.target.closest('.arc-item');
      if (!item) return;

      // If already scaled, unscale
      if (item === scaledEl) {
        item.classList.remove('scaled');
        item.style.transform = '';
        scaledEl = null;
        return;
      }

      // Unscale previous
      if (scaledEl) {
        scaledEl.classList.remove('scaled');
        scaledEl.style.transform = '';
      }

      scaledEl = item;
      item.classList.add('scaled');

      // Scale up in place — override transform temporarily
      var rect   = item.getBoundingClientRect();
      var scaleF = Math.min(2.2, (W * 0.5) / rect.width);
      var dx     = W / 2 - (rect.left + rect.width / 2);
      var dy     = H / 2 - (rect.top + rect.height / 2);

      // Get current transform and add scale on top
      var idx    = parseInt(item.dataset.index, 10);
      var e2     = elements[idx];
      var normMX = (mouseX / W - 0.5) * 2;
      var normMY = (mouseY / H - 0.5) * 2;
      var curX   = e2.baseX + canvasX * e2.speedX + normMX * e2.mouseOffsetX;
      var curY   = e2.baseY + canvasY * e2.speedY + normMY * e2.mouseOffsetY;

      item.style.transform = 'translate(' + (curX + dx) + 'px, ' + (curY + dy) + 'px) scale(' + scaleF + ')';
    }

    container.addEventListener('mousemove',  onMouseMove);
    container.addEventListener('mousedown',  onMouseDown);
    container.addEventListener('mouseover',  onMouseOver);
    container.addEventListener('mouseout',   onMouseOut);
    container.addEventListener('click',      onClick);
    window.addEventListener('mousemove',     onMouseMove);
    window.addEventListener('mouseup',       onMouseUp);

    container.style.cursor = 'grab';

    // Fetch and build
    fetch('https://vein-webflow-react.vercel.app/api/archive')
      .then(r => r.json())
      .then(data => {
        items = data.items || [];
        buildCanvas();
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