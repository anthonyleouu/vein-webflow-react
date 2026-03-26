import { useEffect } from 'react';
import * as THREE from 'three';

const CARD_W         = 1246;
const CARD_H         = 700;
const GAP            = 256;
const STEP           = CARD_W + GAP;
const SEGMENTS_X     = 32;
const SEGMENTS_Y     = 20;
const BEND_MAX       = 0.6;
const BEND_EASE      = 0.018;
const MOMENTUM_DECAY = 0.92;
const DRAG_MULTI     = 1.4;
const WHEEL_MULTI    = 0.55;
const BG_COLOR       = 0xfffdfc;

// Asymmetric bend:
// uBend = signed bend intensity
// uOffsetX = card's rawX position (negative = left of center, positive = right)
// Outer edge bends more, inner edge bends less
const vertexShader = `
  uniform float uBend;
  uniform float uOffsetX;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    float halfW  = ${(CARD_W * 0.5).toFixed(1)};
    float halfH  = ${(CARD_H * 0.5).toFixed(1)};
    float nx     = pos.x / halfW;   // -1 to +1 across card width
    float ny     = pos.y / halfH;   // -1 to +1 across card height

    // Which side of center is this card on?
    // cardSide: -1 = left of center, 0 = at center, +1 = right of center
    float cardSide = sign(uOffsetX);

    // For a card to the LEFT (cardSide = -1):
    //   left edge  (nx = -1) is the OUTER edge → bends a lot
    //   right edge (nx = +1) is the INNER edge → bends a little
    // For a card to the RIGHT (cardSide = +1):
    //   right edge (nx = +1) is the OUTER edge → bends a lot
    //   left edge  (nx = -1) is the INNER edge → bends a little
    // For CENTER card (cardSide = 0): symmetric

    float outerStrength = 1.0;
    float innerStrength = 0.12;

    // t: how "outer" is this vertex? 0 = inner edge, 1 = outer edge
    float t;
    if (abs(cardSide) < 0.1) {
      // center card: symmetric — both edges equal
      t = 0.5;
    } else {
      // nx goes -1 to +1
      // if cardSide = -1: outer is at nx=-1, inner at nx=+1
      //   → t = (-nx + 1) / 2 ... wait, we want t=1 when nx=-1
      //   → t = (1.0 - nx * cardSide) / 2.0 ... 
      // simpler: t = (1.0 + nx * (-cardSide)) * 0.5
      t = (1.0 + nx * (-cardSide)) * 0.5;
    }

    float strength = mix(innerStrength, outerStrength, t * t);
    float bend = strength * uBend * 200.0;
    pos.z += bend;

    // Subtle vertical barrel — always present when bending
    pos.z += (ny * ny) * abs(uBend) * 50.0;

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
    let targetBend   = 0;
    let currentBend  = 0;
    let isDragging   = false;
    let dragStartX   = 0;
    let dragOffsetStart = 0;
    let lastDragX    = 0;
    let dragVel      = 0;
    let animId       = null;
    let hoveredIndex = -1;
    let snapTimer    = null;
    let isSnapping   = false;
    let snapTarget   = 0;

    const numEl    = document.getElementById('work-number');
    const clientEl = document.getElementById('work-client');
    if (numEl)    { numEl.style.opacity = '0'; numEl.style.transition = 'opacity 0.2s'; }
    if (clientEl) { clientEl.style.opacity = '0'; clientEl.style.transition = 'opacity 0.2s'; }

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
      c.getContext('2d').fillStyle = '#999';
      c.getContext('2d').fillRect(0, 0, 4, 4);

      const mat = new THREE.ShaderMaterial({
        vertexShader, fragmentShader,
        uniforms: {
          uTexture:  { value: new THREE.CanvasTexture(c) },
          uBend:     { value: 0.0 },
          uOffsetX:  { value: 0.0 },
          uOpacity:  { value: 1.0 },
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
        card.mat.uniforms.uBend.value    = currentBend;
        card.mat.uniforms.uOffsetX.value = rawX;
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
        offset += d * 0.06;
        if (Math.abs(d) < 0.3) { offset = snapTarget; isSnapping = false; }
      } else if (!isDragging) {
        velocity *= MOMENTUM_DECAY;
        offset += velocity;
        if (Math.abs(velocity) < 0.05) {
          velocity = 0;
          snapToCenter();
        }
      }

      const spd = isDragging ? dragVel * 8 : velocity;
      targetBend = Math.max(-BEND_MAX, Math.min(BEND_MAX, spd * 0.006));
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
      isSnapping = false;
      clearTimeout(snapTimer);
      velocity = Math.max(-80, Math.min(80, velocity + e.deltaY * WHEEL_MULTI));
      snapTimer = setTimeout(snapToCenter, 400);
    };

    const onMouseDown = (e) => {
      isDragging = true; isSnapping = false;
      clearTimeout(snapTimer);
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
    const onTouchEnd   = () => { isDragging = false; velocity = Math.max(-80, Math.min(80, tV * 6)); snapTimer = setTimeout(snapToCenter, 400); };

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