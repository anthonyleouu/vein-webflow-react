import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// ── Constants ─────────────────────────────────────────────────────────────────
const CARD_W = 1246;
const CARD_H = 700;
const GAP = 256;
const ARC_RADIUS = 2800;       // cylinder radius — larger = flatter arc
const ARC_STRENGTH = 0.0018;   // how much velocity amplifies the arc
const STRETCH_MAX = 1.35;      // max horizontal stretch on fast scroll
const STRETCH_EASE = 0.08;     // how quickly stretch releases
const MOMENTUM_EASE = 0.055;   // scroll momentum decay
const SNAP_EASE = 0.072;       // snap spring strength
const DRAG_MULTIPLIER = 1.8;
const WHEEL_MULTIPLIER = 0.9;
const BG_COLOR = 0xfffdfc;

const vertexShader = `
  uniform float uStretch;
  uniform float uArcOffset;   // world-x offset for this card's arc position
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Horizontal stretch — expand edges, keep center stable
    pos.x *= uStretch;

    // Arc bend — rotate card on Y axis based on its X position in world space
    float arcAngle = (pos.x + uArcOffset) / ${ARC_RADIUS.toFixed(1)};
    float cosA = cos(arcAngle);
    float sinA = sin(arcAngle);
    float newX = pos.x * cosA - pos.z * sinA;
    float newZ = pos.x * sinA + pos.z * cosA + ${ARC_RADIUS.toFixed(1)};
    pos.x = newX;
    pos.z = newZ - ${ARC_RADIUS.toFixed(1)};

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  uniform float uGrayscale;
  varying vec2 vUv;

  void main() {
    vec4 color = texture2D(uTexture, vUv);
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(color.rgb, vec3(gray), uGrayscale);
    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
  }
`;

export default function WorkSlider() {
  const mountRef = useRef(null);

  useEffect(() => {
    const container = document.getElementById('work-slider-root');
    if (!container) return;

    // ── State ───────────────────────────────────────────────────────────────
    let items = [];
    let cards = [];
    let offset = 0;          // current x offset in px
    let targetOffset = 0;    // target x offset (momentum/snap target)
    let velocity = 0;        // current scroll velocity
    let stretchFactor = 1;   // current stretch (approaches 1 when idle)
    let isDragging = false;
    let dragStartX = 0;
    let dragStartOffset = 0;
    let lastDragX = 0;
    let dragVelocity = 0;
    let hoveredIndex = -1;
    let activeIndex = 0;
    let animId = null;
    let isSnapping = false;

    const STEP = CARD_W + GAP;

    // ── Three.js setup ───────────────────────────────────────────────────────
    const W = window.innerWidth;
    const H = window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(BG_COLOR, 1);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Perspective camera — FOV tuned so 1246px card fills ~65% of viewport width
    const fov = 50;
    const aspect = W / H;
    const near = 0.1;
    const far = 10000;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    // Position camera so card appears at intended pixel size
    const vFov = (fov * Math.PI) / 180;
    const camZ = H / (2 * Math.tan(vFov / 2));
    camera.position.set(0, 0, camZ);
    camera.lookAt(0, 0, 0);

    // ── Raycaster for hover ──────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // ── Card factory ─────────────────────────────────────────────────────────
    function createCard(item, index) {
      const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H, 32, 1);

      // Start with a 1x1 white texture, replace when video loads
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#888';
      ctx.fillRect(0, 0, 2, 2);
      const placeholderTex = new THREE.CanvasTexture(canvas);

      const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTexture:   { value: placeholderTex },
          uStretch:   { value: 1.0 },
          uArcOffset: { value: 0.0 },
          uOpacity:   { value: 1.0 },
          uGrayscale: { value: 0.0 },
        },
        transparent: false,
        side: THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // Video texture
      const video = document.createElement('video');
video.muted = true;
video.loop = true;
video.playsInline = true;
video.crossOrigin = 'anonymous';

if (video.canPlayType('application/vnd.apple.mpegurl')) {
  video.src = item.videoUrl;
  video.play().catch(() => {});
} else if (window.Hls && window.Hls.isSupported()) {
  const hls = new window.Hls({ enableWorker: false });
  hls.loadSource(item.videoUrl);
  hls.attachMedia(video);
  hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
    video.play().catch(() => {});
  });
} else {
  video.src = item.videoUrl;
  video.play().catch(() => {});
}

const onMeta = () => {
  const tex = new THREE.VideoTexture(video);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  material.uniforms.uTexture.value = tex;
  material.transparent = false;
};
if (video.readyState >= 1) onMeta();
else video.addEventListener('loadedmetadata', onMeta, { once: true });

      return { mesh, material, video, item, index };
    }

    // ── Layout: position cards along X axis ─────────────────────────────────
    function layoutCards() {
      const total = cards.length;
      if (!total) return;
      const bandW = total * STEP;

      cards.forEach((card, i) => {
        // Wrap offset so cards cycle infinitely
        let rawX = i * STEP - offset;
        // Normalize to [-bandW/2, bandW/2]
        rawX = ((rawX % bandW) + bandW) % bandW;
        if (rawX > bandW / 2) rawX -= bandW;

        card.mesh.position.x = rawX;
        card.mesh.position.y = 0;
        card.mesh.position.z = 0;

        // Arc offset = how far this card is from center
        card.material.uniforms.uArcOffset.value = rawX;
        card.material.uniforms.uStretch.value = stretchFactor;

        // Grayscale for non-active cards
        const distFromCenter = Math.abs(rawX);
        const isCenter = distFromCenter < STEP * 0.6;
        const targetGray = isCenter ? 0.0 : 0.5;
        const currentGray = card.material.uniforms.uGrayscale.value;
        card.material.uniforms.uGrayscale.value += (targetGray - currentGray) * 0.08;
      });
    }

    // ── Find active (center) card ────────────────────────────────────────────
    function getActiveIndex() {
      let closest = 0;
      let minDist = Infinity;
      const total = cards.length;
      const bandW = total * STEP;

      cards.forEach((card, i) => {
        let rawX = i * STEP - offset;
        rawX = ((rawX % bandW) + bandW) % bandW;
        if (rawX > bandW / 2) rawX -= bandW;
        const dist = Math.abs(rawX);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      return closest;
    }

    // ── Update DOM info ──────────────────────────────────────────────────────
    function updateInfo(index) {
      if (index === activeIndex && cards.length) return;
      activeIndex = index;
      const item = cards[index]?.item;
      if (!item) return;

      const numEl = document.getElementById('work-number');
      const clientEl = document.getElementById('work-client');
      const num = String(index + 1).padStart(3, '0');

      if (numEl) {
        numEl.style.transition = 'opacity 0.3s';
        numEl.style.opacity = '0';
        setTimeout(() => {
          numEl.textContent = num;
          numEl.style.opacity = '1';
        }, 150);
      }
      if (clientEl) {
        clientEl.style.transition = 'opacity 0.3s';
        clientEl.style.opacity = '0';
        setTimeout(() => {
          clientEl.textContent = item.client || item.name || '';
          clientEl.style.opacity = '1';
        }, 150);
      }
    }

    // ── Snap to nearest card ─────────────────────────────────────────────────
    function snapToNearest() {
      const total = cards.length;
      if (!total) return;
      const bandW = total * STEP;

      let closest = 0;
      let minDist = Infinity;

      cards.forEach((card, i) => {
        let rawX = i * STEP - offset;
        rawX = ((rawX % bandW) + bandW) % bandW;
        if (rawX > bandW / 2) rawX -= bandW;
        const dist = Math.abs(rawX);
        if (dist < minDist) { minDist = dist; closest = i; }
      });

      // Target offset that puts closest card at center (rawX = 0)
      // rawX = i * STEP - offset = 0 → offset = i * STEP
      let snapTarget = closest * STEP;

      // Normalize: find shortest path
      const diff = ((snapTarget - offset) % bandW + bandW) % bandW;
      const shortDiff = diff > bandW / 2 ? diff - bandW : diff;
      targetOffset = offset + shortDiff;
      isSnapping = true;
    }

    // ── Render loop ──────────────────────────────────────────────────────────
    let snapTimer = null;

    function animate() {
      animId = requestAnimationFrame(animate);

      if (isSnapping) {
        offset += (targetOffset - offset) * SNAP_EASE;
        if (Math.abs(targetOffset - offset) < 0.5) {
          offset = targetOffset;
          isSnapping = false;
        }
      } else if (!isDragging) {
        velocity *= (1 - MOMENTUM_EASE);
        offset += velocity;
        if (Math.abs(velocity) < 0.1) velocity = 0;
      }

      // Stretch: approaches 1 when velocity is low
      const targetStretch = 1 + Math.min(Math.abs(velocity) * 0.0015, STRETCH_MAX - 1);
      stretchFactor += (targetStretch - stretchFactor) * STRETCH_EASE;

      layoutCards();

      const newActive = getActiveIndex();
      updateInfo(newActive);

      renderer.render(scene, camera);
    }

    // ── Events ───────────────────────────────────────────────────────────────

    // Wheel
    const handleWheel = (e) => {
      e.preventDefault();
      isSnapping = false;
      velocity += e.deltaY * WHEEL_MULTIPLIER;
      clearTimeout(snapTimer);
      snapTimer = setTimeout(snapToNearest, 150);
    };

    // Mouse drag
    const handleMouseDown = (e) => {
      isDragging = true;
      isSnapping = false;
      dragStartX = e.clientX;
      dragStartOffset = offset;
      lastDragX = e.clientX;
      dragVelocity = 0;
    };

    const handleMouseMove = (e) => {
      // Hover raycasting
      mouse.x = (e.clientX / W) * 2 - 1;
      mouse.y = -(e.clientY / H) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(cards.map(c => c.mesh));
      const newHovered = hits.length > 0
        ? cards.findIndex(c => c.mesh === hits[0].object)
        : -1;
      if (newHovered !== hoveredIndex) {
        hoveredIndex = newHovered;
        renderer.domElement.style.cursor = newHovered >= 0 ? 'pointer' : 'grab';
      }

      if (!isDragging) return;
      const dx = (e.clientX - lastDragX) * DRAG_MULTIPLIER;
      dragVelocity = -dx;
      offset = dragStartOffset - (e.clientX - dragStartX) * DRAG_MULTIPLIER;
      lastDragX = e.clientX;
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      velocity = dragVelocity * 8;
      clearTimeout(snapTimer);
      snapTimer = setTimeout(snapToNearest, 150);
    };

    // Touch
    let touchStartX = 0;
    let touchLastX = 0;
    let touchVelocity = 0;
    let touchStartOffset = 0;

    const handleTouchStart = (e) => {
      isDragging = true;
      isSnapping = false;
      touchStartX = e.touches[0].clientX;
      touchLastX = touchStartX;
      touchStartOffset = offset;
      touchVelocity = 0;
    };

    const handleTouchMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const dx = (e.touches[0].clientX - touchLastX) * DRAG_MULTIPLIER;
      touchVelocity = -dx;
      offset = touchStartOffset - (e.touches[0].clientX - touchStartX) * DRAG_MULTIPLIER;
      touchLastX = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
      isDragging = false;
      velocity = touchVelocity * 8;
      clearTimeout(snapTimer);
      snapTimer = setTimeout(snapToNearest, 150);
    };

    // Resize
    const handleResize = () => {
      const W2 = window.innerWidth;
      const H2 = window.innerHeight;
      renderer.setSize(W2, H2);
      camera.aspect = W2 / H2;
      const vFov2 = (fov * Math.PI) / 180;
      camera.position.z = H2 / (2 * Math.tan(vFov2 / 2));
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('resize', handleResize);
    renderer.domElement.style.cursor = 'grab';

    // ── Fetch and init ────────────────────────────────────────────────────────
    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        items = data.items || [];
        cards = items.map((item, i) => createCard(item, i));

        // Init info
        activeIndex = -1;
        updateInfo(0);
        animate();
      })
      .catch(err => {
        console.error('WorkSlider fetch error:', err);
        animate();
      });

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(snapTimer);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      renderer.domElement.removeEventListener('touchstart', handleTouchStart);
      renderer.domElement.removeEventListener('touchmove', handleTouchMove);
      renderer.domElement.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('resize', handleResize);
      cards.forEach(card => {
        card.video.pause();
        card.video.src = '';
        card.mesh.geometry.dispose();
        card.material.dispose();
        scene.remove(card.mesh);
      });
      renderer.dispose();
      renderer.forceContextLoss();
      container.innerHTML = '';
    };
  }, []);

  return null;
}