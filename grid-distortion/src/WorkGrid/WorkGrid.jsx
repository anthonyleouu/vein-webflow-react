import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

const vertexShader = `
  uniform float time;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uDataTexture;
  uniform sampler2D uTexture;
  uniform vec4 resolution;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    vec4 offset = texture2D(uDataTexture, vUv);
    gl_FragColor = texture2D(uTexture, uv - 0.02 * offset.rg);
  }
`;

const GRID = 15;
const MOUSE_STRENGTH = 0.08;
const MOUSE_RADIUS = 0.1;
const RELAXATION = 0.9;
const BLAST_STRENGTH = 200; // tuned down from 500
const SCROLL_COOLDOWN = 800;

export default function WorkGrid({ onSwitchToList }) {
  const itemsRef = useRef([]);
  const videoRefs = useRef([]);
  const hlsRefs = useRef([]);
  const stateRef = useRef({
    currentIndex: 0,
    transitioning: false,
    mouseX: 0,
    mouseY: 0,
    prevMouseX: 0,
    prevMouseY: 0,
    mouseVX: 0,
    mouseVY: 0,
    renderer: null,
    scene: null,
    camera: null,
    plane: null,
    uniforms: null,
    dataTexture: null,
    animId: null,
    gridData: null,
    lastScrollTime: 0,
  });

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get GSAP scramble from window (loaded in Webflow)
  const scramble = useCallback((element, text) => {
    if (!element || !window.gsap || !window.ScrambleTextPlugin) return;
    window.gsap.to(element, {
      duration: 1.2,
      scrambleText: {
        text: text,
        chars: 'upperCase',
        speed: 0.85,
      },
    });
  }, []);

  // Update counter and title with scramble
  const updateUI = useCallback((item, index, total) => {
    const titleEl = document.querySelector('.title-name');
    const counterEl = document.querySelector('.work-counter');

    if (titleEl) scramble(titleEl, item.name.toUpperCase());
    if (counterEl) {
      const num = String(index + 1).padStart(2, '0');
      scramble(counterEl, `[PROJECT ${num}]`);
    }
  }, [scramble]);

  // Fetch work items
  useEffect(() => {
    fetch('https://vein-webflow-react.vercel.app/api/work')
      .then(r => r.json())
      .then(data => {
        const fetched = data.items || [];
        setItems(fetched);
        itemsRef.current = fetched;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Build video elements inside video-stack
  useEffect(() => {
    if (loading || !items.length) return;

    const stack = document.querySelector('.video-stack');
    if (!stack) return;

    // Clear placeholder
    stack.innerHTML = '';

    items.forEach((item, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'grid-video-item';
      wrapper.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        opacity: ${i === 0 ? 1 : 0};
        z-index: ${i === 0 ? 1 : 0};
        transition: opacity 0.1s;
      `;

      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      `;

      wrapper.appendChild(video);
      stack.appendChild(wrapper);
      videoRefs.current[i] = video;
    });

    // Set initial UI
    const titleEl = document.querySelector('.title-name');
    const counterEl = document.querySelector('.work-counter');
    if (titleEl) titleEl.textContent = items[0].name.toUpperCase();
    if (counterEl) counterEl.textContent = '[PROJECT 01]';

    // Load first video
    loadVideoTexture(0);
    // Preload second
    if (items.length > 1) preloadVideo(1);

  }, [loading, items]);

  // Load video texture
  const loadVideoTexture = useCallback((index) => {
    const s = stateRef.current;
    if (!s.uniforms) return;
    const allItems = itemsRef.current;
    if (!allItems.length) return;
    const item = allItems[index];
    if (!item?.videoUrl) return;
    const video = videoRefs.current[index];
    if (!video) return;

    video.crossOrigin = 'anonymous';
    video.src = item.videoUrl;
    video.load();

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    s.uniforms.uTexture.value = texture;

    video.addEventListener('canplay', () => {
      video.play().catch(() => {});
    }, { once: true });
  }, []);

  // Preload video silently
  const preloadVideo = useCallback((index) => {
    const allItems = itemsRef.current;
    const item = allItems[index];
    if (!item?.videoUrl) return;
    const video = videoRefs.current[index];
    if (!video || video.src) return;
    video.crossOrigin = 'anonymous';
    video.src = item.videoUrl;
    video.load();
  }, []);

  // Blast grid distortion
  const blast = useCallback(() => {
    const s = stateRef.current;
    const d = s.gridData;
    if (!d) return;
    for (let i = 0; i < GRID * GRID; i++) {
      d[i * 4] = (Math.random() - 0.5) * BLAST_STRENGTH;
      d[i * 4 + 1] = (Math.random() - 0.5) * BLAST_STRENGTH;
    }
    if (s.dataTexture) s.dataTexture.needsUpdate = true;
  }, []);

  // Navigate to index
  const navigateTo = useCallback((newIndex) => {
    const s = stateRef.current;
    const allItems = itemsRef.current;
    if (s.transitioning || !allItems.length) return;
    s.transitioning = true;

    const total = allItems.length;
    const wrapped = ((newIndex % total) + total) % total;
    const stack = document.querySelector('.video-stack');

    // Blast on exit
    blast();

    setTimeout(() => {
      // Hide current video
      if (stack) {
        const current = stack.children[s.currentIndex];
        if (current) { current.style.opacity = 0; current.style.zIndex = 0; }
      }

      // Pause current video
      const currentVideo = videoRefs.current[s.currentIndex];
      if (currentVideo) currentVideo.pause();

      // Blast on entry
      blast();

      setTimeout(() => {
        // Show new video
        if (stack) {
          const next = stack.children[wrapped];
          if (next) { next.style.opacity = 1; next.style.zIndex = 1; }
        }

        s.currentIndex = wrapped;
        loadVideoTexture(wrapped);
        updateUI(allItems[wrapped], wrapped, total);

        // Preload next
        const nextIdx = ((wrapped + 1) % total + total) % total;
        preloadVideo(nextIdx);

        setTimeout(() => { s.transitioning = false; }, 400);
      }, 50);
    }, 300);
  }, [blast, loadVideoTexture, updateUI, preloadVideo]);

  // Setup Three.js on work-canvas
  useEffect(() => {
    if (loading || !items.length) return;
    const s = stateRef.current;

    const canvasContainer = document.querySelector('.work-canvas');
    if (!canvasContainer) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    canvasContainer.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 0, 0, 0, -1000, 1000);
    camera.position.z = 2;

    const gridData = new Float32Array(4 * GRID * GRID);
    const dataTexture = new THREE.DataTexture(
      gridData, GRID, GRID, THREE.RGBAFormat, THREE.FloatType
    );
    dataTexture.needsUpdate = true;

    const uniforms = {
      time: { value: 0 },
      resolution: { value: new THREE.Vector4() },
      uTexture: { value: new THREE.Texture() },
      uDataTexture: { value: dataTexture },
    };

    const material = new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader,
      transparent: true, side: THREE.DoubleSide,
    });
    const geometry = new THREE.PlaneGeometry(1, 1, GRID - 1, GRID - 1);
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    s.renderer = renderer;
    s.scene = scene;
    s.camera = camera;
    s.plane = plane;
    s.uniforms = uniforms;
    s.dataTexture = dataTexture;
    s.gridData = gridData;

    const handleResize = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      renderer.setSize(W, H);
      const aspect = W / H;
      plane.scale.set(aspect, 1, 1);
      const frustumH = 1;
      const frustumW = frustumH * aspect;
      camera.left = -frustumW / 2;
      camera.right = frustumW / 2;
      camera.top = frustumH / 2;
      camera.bottom = -frustumH / 2;
      camera.updateProjectionMatrix();
      uniforms.resolution.value.set(W, H, 1, 1);
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // Now safe to load first video
    loadVideoTexture(0);

    const animate = () => {
      s.animId = requestAnimationFrame(animate);
      uniforms.time.value += 0.05;
      const d = gridData;

      for (let i = 0; i < GRID * GRID; i++) {
        d[i * 4] *= RELAXATION;
        d[i * 4 + 1] *= RELAXATION;
      }

      const gridMouseX = GRID * (s.mouseX / window.innerWidth);
      const gridMouseY = GRID * (1 - s.mouseY / window.innerHeight);
      const maxDist = GRID * MOUSE_RADIUS;

      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const distSq = Math.pow(gridMouseX - i, 2) + Math.pow(gridMouseY - j, 2);
          if (distSq < maxDist * maxDist) {
            const idx = 4 * (i + GRID * j);
            const power = Math.min(maxDist / Math.sqrt(distSq), 10);
            d[idx] += MOUSE_STRENGTH * 100 * s.mouseVX * power;
            d[idx + 1] -= MOUSE_STRENGTH * 100 * s.mouseVY * power;
          }
        }
      }

      dataTexture.needsUpdate = true;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(s.animId);
      window.removeEventListener('resize', handleResize);
      canvasContainer.innerHTML = '';
      renderer.dispose();
    };
  }, [loading, items, loadVideoTexture]);

  // Scroll handling
  useEffect(() => {
    if (!items.length) return;
    const s = stateRef.current;

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - s.lastScrollTime < SCROLL_COOLDOWN) return;
      if (s.transitioning) return;
      const delta = Math.abs(e.deltaY);
      if (delta < 30) return;
      s.lastScrollTime = now;
      const direction = e.deltaY > 0 ? 1 : -1;
      navigateTo(s.currentIndex + direction);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') navigateTo(s.currentIndex + 1);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') navigateTo(s.currentIndex - 1);
    };

    const wrapper = document.getElementById('work-grid-root');
    if (wrapper) wrapper.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (wrapper) wrapper.removeEventListener('wheel', handleWheel);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [items, navigateTo]);

  // Mouse tracking
  useEffect(() => {
    const s = stateRef.current;
    const handleMouseMove = (e) => {
      s.mouseVX = (e.clientX - s.prevMouseX) * 0.003;
      s.mouseVY = (e.clientY - s.prevMouseY) * 0.003;
      s.prevMouseX = s.mouseX;
      s.prevMouseY = s.mouseY;
      s.mouseX = e.clientX;
      s.mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Toggle handlers — wire up Webflow buttons
  useEffect(() => {
    const btnGrid = document.querySelector('.btn-grid');
    const btnList = document.querySelector('.btn-list');
    const gridWrap = document.querySelector('.work-grid-wrap');
    const listWrap = document.querySelector('.work-list-wrap');

    if (!btnGrid || !btnList) return;

    const showGrid = () => {
      if (gridWrap) gridWrap.style.display = 'block';
      if (listWrap) listWrap.style.display = 'none';
    };

    const showList = () => {
      if (gridWrap) gridWrap.style.display = 'none';
      if (listWrap) listWrap.style.display = 'block';
      onSwitchToList?.();
    };

    btnGrid.addEventListener('click', showGrid);
    btnList.addEventListener('click', showList);

    return () => {
      btnGrid.removeEventListener('click', showGrid);
      btnList.removeEventListener('click', showList);
    };
  }, [onSwitchToList]);

  // Click to open project — will trigger Barba.js later
  useEffect(() => {
    if (!items.length) return;
    const s = stateRef.current;
    const stack = document.querySelector('.video-stack');
    if (!stack) return;

    const handleClick = () => {
      if (s.transitioning) return;
      const item = itemsRef.current[s.currentIndex];
      if (item) {
        window.dispatchEvent(new CustomEvent('work:open', { detail: item }));
      }
    };

    stack.addEventListener('click', handleClick);
    return () => stack.removeEventListener('click', handleClick);
  }, [items]);

  // No JSX output — everything is in Webflow DOM
  return null;
}