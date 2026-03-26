import { useEffect } from 'react';
import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────────────────────────
const CARD_W         = 1246;
const CARD_H         = 700;
const GAP            = 256;
const STEP           = CARD_W + GAP;
const CIRCLE_R       = 2200;   // resting arc radius
const CIRCLE_R_MIN   = 1400;   // tightest arc (at max scroll speed)
const STRETCH_MAX    = 1.2;    // max horizontal stretch
const STRETCH_EASE   = 0.06;
const ARC_EASE       = 0.06;   // how fast arc tightens/relaxes
const MOMENTUM_DECAY = 0.91;
const DRAG_MULTI     = 1.4;
const WHEEL_MULTI    = 0.55;
const BG_COLOR       = 0xfffdfc;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uTexture, vUv);
    gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  }
`;

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

    let cards      = [];
    let offset     = 0;
    let velocity   = 0;
    let stretch    = 1;
    let arcR       = CIRCLE_R;  // current arc radius (animated)
    let isDragging = false;
    let dragStartX = 0;
    let dragOffsetStart = 0;
    let lastDragX  = 0;
    let dragVel    = 0;
    let animId     = null;
    let hoveredIndex = -1;

    // DOM info elements
    const numEl    = document.getElementById('work-number');
    const clientEl = document.getElementById('work-client');

    // Hide info initially
    if (numEl)    { numEl.style.opacity = '0'; numEl.style.transition = 'opacity 0.2s'; }
    if (clientEl) { clientEl.style.opacity = '0'; clientEl.style.transition = 'opacity 0.2s'; }

    const W   = window.innerWidth;
    const H   = window.innerHeight;
    const fov = 50;
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

    // Raycaster for hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-9999, -9999);

    function createCard(item, index) {
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

      const c = document.createElement('canvas');
      c.width = 4; c.height = 4;
      c.getContext('2d').fillStyle = '#999';
      c.getContext('2d').fillRect(0, 0, 4, 4);

      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTexture: { value: new THREE.CanvasTexture(c) },
          uStretch: { value: 1.0 },
          uOpacity: { value: 1.0 },
        },
        transparent: false,
        side: THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.index = index;
      mesh.userData.item  = item;
      scene.add(mesh);

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
        vid.play().catch(() => {});
      } else if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({ enableWorker: false, maxBufferLength: 10 });
        hls.loadSource(item.videoUrl);
        hls.attachMedia(vid);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          vid.play().catch(() => {});
          applyTex();
        });
      } else {
        vid.src = item.videoUrl;
        vid.addEventListener('loadedmetadata', applyTex, { once: true });
        vid.play().catch(() => {});
      }

      return { mesh, mat, vid, item, index };
    }

    function layout() {
      const total = cards.length;
      if (!total) return;
      const bandW = total * STEP;

      cards.forEach((card, i) => {
        let rawX = i * STEP - offset;
        rawX = ((rawX % bandW) + bandW) % bandW;
        if (rawX > bandW / 2) rawX -= bandW;

        const angle = rawX / arcR;
        card.mesh.position.x = Math.sin(angle) * arcR;
        card.mesh.position.z = Math.cos(angle) * arcR - arcR;
        card.mesh.position.y = 0;
        card.mesh.rotation.y = -angle;
        card.mat.uniforms.uStretch.value = stretch;
      });
    }

    function animate() {
      animId = requestAnimationFrame(animate);

      if (!isDragging) {
        velocity *= MOMENTUM_DECAY;
        offset += velocity;
        if (Math.abs(velocity) < 0.01) velocity = 0;
      }

      // Speed drives both stretch and arc tightening
      const spd = Math.abs(isDragging ? dragVel * 8 : velocity);
      const tStretch = spd > 1 ? 1 + Math.min(spd * 0.0009, STRETCH_MAX - 1) : 1.0;
      stretch += (tStretch - stretch) * STRETCH_EASE;

      // Arc tightens when scrolling fast, relaxes to CIRCLE_R when stopped
      const tArcR = spd > 1
        ? CIRCLE_R - Math.min(spd * 0.8, CIRCLE_R - CIRCLE_R_MIN)
        : CIRCLE_R;
      arcR += (tArcR - arcR) * ARC_EASE;

      layout();

      // Hover detection
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(cards.map(c => c.mesh));
      const newHovered = hits.length > 0 ? hits[0].object.userData.index : -1;

      if (newHovered !== hoveredIndex) {
        hoveredIndex = newHovered;
        if (hoveredIndex >= 0) {
          const item = cards[hoveredIndex]?.item;
          if (item) {
            const num = String(hoveredIndex + 1).padStart(3, '0');
            if (numEl)    { numEl.textContent = num; numEl.style.opacity = '1'; }
            if (clientEl) { clientEl.textContent = item.client || item.name || ''; clientEl.style.opacity = '1'; }
          }
        } else {
          if (numEl)    numEl.style.opacity = '0';
          if (clientEl) clientEl.style.opacity = '0';
        }
      }

      renderer.render(scene, camera);
    }

    // ── Events ────────────────────────────────────────────────────────────
    const onWheel = (e) => {
      e.preventDefault();
      velocity = Math.max(-60, Math.min(60, velocity + e.deltaY * WHEEL_MULTI));
    };

    const onMouseDown = (e) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragOffsetStart = offset;
      lastDragX = e.clientX;
      dragVel = 0;
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      // Update mouse for raycaster
      mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (!isDragging) return;
      const dx = (e.clientX - lastDragX) * DRAG_MULTI;
      dragVel = -dx;
      offset = dragOffsetStart - (e.clientX - dragStartX) * DRAG_MULTI;
      lastDragX = e.clientX;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      velocity = Math.max(-60, Math.min(60, dragVel * 6));
      renderer.domElement.style.cursor = 'grab';
    };

    const onMouseLeave = () => {
      mouse.set(-9999, -9999);
      if (numEl)    numEl.style.opacity = '0';
      if (clientEl) clientEl.style.opacity = '0';
      hoveredIndex = -1;
    };

    let tX = 0, tLX = 0, tV = 0, tOS = 0;
    const onTouchStart = (e) => {
      isDragging = true;
      tX = e.touches[0].clientX; tLX = tX; tOS = offset; tV = 0;
    };
    const onTouchMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const dx = (e.touches[0].clientX - tLX) * DRAG_MULTI;
      tV = -dx;
      offset = tOS - (e.touches[0].clientX - tX) * DRAG_MULTI;
      tLX = e.touches[0].clientX;
    };
    const onTouchEnd = () => {
      isDragging = false;
      velocity = Math.max(-60, Math.min(60, tV * 6));
    };

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
    renderer.domElement.addEventListener('mouseleave', onMouseLeave);
    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove',  onTouchMove,  { passive: false });
    renderer.domElement.addEventListener('touchend',   onTouchEnd);
    window.addEventListener             ('resize',     onResize);
    renderer.domElement.style.cursor = 'grab';

    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        cards = (data.items || []).map((item, i) => createCard(item, i));
        animate();
      })
      .catch(() => animate());

    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener('wheel',      onWheel);
      renderer.domElement.removeEventListener('mousedown',  onMouseDown);
      window.removeEventListener             ('mousemove',  onMouseMove);
      window.removeEventListener             ('mouseup',    onMouseUp);
      renderer.domElement.removeEventListener('mouseleave', onMouseLeave);
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