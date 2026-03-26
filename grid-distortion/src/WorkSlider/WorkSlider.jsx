import { useEffect } from 'react';
import * as THREE from 'three';

const CARD_W         = 1246;
const CARD_H         = 700;
const GAP            = 256;
const STEP           = CARD_W + GAP;
const SEGMENTS       = 20;      // horizontal segments for bending
const BEND_MAX       = 0.55;    // max bend amount (radians-ish)
const BEND_EASE      = 0.032;   // how slowly bend relaxes (lower = slower spring back)
const MOMENTUM_DECAY = 0.92;
const DRAG_MULTI     = 1.4;
const WHEEL_MULTI    = 0.55;
const BG_COLOR       = 0xfffdfc;

// Vertex shader — bends the card horizontally based on uBend
// The bend is a sinusoidal curve: edges curve forward/back, center stays flat
const vertexShader = `
  uniform float uBend;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Normalize x to [-1, 1]
    float nx = pos.x / (${CARD_W.toFixed(1)} * 0.5);

    // Parabolic curve: zero at center, max at left/right edges
    
    pos.z += (nx * nx) * uBend * 274.0;


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

    let cards        = [];
    let offset       = 0;
    let velocity     = 0;
    let targetBend   = 0;   // bend we want based on velocity
    let currentBend  = 0;   // current animated bend
    let isDragging   = false;
    let dragStartX   = 0;
    let dragOffsetStart = 0;
    let lastDragX    = 0;
    let dragVel      = 0;
    let animId       = null;
    let hoveredIndex = -1;

    const numEl    = document.getElementById('work-number');
    const clientEl = document.getElementById('work-client');
    if (numEl)    { numEl.style.opacity    = '0'; numEl.style.transition    = 'opacity 0.2s'; }
    if (clientEl) { clientEl.style.opacity = '0'; clientEl.style.transition = 'opacity 0.2s'; }

    const W    = window.innerWidth;
    const H    = window.innerHeight;
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

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-9999, -9999);

    function createCard(item, index) {
      // More horizontal segments for smooth bend curve
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, SEGMENTS, 1);

      const c = document.createElement('canvas');
      c.width = 4; c.height = 4;
      c.getContext('2d').fillStyle = '#999';
      c.getContext('2d').fillRect(0, 0, 4, 4);

      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTexture: { value: new THREE.CanvasTexture(c) },
          uBend:    { value: 0.0 },
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

        // Flat horizontal positioning — no rotation, no arc
        card.mesh.position.set(rawX, 0, 0);
        card.mesh.rotation.set(0, 0, 0);

        // Apply same bend to all cards
        card.mat.uniforms.uBend.value = currentBend;
      });
    }

    function animate() {
      animId = requestAnimationFrame(animate);

      if (!isDragging) {
        velocity *= MOMENTUM_DECAY;
        offset += velocity;
        if (Math.abs(velocity) < 0.01) velocity = 0;
      }

      // Bend target: based on current speed, direction-aware
      const spd = isDragging ? dragVel * 8 : velocity;
      targetBend = Math.max(-BEND_MAX, Math.min(BEND_MAX, spd * 0.006));

      // Slow spring back to 0
      currentBend += (targetBend - currentBend) * BEND_EASE;
      if (Math.abs(currentBend) < 0.0001) currentBend = 0;

      layout();

      // Hover
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(cards.map(c => c.mesh));
      const newHovered = hits.length > 0 ? hits[0].object.userData.index : -1;

      if (newHovered !== hoveredIndex) {
        hoveredIndex = newHovered;
        if (hoveredIndex >= 0) {
          const item = cards[hoveredIndex]?.item;
          if (item) {
            const num = String(hoveredIndex + 1).padStart(3, '0');
            if (numEl)    { numEl.textContent    = num;                          numEl.style.opacity    = '1'; }
            if (clientEl) { clientEl.textContent = item.client || item.name || ''; clientEl.style.opacity = '1'; }
          }
        } else {
          if (numEl)    numEl.style.opacity    = '0';
          if (clientEl) clientEl.style.opacity = '0';
        }
      }

      renderer.render(scene, camera);
    }

    // ── Events ────────────────────────────────────────────────────────────
    const onWheel = (e) => {
      e.preventDefault();
      velocity = Math.max(-80, Math.min(80, velocity + e.deltaY * WHEEL_MULTI));
    };

    const onMouseDown = (e) => {
      isDragging = true;
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
      velocity = Math.max(-80, Math.min(80, dragVel * 6));
      renderer.domElement.style.cursor = 'grab';
    };

    const onMouseLeave = () => {
      mouse.set(-9999, -9999);
      if (numEl)    numEl.style.opacity    = '0';
      if (clientEl) clientEl.style.opacity = '0';
      hoveredIndex = -1;
    };

    let tX = 0, tLX = 0, tV = 0, tOS = 0;
    const onTouchStart = (e) => { isDragging = true; tX = e.touches[0].clientX; tLX = tX; tOS = offset; tV = 0; };
    const onTouchMove  = (e) => { if (!isDragging) return; e.preventDefault(); const dx = (e.touches[0].clientX - tLX) * DRAG_MULTI; tV = -dx; offset = tOS - (e.touches[0].clientX - tX) * DRAG_MULTI; tLX = e.touches[0].clientX; };
    const onTouchEnd   = () => { isDragging = false; velocity = Math.max(-80, Math.min(80, tV * 6)); };

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