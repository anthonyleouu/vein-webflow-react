import { useEffect } from 'react';
import * as THREE from 'three';

const CARD_W         = 1246;
const CARD_H         = 700;
const GAP            = 256;
const STEP           = CARD_W + GAP;
const SEGMENTS_X     = 48;
const SEGMENTS_Y     = 48;
const TENSION_MAX    = 1.0;
const TENSION_EASE   = 0.016;
const MOMENTUM_DECAY = 0.91;
const DRAG_MULTI     = 1.4;
const WHEEL_MULTI    = 0.5;
const BG_COLOR       = 0xfffdfc;

// Radial pillow bulge:
// Center stays flat, all edges bow outward equally
// distFromCenter = normalized distance from card center (0 at center, ~1 at corners)
// bulge = distFromCenter * (1 - distFromCenter) → peaks halfway between center and edge
const vertexShader = `
  uniform float uTension;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    float nx = pos.x / ${(CARD_W * 0.5).toFixed(1)};
    float ny = pos.y / ${(CARD_H * 0.5).toFixed(1)};

    // Radial distance from center, normalized to [0, 1]
    float dist = sqrt(nx * nx + ny * ny) / sqrt(2.0);

    // Pillow curve: 0 at center, peaks at ~0.5 dist, 0 at corners
    float bulge = dist * (1.0 - dist) * 4.0;

    pos.z += bulge * uTension * ${(CARD_W * 0.22).toFixed(1)};

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uTexture, vUv);
    gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  }
`;

export default function WorkSlider() {
  useEffect(() => {
    const container = document.getElementById('work-slider-root');
    if (!container) return;

    let cards           = [];
    let offset          = 0;
    let velocity        = 0;
    let targetTension   = 0;
    let currentTension  = 0;
    let isDragging      = false;
    let dragStartX      = 0;
    let dragOffsetStart = 0;
    let lastDragX       = 0;
    let dragVel         = 0;
    let animId          = null;
    let hoveredIndex    = -1;
    let snapTimer       = null;
    let isSnapping      = false;
    let snapTarget      = 0;

    const numEl    = document.getElementById('work-number');
    const clientEl = document.getElementById('work-client');
    if (numEl)    { numEl.style.opacity = '0'; numEl.style.transition = 'opacity 0.25s'; }
    if (clientEl) { clientEl.style.opacity = '0'; clientEl.style.transition = 'opacity 0.25s'; }

    const W    = window.innerWidth;
    const H    = window.innerHeight;
    const fov  = 50;
    const vFov = (fov * Math.PI) / 180;
    const camZ = H / (2 * Math.tan(vFov / 2));

    const renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: false,
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

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-9999, -9999);

    function createCard(item, index) {
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, SEGMENTS_X, SEGMENTS_Y);

      const c = document.createElement('canvas');
      c.width = 4; c.height = 4;
      c.getContext('2d').fillStyle = '#888';
      c.getContext('2d').fillRect(0, 0, 4, 4);

      const mat = new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: {
          uTexture: { value: new THREE.CanvasTexture(c) },
          uTension: { value: 0.0 },
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
        card.mesh.position.set(rawX, 0, 0);
        card.mesh.rotation.set(0, 0, 0);
        card.mat.uniforms.uTension.value = currentTension;
      });
    }

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

    function snapToCenter() {
      const total = cards.length;
      if (!total) return;
      const bandW = total * STEP;
      const best = getCenter();
      const diff = ((best * STEP - offset) % bandW + bandW) % bandW;
      snapTarget = offset + (diff > bandW / 2 ? diff - bandW : diff);
      isSnapping = true;
    }

    function animate() {
      animId = requestAnimationFrame(animate);

      if (isSnapping) {
        const d = snapTarget - offset;
        offset += d * 0.055;
        if (Math.abs(d) < 0.25) { offset = snapTarget; isSnapping = false; }
      } else if (!isDragging) {
        velocity *= MOMENTUM_DECAY;
        offset += velocity;
        if (Math.abs(velocity) < 0.04) { velocity = 0; snapToCenter(); }
      }

      const rawSpeed = isDragging ? dragVel * 6 : velocity;
      targetTension = Math.max(-TENSION_MAX, Math.min(TENSION_MAX, rawSpeed / 80));
      currentTension += (targetTension - currentTension) * TENSION_EASE;
      if (Math.abs(currentTension) < 0.0002) currentTension = 0;

      layout();

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

    const onWheel = (e) => {
      e.preventDefault();
      isSnapping = false; clearTimeout(snapTimer);
      velocity = Math.max(-80, Math.min(80, velocity + e.deltaY * WHEEL_MULTI));
      snapTimer = setTimeout(snapToCenter, 400);
    };

    const onMouseDown = (e) => {
      isDragging = true; isSnapping = false; clearTimeout(snapTimer);
      dragStartX = e.clientX; dragOffsetStart = offset;
      lastDragX = e.clientX; dragVel = 0;
      renderer.domElement.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
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
      velocity = Math.max(-80, Math.min(80, dragVel * 5));
      renderer.domElement.style.cursor = 'grab';
      snapTimer = setTimeout(snapToCenter, 400);
    };

    const onMouseLeave = () => {
      mouse.set(-9999, -9999);
      if (numEl)    numEl.style.opacity = '0';
      if (clientEl) clientEl.style.opacity = '0';
      hoveredIndex = -1;
    };

    let tX = 0, tLX = 0, tV = 0, tOS = 0;
    const onTouchStart = (e) => { isDragging = true; isSnapping = false; clearTimeout(snapTimer); tX = e.touches[0].clientX; tLX = tX; tOS = offset; tV = 0; };
    const onTouchMove  = (e) => { if (!isDragging) return; e.preventDefault(); const dx = (e.touches[0].clientX - tLX) * DRAG_MULTI; tV = -dx; offset = tOS - (e.touches[0].clientX - tX) * DRAG_MULTI; tLX = e.touches[0].clientX; };
    const onTouchEnd   = () => { isDragging = false; velocity = Math.max(-80, Math.min(80, tV * 5)); snapTimer = setTimeout(snapToCenter, 400); };

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
      clearTimeout(snapTimer);
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