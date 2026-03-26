import { useEffect } from 'react';
import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────────────────────────
const CARD_W        = 1246;
const CARD_H        = 700;
const GAP           = 256;
const STEP          = CARD_W + GAP;
const CIRCLE_R      = 3200;   // radius of the imaginary circle cards sit on
const STRETCH_MAX   = 1.22;   // max horizontal stretch on fast scroll
const STRETCH_EASE  = 0.055;
const MOMENTUM_DECAY = 0.87;
const SNAP_EASE     = 0.068;
const DRAG_MULTI    = 1.3;
const WHEEL_MULTI   = 0.5;
const BG_COLOR      = 0xfffdfc;

// Fragment shader — grayscale blend + opacity
const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uGrayscale;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uTexture, vUv);
    float g = dot(c.rgb, vec3(0.299,0.587,0.114));
    c.rgb = mix(c.rgb, vec3(g), uGrayscale);
    gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  }
`;

// Vertex shader — horizontal stretch only (arc done via mesh rotation)
const vertexShader = `
  uniform float uStretch;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    pos.x *= uStretch;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export default function WorkSlider() {
  useEffect(() => {
    const container = document.getElementById('work-slider-root');
    if (!container) return;

    // ── state ────────────────────────────────────────────────────────────
    let cards        = [];
    let offset       = 0;          // current scroll offset in px
    let velocity     = 0;
    let stretch      = 1;
    let isDragging   = false;
    let dragStartX   = 0;
    let dragOffsetStart = 0;
    let lastDragX    = 0;
    let dragVel      = 0;
    let activeIndex  = -1;
    let isSnapping   = false;
    let targetOffset = 0;
    let snapTimer    = null;
    let snappedOnStop = false;
    let animId       = null;

    // ── renderer ─────────────────────────────────────────────────────────
    const W = window.innerWidth;
    const H = window.innerHeight;
    const fov  = 50;
    const vFov = (fov * Math.PI) / 180;
    const camZ = H / (2 * Math.tan(vFov / 2));

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(BG_COLOR, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, W / H, 1, 20000);
    camera.position.set(0, 0, camZ);
    camera.lookAt(0, 0, 0);

    // ── card factory ──────────────────────────────────────────────────────
    function createCard(item, index) {
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

      // placeholder
      const c = document.createElement('canvas');
      c.width = 4; c.height = 4;
      c.getContext('2d').fillStyle = '#999';
      c.getContext('2d').fillRect(0,0,4,4);

      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTexture:   { value: new THREE.CanvasTexture(c) },
          uStretch:   { value: 1.0 },
          uGrayscale: { value: 0.0 },
          uOpacity:   { value: 1.0 },
        },
        transparent: false,
        side: THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);

      // video
      const vid = document.createElement('video');
      vid.muted = true; vid.loop = true;
      vid.playsInline = true; vid.crossOrigin = 'anonymous';

      const applyTex = () => {
        const tex = new THREE.VideoTexture(vid);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.uniforms.uTexture.value = tex;
      };

      if (vid.canPlayType('application/vnd.apple.mpegurl')) {
        vid.src = item.videoUrl;
        vid.addEventListener('loadedmetadata', applyTex, { once: true });
        vid.play().catch(()=>{});
      } else if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({ enableWorker: false, maxBufferLength: 10 });
        hls.loadSource(item.videoUrl);
        hls.attachMedia(vid);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          vid.play().catch(()=>{});
          applyTex();
        });
      } else {
        vid.src = item.videoUrl;
        vid.addEventListener('loadedmetadata', applyTex, { once: true });
        vid.play().catch(()=>{});
      }

      return { mesh, mat, vid, item, index };
    }

    // ── layout — position + rotate each card on the circle ───────────────
    function layout() {
      const total = cards.length;
      if (!total) return;
      const bandW = total * STEP;

      cards.forEach((card, i) => {
        // wrap offset so cards loop
        let rawX = i * STEP - offset;
        rawX = ((rawX % bandW) + bandW) % bandW;
        if (rawX > bandW / 2) rawX -= bandW;

        // angle on circle: how far from center in radians
        const angle = rawX / CIRCLE_R;

        // position on circle arc
        card.mesh.position.x = Math.sin(angle) * CIRCLE_R;
        card.mesh.position.z = Math.cos(angle) * CIRCLE_R - CIRCLE_R; // center at z=0
        card.mesh.position.y = 0;

        // face toward camera (tangent to circle)
        card.mesh.rotation.y = -angle;

        // stretch uniform
        card.mat.uniforms.uStretch.value = stretch;

        // grayscale — center card full color, others desaturated
        const isCenter = Math.abs(rawX) < STEP * 0.55;
        const gCur = card.mat.uniforms.uGrayscale.value;
        card.mat.uniforms.uGrayscale.value += ((isCenter ? 0.0 : 0.6) - gCur) * 0.07;
      });
    }

    // ── find center card ──────────────────────────────────────────────────
    function getCenter() {
      const total = cards.length;
      if (!total) return 0;
      const bandW = total * STEP;
      let best = 0, bestD = Infinity;
      cards.forEach((_, i) => {
        let rawX = i * STEP - offset;
        rawX = ((rawX % bandW) + bandW) % bandW;
        if (rawX > bandW / 2) rawX -= bandW;
        if (Math.abs(rawX) < bestD) { bestD = Math.abs(rawX); best = i; }
      });
      return best;
    }

    // ── update DOM text ───────────────────────────────────────────────────
    function updateInfo(idx) {
      if (idx === activeIndex) return;
      activeIndex = idx;
      const item = cards[idx]?.item;
      if (!item) return;
      const numEl    = document.getElementById('work-number');
      const clientEl = document.getElementById('work-client');
      const num = String(idx + 1).padStart(3, '0');
      const fade = (el, text) => {
        if (!el) return;
        el.style.transition = 'opacity 0.25s';
        el.style.opacity = '0';
        setTimeout(() => { el.textContent = text; el.style.opacity = '1'; }, 130);
      };
      fade(numEl, num);
      fade(clientEl, item.client || item.name || '');
    }

    // ── snap ──────────────────────────────────────────────────────────────
    function snap() {
      const total = cards.length;
      if (!total) return;
      const bandW = total * STEP;
      let best = 0, bestD = Infinity;
      cards.forEach((_, i) => {
        let rawX = i * STEP - offset;
        rawX = ((rawX % bandW) + bandW) % bandW;
        if (rawX > bandW / 2) rawX -= bandW;
        if (Math.abs(rawX) < bestD) { bestD = Math.abs(rawX); best = i; }
      });
      const diff = ((best * STEP - offset) % bandW + bandW) % bandW;
      targetOffset = offset + (diff > bandW / 2 ? diff - bandW : diff);
      isSnapping = true;
      snappedOnStop = true;
    }

    // ── render loop ───────────────────────────────────────────────────────
    function animate() {
      animId = requestAnimationFrame(animate);

      if (isSnapping) {
        const d = targetOffset - offset;
        offset += d * SNAP_EASE;
        if (Math.abs(d) < 0.25) { offset = targetOffset; isSnapping = false; velocity = 0; }
      } else if (!isDragging) {
        velocity *= MOMENTUM_DECAY;
        offset += velocity;
        if (Math.abs(velocity) < 0.05) {
          velocity = 0;
          if (!snappedOnStop) snap();
        }
      }

      // stretch based on speed
      const spd = Math.abs(isDragging ? dragVel * 8 : velocity);
      const tStretch = spd > 4 ? 1 + Math.min(spd * 0.0007, STRETCH_MAX - 1) : 1.0;
      stretch += (tStretch - stretch) * STRETCH_EASE;

      layout();
      updateInfo(getCenter());
      renderer.render(scene, camera);
    }

    // ── events ────────────────────────────────────────────────────────────
    const onWheel = (e) => {
      e.preventDefault();
      isSnapping = false; snappedOnStop = false;
      velocity = Math.max(-45, Math.min(45, velocity + e.deltaY * WHEEL_MULTI));
      clearTimeout(snapTimer);
      snapTimer = setTimeout(snap, 220);
    };

    const onMouseDown = (e) => {
      isDragging = true; isSnapping = false; snappedOnStop = false;
      dragStartX = e.clientX; dragOffsetStart = offset;
      lastDragX = e.clientX; dragVel = 0;
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = (e.clientX - lastDragX) * DRAG_MULTI;
      dragVel = -dx;
      offset = dragOffsetStart - (e.clientX - dragStartX) * DRAG_MULTI;
      lastDragX = e.clientX;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      velocity = Math.max(-45, Math.min(45, dragVel * 6));
      renderer.domElement.style.cursor = 'grab';
      clearTimeout(snapTimer);
      snapTimer = setTimeout(snap, 220);
    };

    let tX = 0, tLX = 0, tV = 0, tOS = 0;
    const onTouchStart = (e) => { isDragging = true; isSnapping = false; snappedOnStop = false; tX = e.touches[0].clientX; tLX = tX; tOS = offset; tV = 0; };
    const onTouchMove  = (e) => { if (!isDragging) return; e.preventDefault(); const dx = (e.touches[0].clientX - tLX) * DRAG_MULTI; tV = -dx; offset = tOS - (e.touches[0].clientX - tX) * DRAG_MULTI; tLX = e.touches[0].clientX; };
    const onTouchEnd   = () => { isDragging = false; velocity = Math.max(-45, Math.min(45, tV * 6)); clearTimeout(snapTimer); snapTimer = setTimeout(snap, 220); };

    const onResize = () => {
      const W2 = window.innerWidth, H2 = window.innerHeight;
      renderer.setSize(W2, H2);
      camera.aspect = W2 / H2;
      camera.position.z = H2 / (2 * Math.tan(vFov / 2));
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener('wheel',      onWheel,      { passive: false });
    renderer.domElement.addEventListener('mousedown',  onMouseDown);
    window.addEventListener             ('mousemove',  onMouseMove);
    window.addEventListener             ('mouseup',    onMouseUp);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove',  onTouchMove,  { passive: false });
    renderer.domElement.addEventListener('touchend',   onTouchEnd);
    window.addEventListener             ('resize',     onResize);
    renderer.domElement.style.cursor = 'grab';

    // ── fetch & boot ──────────────────────────────────────────────────────
    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        cards = (data.items || []).map((item, i) => createCard(item, i));
        activeIndex = -1;
        updateInfo(0);
        animate();
      })
      .catch(() => animate());

    // ── cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(snapTimer);
      renderer.domElement.removeEventListener('wheel',      onWheel);
      renderer.domElement.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener             ('mousemove',  onMouseMove);
      window.removeEventListener             ('mouseup',    onMouseUp);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove',  onTouchMove);
      renderer.domElement.removeEventListener('touchend',   onTouchEnd);
      window.removeEventListener             ('resize',     onResize);
      cards.forEach(c => {
        c.vid.pause(); c.vid.src = '';
        c.mesh.geometry.dispose(); c.mat.dispose();
        scene.remove(c.mesh);
      });
      renderer.dispose();
      renderer.forceContextLoss();
      container.innerHTML = '';
    };
  }, []);

  return null;
}
