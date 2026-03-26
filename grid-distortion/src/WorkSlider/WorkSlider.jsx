import { useEffect } from 'react';
import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────────────────────────
const CARD_W         = 1246;
const CARD_H         = 700;
const GAP            = 256;
const STEP           = CARD_W + GAP;
const SEGMENTS_X     = 48;
const SEGMENTS_Y     = 48;

const TENSION_MAX    = 1.0;
const TENSION_EASE   = 0.024;
const MOMENTUM_DECAY = 0.91;
const DRAG_MULTI     = 1.4;
const WHEEL_MULTI    = 0.5;
const BG_COLOR       = 0xfffdfc;

// ── Vertex Shader ─────────────────────────────────────────────────────────────
// This version keeps the effect visually flatter.
// It deforms mostly in X/Y silhouette space instead of bulging in Z,
// so the card feels like an elastic sheet rather than a curved 3D screen.
const vertexShader = `
  uniform float uTension;   // signed: -1..1
  uniform float uStrength;  // per-card falloff: 0..1
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    float halfW = ${ (CARD_W * 0.5).toFixed(1) };
    float halfH = ${ (CARD_H * 0.5).toFixed(1) };

    float nx = pos.x / halfW; // -1 left, +1 right
    float ny = pos.y / halfH; // -1 bottom, +1 top

    float t  = uTension * uStrength;
    float at = abs(t);

    // 1) Top/bottom arc
    // Strongest at horizontal center, fades toward left/right corners.
    float arcX = 1.0 - nx * nx;
    float topBottomCurve = arcX * at * 26.0;
    pos.y += sign(ny) * topBottomCurve;

    // 2) Side bow
    // Strongest at vertical center, fades toward top/bottom corners.
    float arcY = 1.0 - ny * ny;
    float sideBow = arcY * at * 16.0;
    pos.x -= sign(nx) * sideBow;

    // 3) Directional horizontal pull
    // Gives the whole sheet a directional tension feel.
    float directionalPull = ny * t * 34.0;
    pos.x += directionalPull;

    // 4) Keep center a bit more stable than the perimeter
    float centerStable = 1.0 - smoothstep(0.0, 0.35, length(vec2(nx * 0.85, ny * 0.65)));
    pos.y *= mix(1.0, 0.96, centerStable * 0.35);
    pos.x *= mix(1.0, 0.985, centerStable * 0.2);

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

    let cards = [];
    let offset = 0;
    let velocity = 0;

    let targetTension = 0;
    let currentTension = 0;

    let isDragging = false;
    let dragStartX = 0;
    let dragOffsetStart = 0;
    let lastDragX = 0;
    let dragVel = 0;

    let animId = null;
    let hoveredIndex = -1;
    let snapTimer = null;
    let isSnapping = false;
    let snapTarget = 0;

    const numEl = document.getElementById('work-number');
    const clientEl = document.getElementById('work-client');

    if (numEl) {
      numEl.style.opacity = '0';
      numEl.style.transition = 'opacity 0.25s';
    }
    if (clientEl) {
      clientEl.style.opacity = '0';
      clientEl.style.transition = 'opacity 0.25s';
    }

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Orthographic camera keeps the effect flatter and prevents the “curved screen” look.
    const camera = new THREE.OrthographicCamera(
      W / -2,
      W / 2,
      H / 2,
      H / -2,
      -5000,
      5000
    );
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-9999, -9999);

    // ── Card factory ──────────────────────────────────────────────────────────
    function createCard(item, index) {
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, SEGMENTS_X, SEGMENTS_Y);

      // Small placeholder canvas texture before video is ready
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#888';
      ctx.fillRect(0, 0, 4, 4);

      const placeholderTex = new THREE.CanvasTexture(c);
      placeholderTex.colorSpace = THREE.SRGBColorSpace;

      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTexture:  { value: placeholderTex },
          uTension:  { value: 0.0 },
          uStrength: { value: 0.0 },
          uOpacity:  { value: 1.0 },
        },
        transparent: false,
        side: THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.index = index;
      mesh.userData.item = item;
      scene.add(mesh);

      const vid = document.createElement('video');
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.crossOrigin = 'anonymous';
      vid.preload = 'auto';

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
        const hls = new window.Hls({
          enableWorker: false,
          maxBufferLength: 10,
        });
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

    // ── Layout ────────────────────────────────────────────────────────────────
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

        // Strongest at center, fades toward the sides
        const distFromCenter = Math.abs(rawX);
        const strength = Math.max(0, 1 - distFromCenter / (CARD_W * 1.1));

        card.mat.uniforms.uTension.value = currentTension;
        card.mat.uniforms.uStrength.value = Math.pow(strength, 1.6);
      });
    }

    // ── Snap helpers ──────────────────────────────────────────────────────────
    function getCenter() {
      const total = cards.length;
      if (!total) return 0;

      const bandW = total * STEP;
      let best = 0;
      let bestD = Infinity;

      cards.forEach((_, i) => {
        let rawX = i * STEP - offset;
        rawX = ((rawX % bandW) + bandW) % bandW;
        if (rawX > bandW / 2) rawX -= bandW;

        const d = Math.abs(rawX);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
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

    // ── Animation loop ────────────────────────────────────────────────────────
    function animate() {
      animId = requestAnimationFrame(animate);

      // Position / snapping / inertia
      if (isSnapping) {
        const d = snapTarget - offset;
        offset += d * 0.055;

        if (Math.abs(d) < 0.25) {
          offset = snapTarget;
          isSnapping = false;
        }
      } else if (!isDragging) {
        velocity *= MOMENTUM_DECAY;
        offset += velocity;

        if (Math.abs(velocity) < 0.04) {
          velocity = 0;
          snapToCenter();
        }
      }

      // Signed horizontal tension based on momentum
      const rawSpeed = isDragging ? dragVel * 6 : velocity;
      targetTension = Math.max(
        -TENSION_MAX,
        Math.min(TENSION_MAX, rawSpeed / 120)
      );

      // Smooth damped interpolation
      currentTension += (targetTension - currentTension) * TENSION_EASE;
      if (Math.abs(currentTension) < 0.0002) currentTension = 0;

      layout();

      // Hover detection
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(cards.map((c) => c.mesh));
      const newHovered = hits.length > 0 ? hits[0].object.userData.index : -1;

      if (newHovered !== hoveredIndex) {
        hoveredIndex = newHovered;

        if (hoveredIndex >= 0) {
          const item = cards[hoveredIndex]?.item;
          if (item) {
            const num = String(hoveredIndex + 1).padStart(3, '0');
            if (numEl) {
              numEl.textContent = num;
              numEl.style.opacity = '1';
            }
            if (clientEl) {
              clientEl.textContent = item.client || item.name || '';
              clientEl.style.opacity = '1';
            }
          }
        } else {
          if (numEl) numEl.style.opacity = '0';
          if (clientEl) clientEl.style.opacity = '0';
        }
      }

      renderer.render(scene, camera);
    }

    // ── Events ────────────────────────────────────────────────────────────────
    const onWheel = (e) => {
      e.preventDefault();
      isSnapping = false;
      clearTimeout(snapTimer);

      velocity = Math.max(-80, Math.min(80, velocity + e.deltaY * WHEEL_MULTI));

      snapTimer = setTimeout(snapToCenter, 400);
    };

    const onMouseDown = (e) => {
      isDragging = true;
      isSnapping = false;
      clearTimeout(snapTimer);

      dragStartX = e.clientX;
      dragOffsetStart = offset;
      lastDragX = e.clientX;
      dragVel = 0;

      renderer.domElement.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
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
      if (numEl) numEl.style.opacity = '0';
      if (clientEl) clientEl.style.opacity = '0';
      hoveredIndex = -1;
    };

    let tX = 0;
    let tLX = 0;
    let tV = 0;
    let tOS = 0;

    const onTouchStart = (e) => {
      isDragging = true;
      isSnapping = false;
      clearTimeout(snapTimer);

      tX = e.touches[0].clientX;
      tLX = tX;
      tOS = offset;
      tV = 0;
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
      velocity = Math.max(-80, Math.min(80, tV * 5));
      snapTimer = setTimeout(snapToCenter, 400);
    };

    const onResize = () => {
      const W2 = window.innerWidth;
      const H2 = window.innerHeight;

      renderer.setSize(W2, H2);

      camera.left = W2 / -2;
      camera.right = W2 / 2;
      camera.top = H2 / 2;
      camera.bottom = H2 / -2;
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mouseleave', onMouseLeave);

    renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: false });
    renderer.domElement.addEventListener('touchend', onTouchEnd);

    window.addEventListener('resize', onResize);

    renderer.domElement.style.cursor = 'grab';

    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then((r) => r.json())
      .then((data) => {
        cards = (data.items || []).map((item, i) => createCard(item, i));
        animate();
      })
      .catch(() => animate());

    return () => {
      cancelAnimationFrame(animId);
      clearTimeout(snapTimer);

      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mouseleave', onMouseLeave);

      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);

      window.removeEventListener('resize', onResize);

      cards.forEach((c) => {
        c.vid.pause();
        c.vid.src = '';

        const tex = c.mat.uniforms.uTexture.value;
        if (tex && typeof tex.dispose === 'function') tex.dispose();

        c.mesh.geometry.dispose();
        c.mat.dispose();
        scene.remove(c.mesh);
      });

      renderer.dispose();
      renderer.forceContextLoss();
      container.innerHTML = '';
    };
  }, []);

  return null;
}